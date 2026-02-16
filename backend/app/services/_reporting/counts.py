def count_high_risks(risks, high_threshold: int) -> int:
    """Count risks with net_probability * net_impact >= high_threshold.

    Used by threshold propagation tests and report summaries.
    """
    total = 0
    for r in risks:
        prob = getattr(r, "net_probability", 0) or 0
        impact = getattr(r, "net_impact", 0) or 0
        if (prob * impact) >= high_threshold:
            total += 1
    return total

