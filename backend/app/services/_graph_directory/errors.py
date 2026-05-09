from __future__ import annotations


class GraphDirectoryProviderError(RuntimeError):
    """Base error for Graph directory provider failures."""


class GraphProviderUnavailableError(GraphDirectoryProviderError):
    """Raised when Graph cannot be used because of config/network/auth failures."""


class GraphDependencyError(GraphProviderUnavailableError):
    """Raised when a required Graph dependency is unavailable."""


class GraphCredentialError(GraphProviderUnavailableError):
    """Raised when configured Graph credentials are invalid or incomplete."""


class GraphTokenAcquisitionError(GraphProviderUnavailableError):
    """Raised when Graph token acquisition returns an invalid or unsuccessful result."""


class GraphTransientError(GraphProviderUnavailableError):
    """Raised when a transient Graph auth dependency failure occurs."""


class GraphUserNotFoundError(GraphDirectoryProviderError):
    """Raised when a specific directory user does not exist."""
