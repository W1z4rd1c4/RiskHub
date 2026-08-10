from __future__ import annotations

import csv
from datetime import date
from io import StringIO

import pytest

from app.services._monitoring_status.export_rows import apply_kri_monitoring_rows
from app.services._monitoring_status.types import KRIMonitoringConfig
from app.services._reporting.kri_issue_register_export import (
    render_issue_register_csv,
    render_kri_register_csv,
)


async def _csv_rows(response) -> list[dict[str, str]]:
    chunks = []
    async for chunk in response.body_iterator:
        chunks.append(chunk.encode() if isinstance(chunk, str) else chunk)
    return list(csv.DictReader(StringIO(b"".join(chunks).decode("utf-8-sig"))))


@pytest.mark.asyncio
async def test_kri_register_csv_emits_timeliness_code_and_localized_label_pairs():
    monitoring_rows = apply_kri_monitoring_rows(
        [
            {
                "metric_name": "Due-soon KRI",
                "current_value": 50,
                "lower_limit": 0,
                "upper_limit": 100,
                "breach_status": "within",
                "frequency": "monthly",
                "last_period_end": date(2026, 6, 30),
            }
        ],
        config=KRIMonitoringConfig(warning_upper_margin_ratio=0.1),
        as_of_date=date(2026, 7, 30),
    )
    assert monitoring_rows[0]["timeliness_status"] == "due_soon"

    en_row = (await _csv_rows(render_kri_register_csv(monitoring_rows, locale="en")))[0]
    cs_row = (await _csv_rows(render_kri_register_csv(monitoring_rows, locale="cs")))[0]
    assert en_row["timeliness_status_code"] == cs_row["timeliness_status_code"] == "due_soon"
    assert en_row["timeliness_status_label"] == "Due soon"
    assert cs_row["timeliness_status_label"] == "Brzy splatné"
    assert en_row["breach_code"] == cs_row["breach_code"] == "within"
    assert en_row["breach_label"] == "Within limits"
    assert cs_row["breach_label"] == "V limitech"
    assert "monitoring_status_code" in en_row
    assert "lifecycle_code" in en_row


@pytest.mark.asyncio
async def test_kri_register_csv_localizes_breach_direction_codes_and_preserves_unknown_fallback():
    rows = [
        {"metric_name": code, "breach_status": code}
        for code in ("above", "below", "within", "future_direction")
    ]

    en_rows = await _csv_rows(render_kri_register_csv(rows, locale="en"))
    cs_rows = await _csv_rows(render_kri_register_csv(rows, locale="cs"))

    assert [row["breach_code"] for row in en_rows] == [
        "above", "below", "within", "future_direction",
    ]
    assert [row["breach_code"] for row in cs_rows] == [
        "above", "below", "within", "future_direction",
    ]
    assert [row["breach_label"] for row in en_rows] == [
        "Above upper limit", "Below lower limit", "Within limits", "future_direction",
    ]
    assert [row["breach_label"] for row in cs_rows] == [
        "Nad horním limitem", "Pod dolním limitem", "V limitech", "future_direction",
    ]


@pytest.mark.asyncio
async def test_issue_register_csv_emits_controlled_codes_and_localized_labels_without_losing_context():
    row = {
        "id": 42,
        "title": "Localized Issue",
        "status": "in_progress",
        "severity": "critical",
        "source_type": "kri_breach",
        "source_id": 9,
        "risk_ids": "3",
        "risk_names": "Readable Risk",
        "control_ids": "4",
        "control_names": "Readable Control",
        "execution_ids": "5",
        "kri_ids": "9",
        "kri_names": "Readable KRI",
        "remediation_status": "blocked",
        "remediation_progress_percent": 40,
        "exception_status": "approved",
        "is_overdue": True,
    }

    en_row = (await _csv_rows(render_issue_register_csv([row], locale="en")))[0]
    cs_row = (await _csv_rows(render_issue_register_csv([row], locale="cs")))[0]
    expected_codes = {
        "source_type_code": "kri_breach",
        "remediation_status_code": "blocked",
        "exception_status_code": "approved",
    }
    for key, value in expected_codes.items():
        assert en_row[key] == cs_row[key] == value
    assert en_row["source_type_label"] == "KRI breach"
    assert cs_row["source_type_label"] == "Překročení KRI"
    assert en_row["remediation_status_label"] == "Blocked"
    assert cs_row["remediation_status_label"] == "Blokováno"
    assert en_row["exception_status_label"] == "Approved"
    assert cs_row["exception_status_label"] == "Schváleno"
    assert en_row["linked_risk_ids"] == "3"
    assert en_row["linked_control_ids"] == "4"
    assert en_row["linked_execution_ids"] == "5"
    assert en_row["linked_kri_ids"] == "9"
    assert en_row["remediation_progress"] == "40"
