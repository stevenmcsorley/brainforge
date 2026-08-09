"""Simulation worker entry point.

Connects to Redis, picks BullMQ simulation jobs, and runs them using the engine.

Communication flow:
  BullMQ Queue → Worker → Engine → Redis Pub/Sub (telemetry events)
  Worker → API  (status PATCH calls)
  Worker → API  (POST /admin/runs/:id/events for metric persistence)
"""

import os
import sys
import json
import time
import logging
import signal
import threading
from pathlib import Path

import redis
import requests
import numpy as np

# Add python engine to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "python"))

from engine.core.types import BrainModel, SimConfig, Stimulus, Region
from engine.core.runner import SimulationRunner
from engine.adapters.registry import get_backend

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(name)s %(levelname)s: %(message)s",
)
logger = logging.getLogger("sim-worker")

REDIS_URL = os.environ.get("SIM_WORKER_REDIS_URL", "redis://localhost:6379")
API_URL = os.environ.get("SIM_WORKER_API_URL", "http://localhost:3001")
STORAGE_PATH = os.environ.get("SIM_WORKER_STORAGE_PATH", "./storage")

# BullMQ v4+ key pattern for the "simulation" queue
BULLMQ_WAIT_KEY = "bull:simulation:wait"
BULLMQ_ACTIVE_KEY = "bull:simulation:active"


class SimWorker:
    """Processes simulation jobs from the BullMQ Redis queue.

    Uses raw Redis BRPOPLPUSH to atomically move jobs from wait → active,
    matching BullMQ's internal queue protocol for reliability.
    """

    def __init__(self):
        self.redis = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        self.redis_binary = redis.Redis.from_url(REDIS_URL, decode_responses=False)
        self.running = True
        self.current_runner: SimulationRunner | None = None

        signal.signal(signal.SIGTERM, self._handle_signal)
        signal.signal(signal.SIGINT, self._handle_signal)

    def _handle_signal(self, signum, frame):
        logger.info("Signal %d received — stopping after current job.", signum)
        self.running = False
        if self.current_runner:
            self.current_runner.stop()

    def start(self):
        """Main polling loop."""
        logger.info("Simulation worker started.")
        logger.info("  Redis:   %s", REDIS_URL)
        logger.info("  API:     %s", API_URL)
        logger.info("  Storage: %s", STORAGE_PATH)

        # Wait for API to be reachable before polling
        self._wait_for_api()

        # Recover any jobs stuck in active from a previous crashed worker
        stuck = self.redis.lrange(BULLMQ_ACTIVE_KEY, 0, -1)
        for job_id_bytes in stuck:
            job_id_str = job_id_bytes.decode() if isinstance(job_id_bytes, bytes) else job_id_bytes
            logger.warning("Recovering stuck job %s → moving back to wait", job_id_str)
            self.redis.lrem(BULLMQ_ACTIVE_KEY, 0, job_id_bytes)
            self.redis.lpush(BULLMQ_WAIT_KEY, job_id_bytes)

        while self.running:
            try:
                # BRPOPLPUSH atomically moves job ID from wait → active list.
                # BullMQ stores job IDs (not full JSON) in the list.
                # The full job data is in the Hash: bull:simulation:{jobId}
                raw = self.redis.brpoplpush(
                    BULLMQ_WAIT_KEY, BULLMQ_ACTIVE_KEY, timeout=2
                )
                if raw is None:
                    continue

                # raw is a bytes job ID, e.g. b'e2a2dfac-...'
                job_id = raw.decode() if isinstance(raw, bytes) else raw

                # Fetch job data from the BullMQ job Hash
                job_key = f"bull:simulation:{job_id}"
                job_hash = self.redis.hgetall(job_key)
                if not job_hash:
                    logger.error("Job hash missing for job_id=%s — skipping", job_id)
                    self.redis.lrem(BULLMQ_ACTIVE_KEY, 0, raw)
                    continue

                # Decode hash values from bytes if needed
                def _d(v: bytes | str) -> str:
                    return v.decode() if isinstance(v, bytes) else v

                data_json = _d(job_hash.get(b"data") or job_hash.get("data") or b"{}")
                payload = json.loads(data_json)

                logger.info("Job %s received (run: %s)", job_id, payload.get("runId"))
                self._process_job(payload, raw)

            except redis.ConnectionError:
                logger.error("Redis connection lost, retrying in 5s...")
                time.sleep(5)
            except Exception as e:
                logger.exception("Unexpected worker error: %s", e)
                time.sleep(1)

        logger.info("Worker stopped cleanly.")


    def _wait_for_api(self, max_retries: int = 30, interval: float = 2.0):
        """Block until the API health endpoint returns 200."""
        for i in range(max_retries):
            try:
                resp = requests.get(f"{API_URL}/api/admin/health", timeout=5)
                if resp.status_code == 200:
                    logger.info("API reachable at %s", API_URL)
                    return
            except Exception:
                pass
            logger.info("Waiting for API... (%d/%d)", i + 1, max_retries)
            time.sleep(interval)
        logger.warning("API not reachable after %d attempts, continuing anyway.", max_retries)

    def _process_job(self, payload: dict, raw_job: str):
        """Execute a single simulation job end-to-end."""
        run_id = payload["runId"]
        model_id = payload["modelId"]
        config_data = payload.get("config", {})
        seed = payload.get("seed", 42)

        # A run can be cancelled while queued, before any worker is listening on
        # its command channel. The API sets this flag; honour it before starting.
        if self._is_cancelled(run_id):
            logger.info("Run %s was cancelled while queued — skipping.", run_id)
            self.redis.lrem(BULLMQ_ACTIVE_KEY, 1, raw_job)
            self.redis.delete(f"brainforge:run:{run_id}:cancelled")
            return

        try:
            self._patch_status(run_id, "initializing")

            model = self._fetch_model(model_id)

            # Build stimuli list from config
            stimuli = []
            for s in config_data.get("stimuli", []):
                stimuli.append(Stimulus(
                    target_indices=s.get("targets", s.get("targetRegions", [])),
                    stimulus_type=s.get("type", "constant"),
                    amplitude=float(s.get("amplitude", 0)),
                    start_time=float(s.get("startTime", s.get("start_time", 0))),
                    end_time=float(s.get("endTime", s.get("end_time", float("inf")))),
                    parameters=s.get("parameters", {}),
                ))

            sim_config = SimConfig(
                backend=config_data.get("backend", "rate_based"),
                duration=float(config_data.get("duration", 1.0)),
                dt=float(config_data.get("dt", 0.001)),
                seed=int(seed),
                report_interval=int(config_data.get("reportInterval", 10)),
                checkpoint_interval=config_data.get("checkpointInterval"),
                parameters=config_data.get("parameters", {}),
                stimuli=stimuli,
            )

            backend = get_backend(sim_config.backend)
            run_storage = Path(STORAGE_PATH) / "runs" / run_id

            self.current_runner = SimulationRunner(
                backend=backend,
                model=model,
                config=sim_config,
                run_id=run_id,
                storage_path=str(run_storage),
                on_event=lambda event: self._on_event(run_id, event),
            )

            # Subscribe to pause/resume/stop commands in background thread
            self._listen_for_commands(run_id)

            self._patch_status(run_id, "running")
            summary = self.current_runner.run()

            final_status = summary.get("status", "completed")
            self._patch_status(
                run_id,
                final_status,
                progress=1.0 if final_status == "completed" else None,
                error=summary.get("error"),
            )

            # Save per-region activity map into run metadata for visualization
            activity_map = summary.get("activityMap")
            if activity_map:
                self._save_activity_map(run_id, activity_map)

        except Exception as e:
            logger.exception("Job failed for run %s: %s", run_id, e)
            self._patch_status(run_id, "failed", error=str(e))
            self._publish_event(run_id, {
                "type": "run_error",
                "runId": run_id,
                "error": str(e),
                "fatal": True,
                "timestamp": time.time(),
            })
        finally:
            self.current_runner = None
            # Remove from active list
            self.redis.lrem(BULLMQ_ACTIVE_KEY, 1, raw_job)
            try:
                self.redis.delete(f"brainforge:run:{run_id}:cancelled")
            except Exception:
                pass  # TTL will reap it

    def _is_cancelled(self, run_id: str) -> bool:
        """Check the API-set cancellation flag for a run."""
        try:
            return self.redis.get(f"brainforge:run:{run_id}:cancelled") is not None
        except Exception as e:
            logger.error("Failed to read cancel flag for %s: %s", run_id, e)
            return False

    def _fetch_model(self, model_id: str) -> BrainModel:
        """Fetch model, regions, and connectivity from the API."""
        model_data = self._api_get(f"/api/models/{model_id}")
        regions_data = self._api_get(f"/api/models/{model_id}/regions")
        connections_data = self._api_get(f"/api/models/{model_id}/connectivity")

        # Sort regions by atlas index for consistent ordering
        sorted_regions = sorted(regions_data, key=lambda r: r.get("atlasIndex", 0))
        region_id_to_idx = {r["id"]: i for i, r in enumerate(sorted_regions)}

        regions = [
            Region(
                id=r["id"],
                name=r["name"],
                index=i,
                hemisphere=r.get("hemisphere"),
                coordinates=(
                    (r.get("coordX", 0.0), r.get("coordY", 0.0), r.get("coordZ", 0.0))
                    if r.get("coordX") is not None else None
                ),
            )
            for i, r in enumerate(sorted_regions)
        ]

        n = len(regions)
        connectivity_matrix = np.zeros((n, n), dtype=np.float64)
        delay_matrix = np.zeros((n, n), dtype=np.float64)

        for conn in connections_data:
            src = region_id_to_idx.get(conn.get("sourceRegionId"))
            tgt = region_id_to_idx.get(conn.get("targetRegionId"))
            if src is not None and tgt is not None:
                connectivity_matrix[src, tgt] = float(conn.get("weight", 0))
                delay_matrix[src, tgt] = float(conn.get("delay", 0))

        return BrainModel(
            id=model_id,
            name=model_data["name"],
            regions=regions,
            connectivity_matrix=connectivity_matrix,
            delay_matrix=delay_matrix,
            parameters=model_data.get("parameters") or {},
        )

    def _api_get(self, path: str) -> dict | list:
        resp = requests.get(f"{API_URL}{path}", timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _patch_status(
        self,
        run_id: str,
        status: str,
        progress: float | None = None,
        error: str | None = None,
    ):
        """PATCH /api/runs/:id/status — update run metadata in the database."""
        body: dict = {"status": status}
        if progress is not None:
            body["progress"] = progress
        if error is not None:
            body["error"] = error
        try:
            resp = requests.patch(
                f"{API_URL}/api/runs/{run_id}/status",
                json=body,
                timeout=10,
            )
            resp.raise_for_status()
            logger.info("Run %s → %s", run_id, status)
        except Exception as e:
            logger.error("Failed to PATCH run status: %s", e)

    def _save_activity_map(self, run_id: str, activity_map: dict):
        """PATCH per-region activity map into run metadata for visualization."""
        try:
            resp = requests.patch(
                f"{API_URL}/api/runs/{run_id}/activity-map",
                json={"activityMap": activity_map},
                timeout=30,
            )
            resp.raise_for_status()
            logger.info("Run %s: activity map saved (%d regions)", run_id, activity_map.get("nRegions", 0))
        except Exception as e:
            logger.error("Failed to save activity map for run %s: %s", run_id, e)

    def _on_event(self, run_id: str, event: dict):
        """Handle a telemetry event from the simulation runner."""
        self._publish_event(run_id, event)
        # Persist metric events to the database via API
        if event.get("type") == "run_metric":
            self._persist_metric(run_id, event)
        elif event.get("type") in ("run_completed", "run_error"):
            self._persist_event(run_id, event)

    def _publish_event(self, run_id: str, event: dict):
        """Publish telemetry event to Redis Pub/Sub for WebSocket fanout."""
        channel = f"brainforge:run:{run_id}:events"
        try:
            self.redis.publish(channel, json.dumps(event, default=str))
        except Exception as e:
            logger.error("Pub/Sub publish failed: %s", e)

    def _persist_metric(self, run_id: str, event: dict):
        """POST metric data to the API for DB persistence."""
        try:
            requests.post(
                f"{API_URL}/api/runs/{run_id}/metrics",
                json={
                    "step": event.get("step", 0),
                    "timestamp": event.get("timestamp", time.time()),
                    "metrics": event.get("metrics", {}),
                },
                timeout=5,
            )
        except Exception as e:
            logger.debug("Metric persist failed (non-fatal): %s", e)

    def _persist_event(self, run_id: str, event: dict):
        """POST a lifecycle event to the API for DB persistence."""
        try:
            requests.post(
                f"{API_URL}/api/runs/{run_id}/events",
                json={"type": event["type"], "payload": event},
                timeout=5,
            )
        except Exception as e:
            logger.debug("Event persist failed (non-fatal): %s", e)

    def _listen_for_commands(self, run_id: str):
        """Background thread listening for pause/resume/stop commands."""
        def _listener():
            sub_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
            channel = f"brainforge:run:{run_id}:events"
            pubsub = sub_client.pubsub()
            pubsub.subscribe(channel)
            try:
                for message in pubsub.listen():
                    if not self.running or self.current_runner is None:
                        break
                    if message["type"] != "message":
                        continue
                    try:
                        evt = json.loads(message["data"])
                        if evt.get("type") == "run_command":
                            cmd_raw = evt.get("command")
                            cmd_val = cmd_raw if isinstance(cmd_raw, str) else cmd_raw.get("command")
                            logger.info("Command '%s' → run %s", cmd_val, run_id)
                            
                            if cmd_val == "pause" and self.current_runner:
                                self.current_runner.pause()
                            elif cmd_val == "resume" and self.current_runner:
                                self.current_runner.resume()
                            elif cmd_val == "stop" and self.current_runner:
                                self.current_runner.stop()
                                break
                            elif cmd_val == "stimulus" and self.current_runner and isinstance(cmd_raw, dict):
                                node = int(cmd_raw.get("node", 0))
                                value = float(cmd_raw.get("value", 0.0))
                                self.current_runner.set_live_input(node, value)
                            elif cmd_val == "reward" and self.current_runner and isinstance(cmd_raw, dict):
                                value = float(cmd_raw.get("value", 1.0))
                                self.current_runner.set_live_input("global_reward", value)
                    except Exception:
                        pass
            finally:
                pubsub.close()
                sub_client.close()

        t = threading.Thread(target=_listener, daemon=True)
        t.start()


def main():
    worker = SimWorker()
    worker.start()


if __name__ == "__main__":
    main()
