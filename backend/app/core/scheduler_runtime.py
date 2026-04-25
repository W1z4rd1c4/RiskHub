def get_scheduler_role_status(
    *,
    scheduler_enabled: bool,
    scheduler_running: bool,
    lock_acquired: bool,
) -> dict[str, str]:
    if not scheduler_enabled:
        return {
            "scheduler_role": "disabled",
            "scheduler_status": "disabled",
        }

    if scheduler_running and lock_acquired:
        return {
            "scheduler_role": "leader",
            "scheduler_status": "leader_running",
        }

    if not scheduler_running and not lock_acquired:
        return {
            "scheduler_role": "follower",
            "scheduler_status": "follower_ready",
        }

    return {
        "scheduler_role": "leader" if lock_acquired else "follower",
        "scheduler_status": "error",
    }


outbox_dispatch_state: dict[str, object | None] = {
    "last_started_at": None,
    "last_finished_at": None,
    "last_status": None,
    "last_processed": None,
    "last_error": None,
}


def get_outbox_dispatch_runtime_state() -> dict[str, object | None]:
    return {
        "last_started_at": outbox_dispatch_state["last_started_at"],
        "last_finished_at": outbox_dispatch_state["last_finished_at"],
        "last_status": outbox_dispatch_state["last_status"],
        "last_processed": outbox_dispatch_state["last_processed"],
        "last_error": outbox_dispatch_state["last_error"],
    }
