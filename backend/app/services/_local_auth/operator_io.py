"""Keep machine-readable operator results separate from retained audit logging."""

import logging
import sys


def route_console_logs_to_stderr() -> None:
    for handler in logging.getLogger().handlers:
        if isinstance(handler, logging.StreamHandler) and handler.stream is sys.stdout:
            handler.setStream(sys.stderr)
