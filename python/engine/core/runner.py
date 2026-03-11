from typing import Union
"""Simulation runner — orchestrates the simulation lifecycle.

The runner is the main entry point for executing a simulation. It:
1. Initializes the chosen backend
2. Runs the simulation loop (step → observe → emit → checkpoint)
3. Handles pause/resume/stop commands
4. Publishes telemetry events
5. Saves artifacts (traces, checkpoints, summary)

The runner is backend-agnostic — it works with any SimulationBackend
implementation through the abstract interface.
"""

import time
import json
import logging
from typing import Callable, Optional
from pathlib import Path
import numpy as np

from .backend import SimulationBackend
from .types import BrainModel, SimConfig

logger = logging.getLogger(__name__)


class SimulationRunner:
    """Runs a simulation to completion, emitting events along the way."""

    def __init__(
        self,
        backend: SimulationBackend,
        model: BrainModel,
        config: SimConfig,
        run_id: str,
        storage_path: Optional[str] = None,
        on_event: Optional[Callable[[dict], None]] = None,
    ):
        self.backend = backend
        self.model = model
        self.config = config
        self.run_id = run_id
        self.storage_path = Path(storage_path) if storage_path else None
        self.on_event = on_event or (lambda e: None)

        self._paused = False
        self._stopped = False
        self._current_step = 0

        # Collected traces for artifact storage
        self._activity_traces: list[np.ndarray] = []
        self._metric_history: list[dict] = []

        # Real-time WebSocket inputs {node_index: amplitude} or global modulators
        self._live_inputs: dict[Union[int, str], float] = {}

    def set_live_input(self, node_idx_or_key: Union[int, str], amplitude: float):
        """Inject a live current into a specific region or set a global param during the next step."""
        self._live_inputs[node_idx_or_key] = amplitude

    def pause(self):
        self._paused = True

    def resume(self):
        self._paused = False

    def stop(self):
        self._stopped = True

    def run(self) -> dict:

        """Execute the simulation and return a summary dict."""
        start_wall = time.monotonic()

        # Validate model
        errors = self.model.validate()
        if errors:
            self._emit({
                "type": "run_error",
                "runId": self.run_id,
                "error": f"Model validation failed: {'; '.join(errors)}",
                "fatal": True,
                "timestamp": time.time(),
            })
            return {"status": "failed", "errors": errors}

        # Initialize
        self.backend.init(self.model, self.config)
        self.backend.reset(self.config.seed)

        total_steps = self.config.total_steps
        dt = self.config.dt

        self._emit({
            "type": "run_started",
            "runId": self.run_id,
            "experimentId": "",
            "config": {
                "backend": self.config.backend,
                "duration": self.config.duration,
                "dt": dt,
                "totalSteps": total_steps,
                "seed": self.config.seed,
            },
            "timestamp": time.time(),
        })

        warnings_count = 0
        peak_memory_estimate = 0.0

        try:
            for step in range(total_steps):
                if self._stopped:
                    break

                # Handle pause
                while self._paused and not self._stopped:
                    time.sleep(0.05)

                if self._stopped:
                    break

                self._current_step = step
                sim_time = step * dt

                # Apply any active stimuli
                for stim in self.config.stimuli:
                    if stim.start_time <= sim_time <= stim.end_time:
                        self.backend.apply_stimulus(stim)

                # Apply live WebSocket inputs
                if self._live_inputs:
                    global_inputs = {}
                    for key, amp in self._live_inputs.items():
                        if isinstance(key, str):
                            global_inputs[key] = amp
                        elif isinstance(key, int) and amp != 0:
                            from .types import Stimulus
                            self.backend.apply_stimulus(Stimulus(
                                target_indices=[key],
                                stimulus_type="constant",
                                amplitude=amp,
                                start_time=0, end_time=float('inf')
                            ))
                    if global_inputs:
                        self.backend.set_live_input(global_inputs)

                # Step the simulation
                self.backend.step(dt)

                # Observe and emit metrics at report interval
                if step % self.config.report_interval == 0 or step == total_steps - 1:
                    obs = self.backend.observe()
                    activity = obs.get("activity", np.array([]))
                    diagnostics = self.backend.get_diagnostics()

                    metrics = {
                        "mean_activity": float(np.mean(activity)) if len(activity) > 0 else 0.0,
                        "std_activity": float(np.std(activity)) if len(activity) > 0 else 0.0,
                        "max_activity": float(np.max(activity)) if len(activity) > 0 else 0.0,
                        **diagnostics,
                    }

                    # Check for instability
                    if metrics.get("mean_activity", 0) > 0.99 or metrics.get("std_activity", 0) < 1e-10:
                        warnings_count += 1
                        if warnings_count <= 5:  # don't flood
                            self._emit({
                                "type": "run_warning",
                                "runId": self.run_id,
                                "message": "Potential instability detected: activity may be saturating or collapsing",
                                "details": metrics,
                                "timestamp": time.time(),
                            })

                    self._emit({
                        "type": "run_metric",
                        "runId": self.run_id,
                        "step": step,
                        "metrics": {
                            **metrics,
                            # std across regions at this timestep — key for seeing brain state differentiation:
                            # Coma: ~0 (all regions flat), Seizure: high (regions diverge)
                            "std_across_regions": float(np.std(activity)) if len(activity) > 0 else 0.0,
                        },
                        "regionActivity": activity.tolist() if len(activity) > 0 else [],
                        "timestamp": time.time(),
                    })

                    self._metric_history.append({
                        "step": step,
                        "sim_time": sim_time,
                        **metrics,
                        "std_across_regions": float(np.std(activity)) if len(activity) > 0 else 0.0,
                    })

                    # Store trace snapshot
                    if len(activity) > 0:
                        self._activity_traces.append(activity.copy())

                # Emit progress
                if step % (self.config.report_interval * 10) == 0:
                    progress = step / total_steps
                    elapsed = time.monotonic() - start_wall
                    self._emit({
                        "type": "run_progress",
                        "runId": self.run_id,
                        "step": step,
                        "totalSteps": total_steps,
                        "progress": progress,
                        "elapsed": elapsed,
                        "timestamp": time.time(),
                    })

                # Checkpoint
                if (
                    self.config.checkpoint_interval
                    and step > 0
                    and step % self.config.checkpoint_interval == 0
                ):
                    self._save_checkpoint(step)

        except Exception as e:
            logger.exception("Simulation error at step %d", self._current_step)
            self._emit({
                "type": "run_error",
                "runId": self.run_id,
                "error": str(e),
                "fatal": True,
                "timestamp": time.time(),
            })
            self.backend.shutdown()
            return {
                "status": "failed",
                "error": str(e),
                "completedSteps": self._current_step,
            }

        wall_time = time.monotonic() - start_wall
        status = "cancelled" if self._stopped else "completed"

        # Save final artifacts
        self._save_artifacts()

        summary = {
            "status": status,
            "totalSteps": self._current_step + 1,
            "wallTimeMs": wall_time * 1000,
            "simTimeSec": self._current_step * dt,
            "meanActivity": float(np.mean([m.get("mean_activity", 0) for m in self._metric_history])) if self._metric_history else 0,
            "warnings": warnings_count,
            "errors": 0,
        }

        # Per-region activity maps for visualization
        if self._activity_traces:
            traces_array = np.stack(self._activity_traces)  # (timesteps, regions)
            region_mean = np.mean(traces_array, axis=0)     # (regions,)
            region_max  = np.max(traces_array, axis=0)      # (regions,)
            region_std  = np.std(traces_array, axis=0)      # (regions,)
            final_state = traces_array[-1]                  # (regions,) — last timestep
            summary["activityMap"] = {
                "regionMean":  region_mean.tolist(),
                "regionMax":   region_max.tolist(),
                "regionStd":   region_std.tolist(),
                "finalState":  final_state.tolist(),
                "nRegions":    int(traces_array.shape[1]),
                "nTimepoints": int(traces_array.shape[0]),
            }

        self._emit({
            "type": "run_completed",
            "runId": self.run_id,
            "summary": summary,
            "timestamp": time.time(),
        })

        self.backend.shutdown()
        return summary

    def _emit(self, event: dict):
        """Emit a telemetry event."""
        try:
            self.on_event(event)
        except Exception as e:
            logger.error("Failed to emit event: %s", e)

    def _save_checkpoint(self, step: int):
        """Save a checkpoint to storage."""
        if not self.storage_path:
            return
        try:
            ckpt_dir = self.storage_path / "checkpoints"
            ckpt_dir.mkdir(parents=True, exist_ok=True)
            data = self.backend.save_checkpoint()
            ckpt_path = ckpt_dir / f"checkpoint_{step:08d}.pkl"
            ckpt_path.write_bytes(data)

            self._emit({
                "type": "run_checkpoint",
                "runId": self.run_id,
                "step": step,
                "checkpointId": ckpt_path.name,
                "timestamp": time.time(),
            })
        except Exception as e:
            logger.error("Failed to save checkpoint at step %d: %s", step, e)

    def _save_artifacts(self):
        """Save traces, metrics, and summary to storage."""
        if not self.storage_path:
            return
        try:
            self.storage_path.mkdir(parents=True, exist_ok=True)

            # Save activity traces
            if self._activity_traces:
                traces_path = self.storage_path / "traces"
                traces_path.mkdir(exist_ok=True)
                traces_array = np.stack(self._activity_traces)
                np.savez_compressed(
                    traces_path / "activity_traces.npz",
                    traces=traces_array,
                    region_names=[r.name for r in self.model.regions],
                )

            # Save metrics history
            if self._metric_history:
                metrics_path = self.storage_path / "metrics.json"
                metrics_path.write_text(json.dumps(self._metric_history, indent=2))

        except Exception as e:
            logger.error("Failed to save artifacts: %s", e)
