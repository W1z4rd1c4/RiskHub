#!/usr/bin/env python3
"""Thin CLI wrapper for the release parity audit package."""

from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from release_parity_audit.audit import ReleaseParityAudit
from release_parity_audit.cli import main
from release_parity_audit.types import CommandResult

__all__ = ["CommandResult", "ReleaseParityAudit", "main"]


if __name__ == "__main__":
    raise SystemExit(main())
