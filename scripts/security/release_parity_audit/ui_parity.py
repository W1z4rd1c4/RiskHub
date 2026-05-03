"""UI parity evaluation helpers for release parity audit."""

from __future__ import annotations

import json
from typing import Any


def evaluate_ui_parity(runtime_fingerprints: list[dict[str, Any]]) -> dict[str, Any]:
    contexts = []
    for fp in runtime_fingerprints:
        shot = fp.get("screenshot")
        shot_hash = fp.get("screenshot_sha256")
        auth_mode = fp.get("auth_mode") or fp.get("auth_mode_reference")
        if shot and shot_hash:
            contexts.append(
                {
                    "context_id": fp.get("context_id"),
                    "startup_path_id": fp.get("startup_path_id"),
                    "auth_mode": auth_mode,
                    "app_version": fp.get("app_version"),
                    "git_sha_observed": fp.get("git_sha_observed"),
                    "frontend_runtime_kind": fp.get("frontend_runtime_kind"),
                    "screenshot": shot,
                    "screenshot_sha256": shot_hash,
                    "ui_state": fp.get("ui_state"),
                }
            )

    groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = {}
    for item in contexts:
        key = (
            str(item.get("auth_mode")),
            str(item.get("app_version")),
            str(item.get("git_sha_observed")),
            str(item.get("frontend_runtime_kind")),
        )
        groups.setdefault(key, []).append(item)

    mismatches = []
    visual_variance_same_state = []
    for key, items in groups.items():
        hashes = {entry["screenshot_sha256"] for entry in items}
        if len(items) > 1 and len(hashes) > 1:
            state_signatures = {json.dumps(entry.get("ui_state"), sort_keys=True) for entry in items}
            item_payload = {
                "group_key": {
                    "auth_mode": key[0],
                    "app_version": key[1],
                    "git_sha_observed": key[2],
                    "frontend_runtime_kind": key[3],
                },
                "contexts": items,
            }
            if len(state_signatures) > 1:
                mismatches.append(item_payload)
            else:
                visual_variance_same_state.append(item_payload)

    return {
        "captured_contexts": contexts,
        "mismatches_same_auth_mode_same_commit": mismatches,
        "visual_variance_same_state": visual_variance_same_state,
    }
