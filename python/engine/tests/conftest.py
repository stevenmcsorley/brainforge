"""pytest configuration for the BRAINFORGE Python engine tests.

Adds the python/ directory to sys.path so that 'import engine.*' works
regardless of where pytest is invoked from.
"""

import sys
from pathlib import Path

# python/ directory relative to this conftest.py
PYTHON_DIR = Path(__file__).parent.parent.parent  # python/engine/tests/../../../ = python/
sys.path.insert(0, str(PYTHON_DIR))
