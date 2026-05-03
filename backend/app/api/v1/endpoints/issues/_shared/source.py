"""Compatibility Adapter for issue source-link mutation helpers."""

from app.services._issue_register.source_mutation import (
    ResolvedIssueSource,
    clear_issue_source_links,
    ensure_issue_source_link,
    resolve_contextual_issue_source,
    resolve_issue_source_metadata,
)

__all__ = [
    "ResolvedIssueSource",
    "clear_issue_source_links",
    "ensure_issue_source_link",
    "resolve_contextual_issue_source",
    "resolve_issue_source_metadata",
]
