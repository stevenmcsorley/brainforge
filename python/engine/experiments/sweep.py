"""Parameter sweep utilities for batch experiment execution.

A ParameterSweep defines a set of config variations to run over a base config.
Supports grid sweeps (Cartesian product) and random sweeps (random samples).
"""

import copy
import itertools
import random
from dataclasses import dataclass, field
from typing import Any, Dict, Generator, List, Optional


@dataclass
class SweepResult:
    """Result of a single parameter sweep point."""
    params: Dict[str, Any]
    run_id: str
    status: str
    summary: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class ParameterSweep:
    """Defines a parameter sweep over a base experiment config.
    
    Example::
    
        sweep = ParameterSweep(
            base_config={"backend": "rate_based", "duration": 2.0, "dt": 0.001},
            axes={
                "parameters.gain": [1.0, 1.5, 2.0],
                "parameters.tau": [0.01, 0.02],
            }
        )
        for point in sweep.grid_points():
            print(point)  # {"parameters.gain": 1.0, "parameters.tau": 0.01}, etc.
    """
    base_config: Dict[str, Any]
    axes: Dict[str, List[Any]]
    name: str = "sweep"
    description: str = ""
    results: List[SweepResult] = field(default_factory=list)

    def grid_points(self) -> Generator[Dict[str, Any], None, None]:
        """Yield all points in the Cartesian product of all axis values."""
        keys = list(self.axes.keys())
        values = list(self.axes.values())
        for combo in itertools.product(*values):
            yield dict(zip(keys, combo))

    def random_points(self, n: int, seed: Optional[int] = None) -> Generator[Dict[str, Any], None, None]:
        """Yield `n` random points, sampling uniformly from each axis."""
        rng = random.Random(seed)
        keys = list(self.axes.keys())
        for _ in range(n):
            yield {k: rng.choice(self.axes[k]) for k in keys}

    def apply_point(self, point: Dict[str, Any]) -> Dict[str, Any]:
        """Merge a sweep point into the base config.
        
        Supports dot-notation for nested keys, e.g. 'parameters.gain' sets
        config['parameters']['gain'] = value.
        """
        config = copy.deepcopy(self.base_config)
        for key, value in point.items():
            parts = key.split(".")
            d = config
            for part in parts[:-1]:
                d = d.setdefault(part, {})
            d[parts[-1]] = value
        return config

    def n_points(self) -> int:
        """Return total number of grid points."""
        total = 1
        for vals in self.axes.values():
            total *= len(vals)
        return total


def grid_sweep(
    base_config: Dict[str, Any],
    axes: Dict[str, List[Any]],
    name: str = "grid_sweep",
) -> ParameterSweep:
    """Convenience constructor for a grid sweep."""
    return ParameterSweep(base_config=base_config, axes=axes, name=name)


def random_sweep(
    base_config: Dict[str, Any],
    axes: Dict[str, List[Any]],
    n: int = 20,
    name: str = "random_sweep",
) -> ParameterSweep:
    """Convenience constructor for a random sweep."""
    return ParameterSweep(base_config=base_config, axes=axes, name=name)
