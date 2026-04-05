from __future__ import annotations


class GraphDirectoryProviderError(RuntimeError):
    """Base error for Graph directory provider failures."""


class GraphProviderUnavailableError(GraphDirectoryProviderError):
    """Raised when Graph cannot be used because of config/network/auth failures."""


class GraphUserNotFoundError(GraphDirectoryProviderError):
    """Raised when a specific directory user does not exist."""
