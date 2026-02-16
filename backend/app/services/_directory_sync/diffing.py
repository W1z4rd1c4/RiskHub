def _diff_field(changes: dict, field: str, old, new) -> None:
    if old != new:
        changes[field] = {"old": old, "new": new}

