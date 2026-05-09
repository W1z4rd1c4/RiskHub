"""Microsoft Graph directory provider adapter package."""

from .auth import GraphAccessTokenProvider, reset_graph_token_cache_for_tests
from .errors import (
    GraphCredentialError,
    GraphDependencyError,
    GraphDirectoryProviderError,
    GraphProviderUnavailableError,
    GraphTokenAcquisitionError,
    GraphTransientError,
    GraphUserNotFoundError,
)
from .service import GraphDirectoryService
from .transport import GraphApiTransport

__all__ = [
    "GraphAccessTokenProvider",
    "GraphApiTransport",
    "GraphCredentialError",
    "GraphDependencyError",
    "GraphDirectoryProviderError",
    "GraphDirectoryService",
    "GraphProviderUnavailableError",
    "GraphTokenAcquisitionError",
    "GraphTransientError",
    "GraphUserNotFoundError",
    "reset_graph_token_cache_for_tests",
]
