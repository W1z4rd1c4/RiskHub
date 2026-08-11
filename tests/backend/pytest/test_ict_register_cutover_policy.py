"""Governed offline policy window for the manifest-pinned ICT cutover (#53)."""

from __future__ import annotations

import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.seed import seed_ict_workbook_parameter_config
from app.models import (
    ActivityAction,
    ActivityEntityType,
    ActivityLog,
    ApprovalRequest,
    ApprovalScenario,
    Department,
    Risk,
    Role,
    User,
    Vendor,
)
from app.services._ict_register_lifecycle.dq import (
    RISK_STATUS_ACCEPTED,
    RiskDqInput,
)
from app.services._ict_register_reference import (
    ICT_APP_SCALE_RISK_BAND_DEFAULTS,
    ICT_WORKBOOK_PARAMETERS_BY_NAME,
)
from scripts import import_ict_register_workbook as importer
from scripts._ict_register_cutover import (
    CUTOVER_ACCOUNTABILITY_MAP_SHA256,
    CUTOVER_AUTHORIZATION_REFERENCE,
    CUTOVER_SCENARIO_KEYS,
    CutoverTargetProfile,
    ICTRegisterAccountabilityMap,
    apply_ict_register_accountability,
    classify_cutover_target,
    cutover_state_digest,
    load_authorized_cutover_window,
    load_cutover_target_profile,
    load_ict_register_accountability_map,
    require_postgresql_cutover,
    resolve_ict_register_accountability,
    validate_cutover_authorization,
)
from scripts._ict_register_import_helpers import RiskBandScale

ACCOUNTABILITY_MAP_PATH = (
    Path(__file__).resolve().parents[3]
    / "docs"
    / "dora-ict-register"
    / "ict-register-accountability-map.synthetic.json"
)


def _process_row(
    l1: str,
    *,
    owner: str = "Legacy owner",
) -> dict[str, object]:
    return {
        "l0": "Operations",
        "l1": l1,
        "l2": "",
        "owner": owner,
        "src_class": "Nízká",
        "kdf_override": "Ne",
        "bcm": "Nerelevantní",
    }


def _asset_row(
    key: str,
    *,
    owner: str = "Legacy asset owner",
) -> dict[str, object]:
    return {
        "key": key,
        "display": key,
        "owner": owner,
        "aliases": [],
        "typ": "Aplikace",
        "gdpr": "",
        "ai": "",
        "bia_crit": "Nízká",
        "src_class": "Nízká",
        "conflicts": [],
    }


def _accountability_document(seed) -> dict[str, object]:
    return {
        "metadata": {
            "schema_version": 2,
            "mapping_version": "synthetic-demo-v2-2026-08-11",
            "synthetic": True,
            "source_manifest_version": 1,
            "source_version": "v6-2026-07-13",
            "source_manifest_sha256": importer.SOURCE_MANIFEST_SHA256,
            "authorization_reference": "#53",
            "rationale": "Synthetic demo accountability; not evidence of real Process or Asset ownership.",
        },
        "synthetic_owner_email": "risk.manager@riskhub.local",
        "owning_department": {"code": "RISK", "name": "Risk Management"},
        "processes": [
            {
                "l0": row["l0"],
                "l1": row["l1"],
                "l2": None,
                "source_owner": row["owner"],
                "process_owner_email": "risk.manager@riskhub.local",
                "owning_department_code": "RISK",
                "owning_department_name": "Risk Management",
            }
            for row in seed.SRC["processes"]
        ],
        "assets": [
            {
                "key": row["key"],
                "display": row["display"],
                "source_owner": row["owner"],
                "business_owner_email": "risk.manager@riskhub.local",
                "ict_owner_email": "risk.manager@riskhub.local",
                "owning_department_code": "RISK",
                "owning_department_name": "Risk Management",
            }
            for row in seed.SRC["assets"]
        ],
    }


def test_old_process_only_accountability_schema_is_rejected(tmp_path: Path) -> None:
    seed = SimpleNamespace(SRC={"processes": [_process_row("Claims")], "assets": [_asset_row("Claims app")]})
    document = _accountability_document(seed)
    document["metadata"]["schema_version"] = 1
    document.pop("assets")
    path = tmp_path / "old-process-only-map.json"
    digest = _write_accountability_map(path, document)

    with pytest.raises(SystemExit, match="metadata|Assets"):
        load_ict_register_accountability_map(
            path,
            seed=seed,
            expected_digest=digest,
            expected_process_count=1,
            expected_asset_count=1,
        )


def test_combined_accountability_map_requires_the_exact_asset_set(tmp_path: Path) -> None:
    seed = SimpleNamespace(SRC={"processes": [_process_row("Claims")], "assets": [_asset_row("Claims app")]})
    document = _accountability_document(seed)
    document["assets"].clear()
    path = tmp_path / "missing-assets.json"
    digest = _write_accountability_map(path, document)

    with pytest.raises(SystemExit, match="Asset"):
        load_ict_register_accountability_map(
            path,
            seed=seed,
            expected_digest=digest,
            expected_process_count=1,
            expected_asset_count=1,
        )


def _write_accountability_map(
    path: Path,
    document: dict[str, object],
) -> str:
    contents = (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode()
    path.write_bytes(contents)
    return hashlib.sha256(contents).hexdigest()


def _actor(
    *,
    user_id: int = 1,
    email: str = "risk.manager@riskhub.local",
    active: bool = True,
    role_name: str = "risk_manager",
    role_active: bool = True,
):
    return SimpleNamespace(
        id=user_id,
        email=email,
        is_active=active,
        role=SimpleNamespace(name=role_name, is_active=role_active),
    )


def _authorizer(
    *,
    user_id: int = 2,
    email: str = "cro@riskhub.local",
    active: bool = True,
    role_name: str = "cro",
    role_active: bool = True,
):
    return SimpleNamespace(
        id=user_id,
        email=email,
        is_active=active,
        role=SimpleNamespace(name=role_name, is_active=role_active),
    )


@pytest.mark.parametrize(
    ("authorized_by", "reference", "authorizer", "message"),
    [
        ("", "#53", _authorizer(), "authorizer email"),
        ("cro@riskhub.local", "", _authorizer(), "authorization reference"),
        ("cro@riskhub.local", "#52", _authorizer(), "must be #53"),
        ("cro@riskhub.local", "#53", _authorizer(user_id=1), "distinct"),
        (
            "cro@riskhub.local",
            "#53",
            _authorizer(active=False),
            "active CRO",
        ),
        (
            "cro@riskhub.local",
            "#53",
            _authorizer(role_name="risk_manager"),
            "active CRO",
        ),
        (
            "cro@riskhub.local",
            "#53",
            _authorizer(role_active=False),
            "active CRO",
        ),
        (
            "different@riskhub.local",
            "#53",
            _authorizer(),
            "does not match",
        ),
    ],
)
def test_cutover_authorization_fails_closed(
    authorized_by: str,
    reference: str,
    authorizer,
    message: str,
) -> None:
    with pytest.raises(SystemExit, match=message):
        validate_cutover_authorization(
            actor=_actor(),
            authorizer=authorizer,
            authorized_by=authorized_by,
            authorization_reference=reference,
        )


def test_cutover_authorization_accepts_only_the_independent_active_cro() -> None:
    authorization = validate_cutover_authorization(
        actor=_actor(),
        authorizer=_authorizer(),
        authorized_by=" CRO@RISKHUB.LOCAL ",
        authorization_reference=" #53 ",
    )

    assert authorization.authorizer_email == "cro@riskhub.local"
    assert authorization.reference == CUTOVER_AUTHORIZATION_REFERENCE
    assert authorization.reason


@pytest.mark.parametrize(
    ("actor", "message"),
    [
        (_actor(email="other-risk-manager@riskhub.local"), "seeded Risk Manager"),
        (_actor(active=False), "active seeded Risk Manager"),
        (_actor(role_name="cro"), "active seeded Risk Manager"),
        (_actor(role_active=False), "active seeded Risk Manager"),
    ],
)
def test_cutover_authorization_rejects_an_invalid_import_actor(
    actor,
    message: str,
) -> None:
    with pytest.raises(SystemExit, match=message):
        validate_cutover_authorization(
            actor=actor,
            authorizer=_authorizer(),
            authorized_by="cro@riskhub.local",
            authorization_reference="#53",
        )


def test_cutover_apply_rejects_non_postgresql_sessions() -> None:
    sqlite_session = SimpleNamespace(get_bind=lambda: SimpleNamespace(dialect=SimpleNamespace(name="sqlite")))

    with pytest.raises(SystemExit, match="PostgreSQL"):
        require_postgresql_cutover(sqlite_session)


def test_process_accountability_map_accepts_the_exact_manifest_process_set(
    tmp_path: Path,
) -> None:
    seed = SimpleNamespace(
        SRC={
            "processes": [_process_row("Claims"), _process_row("Payments")],
            "assets": [_asset_row("Claims app")],
        }
    )
    document = _accountability_document(seed)
    path = tmp_path / "ict-register-accountability-map.synthetic.json"
    digest = _write_accountability_map(path, document)

    mapping = load_ict_register_accountability_map(
        path,
        seed=seed,
        expected_digest=digest,
        expected_process_count=2,
        expected_asset_count=1,
    )

    assert isinstance(mapping, ICTRegisterAccountabilityMap)
    assert mapping.digest == digest
    assert mapping.synthetic_owner_email == "risk.manager@riskhub.local"
    assert mapping.owning_department_code == "RISK"
    assert len(mapping.process_source_owners) == 2
    assert len(mapping.asset_source_owners) == 1


def test_committed_synthetic_accountability_map_is_the_pinned_331_row_artifact() -> None:
    contents = ACCOUNTABILITY_MAP_PATH.read_bytes()
    document = json.loads(contents)
    process_rows = document["processes"]
    asset_rows = document["assets"]

    assert CUTOVER_ACCOUNTABILITY_MAP_SHA256 == hashlib.sha256(contents).hexdigest()
    assert hashlib.sha256(importer.SOURCE_MANIFEST_PATH.read_bytes()).hexdigest() == (importer.SOURCE_MANIFEST_SHA256)
    assert len(process_rows) == 148
    assert len({(row["l0"], row["l1"], row["l2"]) for row in process_rows}) == 148
    assert len(asset_rows) == 183
    assert len({row["key"] for row in asset_rows}) == 183
    assert document["metadata"]["synthetic"] is True
    assert document["synthetic_owner_email"] == "risk.manager@riskhub.local"
    assert document["owning_department"] == {
        "code": "RISK",
        "name": "Risk Management",
    }


def test_map_aware_expected_dq_profile_derives_enrichment_and_risk_dispositions() -> None:
    raw_profile = {
        "DQ-01": 2,
        "DQ-20": 0,
        "DQ-43": 1,
        "DQ-44": 1,
    }
    mapping = ICTRegisterAccountabilityMap(
        digest="0" * 64,
        synthetic_owner_email="risk.manager@riskhub.local",
        owning_department_code="RISK",
        owning_department_name="Risk Management",
        process_source_owners={("Operations", "Claims", None): "Legacy owner"},
        asset_source_owners={"Claims app": "Legacy asset owner"},
    )
    risks = (
        RiskDqInput(id=1, label="planned in source only", net_score=8),
        RiskDqInput(
            id=2,
            label="accepted",
            net_score=9,
            status_label=RISK_STATUS_ACCEPTED,
        ),
        RiskDqInput(id=3, label="below high threshold", net_score=7),
    )

    adjusted = importer._expected_post_enrichment_dq_profile(
        raw_profile,
        mapping=mapping,
        expected_process_count=1,
        expected_asset_count=1,
        risks=risks,
        risk_medium_from=3,
        risk_high_from=8,
        risk_critical_from=16,
    )

    assert adjusted == {
        "DQ-01": 2,
        "DQ-20": 1,
        "DQ-43": 0,
        "DQ-44": 0,
    }
    assert raw_profile == {
        "DQ-01": 2,
        "DQ-20": 0,
        "DQ-43": 1,
        "DQ-44": 1,
    }
    assert sum(count > 0 for count in adjusted.values()) == 2


def test_exact_synthetic_map_adjusts_the_pinned_workbook_dq_profile() -> None:
    raw_profile = {f"DQ-{number:02d}": 0 for number in range(1, 53)}
    raw_profile.update(
        {
            "DQ-03": 35,
            "DQ-04": 148,
            "DQ-05": 3,
            "DQ-08": 65,
            "DQ-09": 36,
            "DQ-15": 358,
            "DQ-16": 25,
            "DQ-17": 25,
            "DQ-18": 25,
            "DQ-19": 25,
            "DQ-29": 182,
            "DQ-30": 183,
            "DQ-32": 25,
            "DQ-35": 87,
            "DQ-41": 29,
            "DQ-43": 64,
            "DQ-44": 19,
            "DQ-45": 1000,
            "DQ-46": 182,
            "DQ-48": 182,
            "DQ-49": 25,
            "DQ-50": 25,
            "DQ-52": 26,
        }
    )
    document = json.loads(ACCOUNTABILITY_MAP_PATH.read_bytes())
    mapping = ICTRegisterAccountabilityMap(
        digest=hashlib.sha256(ACCOUNTABILITY_MAP_PATH.read_bytes()).hexdigest(),
        synthetic_owner_email=document["synthetic_owner_email"],
        owning_department_code=document["owning_department"]["code"],
        owning_department_name=document["owning_department"]["name"],
        process_source_owners={(row["l0"], row["l1"], row["l2"]): row["source_owner"] for row in document["processes"]},
        asset_source_owners={row["key"]: row["source_owner"] for row in document["assets"]},
    )
    risks = tuple(
        RiskDqInput(
            id=index,
            label=f"RIZ-{index:03d}",
            net_score=net_score,
            status_label=RISK_STATUS_ACCEPTED if index == 7 else None,
        )
        for index, net_score in enumerate((3, 8, 4, 6, 4, 4, 9, 2), start=1)
    )

    adjusted = importer._expected_post_enrichment_dq_profile(
        raw_profile,
        mapping=mapping,
        expected_process_count=148,
        expected_asset_count=183,
        risks=risks,
        risk_medium_from=3,
        risk_high_from=8,
        risk_critical_from=16,
    )

    assert (adjusted["DQ-20"], adjusted["DQ-43"], adjusted["DQ-44"]) == (1, 0, 0)
    assert sum(count > 0 for count in adjusted.values()) == 22
    assert sum(count > 0 for count in raw_profile.values()) == 23


def _source_risk_row(
    *,
    vulnerability: int,
    probability: int,
    effectiveness: float,
    accepted: bool = False,
) -> tuple[object, ...]:
    return (
        "Aktivum",
        "subject",
        1,
        vulnerability,
        probability,
        "controls",
        effectiveness,
        "Akceptace" if accepted else "Zmírnění kontrolami",
        "CRO" if accepted else "",
        "Approved rationale" if accepted else "",
        "2026-06-30" if accepted else "",
        "",
        "",
        "",
        "Periodické",
        "Nerelevantní",
        "2026-06-15",
        "Účinné",
        "Ne",
        "Ne",
        "2026-06-30",
        "Source owner",
        "",
        "Akceptováno" if accepted else "V řešení",
    )


async def _run_verify_with_persisted_riz002(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    *,
    net_score: int,
    status_label: str | None,
    actual_dq20: int,
) -> tuple[int, str]:
    source_risks = (
        _source_risk_row(vulnerability=3, probability=3, effectiveness=0.6),
        _source_risk_row(vulnerability=4, probability=4, effectiveness=0.5),
        _source_risk_row(vulnerability=3, probability=2, effectiveness=0.5),
        _source_risk_row(vulnerability=3, probability=3, effectiveness=0.5),
        _source_risk_row(vulnerability=3, probability=2, effectiveness=0.5),
        _source_risk_row(vulnerability=4, probability=2, effectiveness=0.5),
        _source_risk_row(
            vulnerability=4,
            probability=3,
            effectiveness=0.2,
            accepted=True,
        ),
        _source_risk_row(vulnerability=3, probability=3, effectiveness=0.3),
    )
    seed = SimpleNamespace(
        RISKS=source_risks,
        PARAMS=(
            ("P_RizStr", 15, ""),
            ("P_RizVys", 40, ""),
            ("P_RizKrit", 80, ""),
            ("P_Tolerance", 39, ""),
        ),
        PARAM_TXT=(),
        PARAM_DATE=(),
        ENUMS={"Skala15": (1, 2, 3, 4, 5), "TridyKrit": ("Nízká", "Střední", "Vysoká", "Kritická")},
        SRC={
            "profile": {
                "processes": 0,
                "assets": 0,
                "providers": 0,
                "vpa_rows": 0,
                "vpd_direct": 0,
            },
            "providers": (),
        },
        BIZ_DATA={"nazev": "BIZ DATA s.r.o.", "sml": "SML-2020-001"},
        THREATS=(),
        dod_id_for_provider=lambda _key: "unused",
    )
    mapping = ICTRegisterAccountabilityMap(
        digest="0" * 64,
        synthetic_owner_email="risk.manager@riskhub.local",
        owning_department_code="RISK",
        owning_department_name="Risk Management",
        process_source_owners={("L0", f"P{index}", None): "owner" for index in range(148)},
        asset_source_owners={f"A{index}": "owner" for index in range(183)},
    )
    persisted_risks = tuple(
        RiskDqInput(
            id=index,
            label=f"RIZ-{index:03d}",
            code=f"RIZ-{index:03d}",
            net_score=net_score if index == 2 else expected_net_score,
            status_label=status_label if index == 2 else (RISK_STATUS_ACCEPTED if index == 7 else None),
        )
        for index, expected_net_score in enumerate((3, 8, 4, 6, 4, 4, 9, 2), start=1)
    )
    graph = SimpleNamespace(
        processes=(),
        assets=(),
        vendors=(SimpleNamespace(id=1, name="Other vendor"),),
        contracts=(object(),),
        process_asset_links=(),
        asset_vendor_links=(object(), object()),
        process_vendor_links=(),
    )
    dq_graph = SimpleNamespace(graph=graph, risks=persisted_risks)
    derivation = SimpleNamespace(processes={}, assets={}, vendors={})
    actual_checks = tuple(
        SimpleNamespace(
            check_id=check_id,
            title_cs=check_id,
            count=actual_dq20 if check_id == "DQ-20" else 0,
        )
        for check_id in importer.CHECK_IDS
    )
    dq_result = SimpleNamespace(checks=actual_checks, finding_count=int(actual_dq20 > 0))

    class Parameters:
        version = "test"

        def value(self, name: str) -> int:
            return {
                "P_RizStr": 3,
                "P_RizVys": 8,
                "P_RizKrit": 16,
                "P_Tolerance": 7,
            }[name]

    class ScalarResult:
        def scalar_one(self) -> int:
            return 0

    class VerifySession:
        async def execute(self, _statement) -> ScalarResult:
            return ScalarResult()

    @asynccontextmanager
    async def verify_session_context(_settings):
        yield VerifySession()

    async def load_parameters(_db):
        return Parameters()

    async def load_dq_graph(_db):
        return dq_graph

    expected = {
        "n_risks": 8,
        "n_kdf": 0,
        "n_krit_vendors": 0,
        "pairs_total": 0,
        "krit_candidates": [],
        "dq": {check_id: 0 for check_id in importer.CHECK_IDS},
    }
    expected["dq"]["DQ-43"] = 148
    expected["dq"]["DQ-44"] = 183
    expected_path = tmp_path / "build_expected.json"
    expected_path.write_text(json.dumps(expected), encoding="utf-8")

    monkeypatch.setattr(importer, "load_builder_seed", lambda _source: seed)
    monkeypatch.setattr(
        importer,
        "load_ict_register_accountability_map",
        lambda *_args, **_kwargs: mapping,
    )
    monkeypatch.setattr(importer, "get_settings", lambda: SimpleNamespace())
    monkeypatch.setattr(importer, "session_context", verify_session_context)
    monkeypatch.setattr(importer, "load_ict_workbook_parameter_set", load_parameters)
    monkeypatch.setattr(importer, "load_ict_register_dq_graph", load_dq_graph)
    monkeypatch.setattr(importer, "derive_ict_register", lambda *_args: derivation)
    monkeypatch.setattr(importer, "derive_ict_register_dq", lambda *_args: dq_result)

    result = await importer.run_verify(
        tmp_path,
        expected_path,
        accountability_map_path=tmp_path / "map.json",
    )
    return result, capsys.readouterr().out


@pytest.mark.asyncio
async def test_verify_derives_dq20_from_pinned_source_not_persisted_risks(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    result, output = await _run_verify_with_persisted_riz002(
        monkeypatch,
        tmp_path,
        capsys,
        net_score=7,
        status_label=RISK_STATUS_ACCEPTED,
        actual_dq20=0,
    )

    assert result == 1
    assert "DQ-20 (DQ-20): expected 1, actual 0" in output


@pytest.mark.asyncio
async def test_verify_rejects_dq_neutral_persisted_riz002_mapping_drift(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    result, output = await _run_verify_with_persisted_riz002(
        monkeypatch,
        tmp_path,
        capsys,
        net_score=9,
        status_label=None,
        actual_dq20=1,
    )

    assert result == 1
    assert "[MISMATCH] ICT risk score/status mapping (13)" in output
    assert "[OK ] DQ-20 (DQ-20): expected 1, actual 1" in output
    assert "[OK ] checks with findings (non-zero): expected 1, actual 1" in output


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda document: document["processes"].append(document["processes"][0].copy()),
            "duplicate",
        ),
        (
            lambda document: document["processes"].append(
                {
                    "l0": "Extra",
                    "l1": "Process",
                    "l2": None,
                    "source_owner": "Legacy owner",
                    "process_owner_email": "risk.manager@riskhub.local",
                    "owning_department_code": "RISK",
                    "owning_department_name": "Risk Management",
                }
            ),
            "exactly 2 explicit rows",
        ),
        (lambda document: document["processes"].pop(), "exactly 2 explicit rows"),
        (
            lambda document: document["processes"][0].__setitem__("source_owner", "Different owner"),
            "source_owner",
        ),
        (
            lambda document: document["processes"][0].__setitem__("process_owner_email", "unknown@riskhub.local"),
            "explicit synthetic identity",
        ),
        (
            lambda document: document["processes"][0].__setitem__("owning_department_code", "OTHER"),
            "explicit synthetic identity",
        ),
        (
            lambda document: document["metadata"].__setitem__("synthetic", False),
            "metadata",
        ),
        (
            lambda document: document["metadata"].__setitem__("source_version", "unrecognized-source"),
            "source identity",
        ),
    ],
)
def test_process_accountability_map_rejects_incomplete_or_drifted_rows(
    tmp_path: Path,
    mutate,
    message: str,
) -> None:
    seed = SimpleNamespace(
        SRC={
            "processes": [_process_row("Claims"), _process_row("Payments")],
            "assets": [_asset_row("Claims app")],
        }
    )
    document = _accountability_document(seed)
    mutate(document)
    path = tmp_path / "ict-register-accountability-map.synthetic.json"
    digest = _write_accountability_map(path, document)

    with pytest.raises(SystemExit, match=message):
        load_ict_register_accountability_map(
            path,
            seed=seed,
            expected_digest=digest,
            expected_process_count=2,
            expected_asset_count=1,
        )


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda document: document["assets"].pop(), "Asset rows"),
        (
            lambda document: document["assets"].append(document["assets"][0].copy()),
            "duplicate Asset",
        ),
        (
            lambda document: document["assets"].append(
                {
                    **document["assets"][0],
                    "key": "extra",
                    "display": "Extra",
                }
            ),
            "Asset",
        ),
        (
            lambda document: document["assets"][0].__setitem__("source_owner", "Different owner"),
            "Asset source_owner drift",
        ),
        (
            lambda document: document["assets"][0].__setitem__("business_owner_email", "unknown@riskhub.local"),
            "explicit synthetic identity",
        ),
        (
            lambda document: document["assets"][0].__setitem__("owning_department_name", "Other"),
            "explicit synthetic identity",
        ),
    ],
)
def test_accountability_map_rejects_incomplete_or_drifted_asset_rows(
    tmp_path: Path,
    mutate,
    message: str,
) -> None:
    seed = SimpleNamespace(
        SRC={
            "processes": [_process_row("Claims")],
            "assets": [_asset_row("Claims app"), _asset_row("Payments app")],
        }
    )
    document = _accountability_document(seed)
    mutate(document)
    path = tmp_path / "ict-register-accountability-map.synthetic.json"
    digest = _write_accountability_map(path, document)

    with pytest.raises(SystemExit, match=message):
        load_ict_register_accountability_map(
            path,
            seed=seed,
            expected_digest=digest,
            expected_process_count=1,
            expected_asset_count=2,
        )


def test_process_accountability_map_rejects_wrong_or_changed_digest(tmp_path: Path) -> None:
    seed = SimpleNamespace(SRC={"processes": [_process_row("Claims")], "assets": [_asset_row("Claims app")]})
    document = _accountability_document(seed)
    path = tmp_path / "ict-register-accountability-map.synthetic.json"
    original_digest = _write_accountability_map(path, document)
    document["metadata"]["rationale"] = "Changed after authorization"
    _write_accountability_map(path, document)

    with pytest.raises(SystemExit, match="SHA-256"):
        load_ict_register_accountability_map(
            path,
            seed=seed,
            expected_digest=original_digest,
            expected_process_count=1,
            expected_asset_count=1,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("identity", "message"),
    [
        ("missing_user", "seeded Risk Manager"),
        ("inactive_user", "active non-admin seeded Risk Manager"),
        ("admin_user", "active non-admin seeded Risk Manager"),
        ("missing_department", "Risk Management department"),
        ("inactive_department", "active Risk Management department"),
        ("wrong_department", "assigned to the active Risk Management department"),
    ],
)
async def test_process_accountability_resolution_fails_closed_on_identity_drift(
    db_session: AsyncSession,
    identity: str,
    message: str,
) -> None:
    role_name = "admin" if identity == "admin_user" else "risk_manager"
    role = Role(name=role_name, display_name=role_name, description="cutover identity")
    department = Department(
        name="Other" if identity == "wrong_department" else "Risk Management",
        code="OTHER" if identity == "wrong_department" else "RISK",
        is_active=identity != "inactive_department",
    )
    db_session.add_all([role, department])
    await db_session.flush()
    if identity == "wrong_department":
        db_session.add(
            Department(
                name="Risk Management",
                code="RISK",
                is_active=True,
            )
        )
        await db_session.flush()
    if identity != "missing_user":
        user = User(
            email="risk.manager@riskhub.local",
            name="Synthetic Process Owner",
            role_id=role.id,
            department_id=None if identity == "missing_department" else department.id,
            is_active=identity != "inactive_user",
        )
        db_session.add(user)
    if identity == "missing_department":
        await db_session.delete(department)
    await db_session.flush()
    mapping = ICTRegisterAccountabilityMap(
        digest="0" * 64,
        synthetic_owner_email="risk.manager@riskhub.local",
        owning_department_code="RISK",
        owning_department_name="Risk Management",
        process_source_owners={("Operations", "Claims", None): "Legacy owner"},
        asset_source_owners={"Claims app": "Legacy asset owner"},
    )

    with pytest.raises(SystemExit, match=message):
        await resolve_ict_register_accountability(db_session, mapping)


@pytest.mark.asyncio
async def test_process_accountability_mapping_feeds_canonical_ids_to_process_service(
    db_session: AsyncSession,
    test_department: Department,
    test_user_risk_manager: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed = SimpleNamespace(SRC={"processes": [_process_row("Claims")], "assets": [_asset_row("Claims app")]})
    mapping = ICTRegisterAccountabilityMap(
        digest="0" * 64,
        synthetic_owner_email="risk.manager@riskhub.local",
        owning_department_code="RISK",
        owning_department_name="Risk Management",
        process_source_owners={("Operations", "Claims", None): "Legacy owner"},
        asset_source_owners={"Claims app": "Legacy asset owner"},
    )
    apply_ict_register_accountability(
        seed,
        mapping,
        owner_user_id=test_user_risk_manager.id,
        owning_department_id=test_department.id,
    )
    captured: list[object] = []

    async def create_process(*, payload, **_kwargs):
        captured.append(payload)
        return SimpleNamespace(id=41)

    monkeypatch.setattr(importer, "create_process_detail", create_process)

    report = importer.ImportReport()
    await importer.import_processes(db_session, seed, test_user_risk_manager, report)

    assert not report.findings
    assert len(captured) == 1
    assert captured[0].process_owner_user_id == test_user_risk_manager.id
    assert captured[0].owning_department_id == test_department.id


@pytest.mark.asyncio
async def test_accountability_mapping_feeds_canonical_ids_to_asset_service(
    db_session: AsyncSession,
    test_department: Department,
    test_user_risk_manager: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed = SimpleNamespace(
        SRC={"processes": [_process_row("Claims")], "assets": [_asset_row("Claims app")]},
        VERIS_OVERLAY={},
        BIA_CRIT_TO_TRIDA={},
    )
    mapping = ICTRegisterAccountabilityMap(
        digest="0" * 64,
        synthetic_owner_email="risk.manager@riskhub.local",
        owning_department_code="RISK",
        owning_department_name="Risk Management",
        process_source_owners={("Operations", "Claims", None): "Legacy owner"},
        asset_source_owners={"Claims app": "Legacy asset owner"},
    )
    apply_ict_register_accountability(
        seed,
        mapping,
        owner_user_id=test_user_risk_manager.id,
        owning_department_id=test_department.id,
    )
    captured: list[object] = []

    async def create_asset(*, payload, **_kwargs):
        captured.append(payload)
        return SimpleNamespace(id=42)

    monkeypatch.setattr(importer, "create_asset_detail", create_asset)
    report = importer.ImportReport()
    await importer.import_assets(db_session, seed, test_user_risk_manager, report)

    assert not report.findings
    assert len(captured) == 1
    assert captured[0].business_owner_user_id == test_user_risk_manager.id
    assert captured[0].ict_owner_user_id == test_user_risk_manager.id
    assert captured[0].owning_department_id == test_department.id


def _target_profile(
    *,
    identities: dict[str, frozenset[tuple[object, ...]]],
    parameter_values: dict[str, str],
    state_digest: str | None = None,
    completion_digest: str | None = None,
    completion_marker_present: bool = False,
    accountability_map_digest: str | None = "map-digest",
    completion_accountability_map_digest: str | None = None,
) -> CutoverTargetProfile:
    return CutoverTargetProfile(
        identities=identities,
        parameter_values=parameter_values,
        fresh_parameter_values={"ict.medium": "15"},
        state_digest=state_digest,
        completion_digest=completion_digest,
        completion_marker_present=completion_marker_present,
        accountability_map_digest=accountability_map_digest,
        completion_accountability_map_digest=completion_accountability_map_digest,
    )


def test_target_must_be_fresh_or_an_exact_manifest_match() -> None:
    expected = _target_profile(
        identities={"vendors": frozenset({("BIZ DATA s.r.o.",)})},
        parameter_values={"ict.medium": "3"},
    )
    fresh = _target_profile(
        identities={"vendors": frozenset()},
        parameter_values={"ict.medium": "15"},
    )
    exact = _target_profile(
        identities=expected.identities,
        parameter_values=expected.parameter_values,
        state_digest="full-state-digest",
        completion_digest="full-state-digest",
        completion_marker_present=True,
        completion_accountability_map_digest="map-digest",
    )
    drifted = _target_profile(
        identities={"vendors": frozenset({("Unpinned vendor",)})},
        parameter_values={"ict.medium": "3"},
    )

    assert classify_cutover_target(fresh, expected) == "fresh"
    assert classify_cutover_target(exact, expected) == "exact"
    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        classify_cutover_target(drifted, expected)


@pytest.mark.parametrize(
    ("completion_digest", "completion_map_digest"),
    [
        ("stale-state-digest", "map-digest"),
        (None, None),
    ],
    ids=("valid-stale-marker", "malformed-marker"),
)
def test_empty_target_with_any_completion_marker_is_not_fresh(
    completion_digest: str | None,
    completion_map_digest: str | None,
) -> None:
    expected = _target_profile(
        identities={"vendors": frozenset({("BIZ DATA s.r.o.",)})},
        parameter_values={"ict.medium": "3"},
    )
    marker_bearing_target = _target_profile(
        identities={"vendors": frozenset()},
        parameter_values={"ict.medium": "15"},
        state_digest="current-empty-state",
        completion_digest=completion_digest,
        completion_marker_present=True,
        completion_accountability_map_digest=completion_map_digest,
    )

    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        classify_cutover_target(marker_bearing_target, expected)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "changes",
    [
        {
            "value": {
                "old": None,
                "new": json.dumps(
                    {
                        "state_sha256": "stale-state-digest",
                        "accountability_map_sha256": "map-digest",
                    }
                ),
            },
            "code": {"old": None, "new": "map-digest"},
        },
        {
            "value": {"old": None, "new": "malformed-marker"},
            "code": {"old": None, "new": "map-digest"},
        },
        None,
    ],
    ids=("valid-stale-marker", "malformed-marker", "null-marker"),
)
async def test_public_target_profile_distinguishes_present_marker_from_absence(
    db_session: AsyncSession,
    changes: dict[str, object] | None,
) -> None:
    db_session.add(
        ActivityLog(
            entity_type=ActivityEntityType.CONFIG,
            entity_id=0,
            entity_name="ICT Register cutover",
            action=ActivityAction.UPDATE,
            actor_name="Certification test",
            changes=changes,
            description="ICT Register cutover #53 completed with an immutable state digest",
        )
    )
    await db_session.commit()

    actual = await load_cutover_target_profile(db_session, parameter_keys=())
    expected = CutoverTargetProfile(
        identities={"vendors": frozenset({("BIZ DATA s.r.o.",)})},
        parameter_values={},
        fresh_parameter_values={},
        accountability_map_digest="map-digest",
    )

    assert actual.completion_marker_present is True
    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        classify_cutover_target(actual, expected)


def test_exact_rerun_requires_the_same_accountability_map_digest() -> None:
    expected = _target_profile(
        identities={"processes": frozenset({("L0", "L1", None)})},
        parameter_values={},
        accountability_map_digest="authorized-map",
    )
    actual = _target_profile(
        identities=expected.identities,
        parameter_values={},
        state_digest="full-state-digest",
        completion_digest="full-state-digest",
        completion_marker_present=True,
        completion_accountability_map_digest="different-map",
    )

    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        classify_cutover_target(actual, expected)


def test_migrated_canonical_seed_is_a_fresh_cutover_target() -> None:
    derived, fresh = importer._cutover_parameter_profiles(
        RiskBandScale(medium_from=3, high_from=8, critical_from=16, tolerance=7)
    )
    canonical_seed = {
        ICT_WORKBOOK_PARAMETERS_BY_NAME[name].config_key: str(value)
        for name, value in ICT_APP_SCALE_RISK_BAND_DEFAULTS.items()
    }
    expected = CutoverTargetProfile(
        identities={"vendors": frozenset({("manifest-vendor",)})},
        parameter_values=derived,
        fresh_parameter_values=fresh,
    )
    actual = CutoverTargetProfile(
        identities={"vendors": frozenset()},
        parameter_values=canonical_seed,
        fresh_parameter_values={},
    )

    assert derived == fresh == canonical_seed
    assert classify_cutover_target(actual, expected) == "fresh"


def test_cutover_rejects_a_source_scale_transform_that_drifted_from_app_ssot() -> None:
    with pytest.raises(SystemExit, match="app-scale risk-band source of truth"):
        importer._cutover_parameter_profiles(
            RiskBandScale(medium_from=15, high_from=40, critical_from=80, tolerance=39)
        )


@pytest.mark.asyncio
async def test_public_preflight_accepts_a_canonically_seeded_fresh_database(
    db_session: AsyncSession,
) -> None:
    await seed_ict_workbook_parameter_config(db_session)
    await db_session.commit()
    derived, fresh = importer._cutover_parameter_profiles(
        RiskBandScale(medium_from=3, high_from=8, critical_from=16, tolerance=7)
    )
    actual = await load_cutover_target_profile(
        db_session,
        parameter_keys=tuple(derived),
    )
    expected = CutoverTargetProfile(
        identities={"vendors": frozenset({("manifest-vendor",)})},
        parameter_values=derived,
        fresh_parameter_values=fresh,
    )

    assert actual.parameter_values == derived
    assert classify_cutover_target(actual, expected) == "fresh"


def test_exact_target_rejects_missing_or_stale_completion_digest() -> None:
    expected = _target_profile(
        identities={"vendors": frozenset({("BIZ DATA s.r.o.",)})},
        parameter_values={"ict.medium": "3"},
    )
    missing = _target_profile(
        identities=expected.identities,
        parameter_values=expected.parameter_values,
        state_digest="current-state",
    )
    stale = _target_profile(
        identities=expected.identities,
        parameter_values=expected.parameter_values,
        state_digest="current-state",
        completion_digest="previous-state",
        completion_marker_present=True,
    )

    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        classify_cutover_target(missing, expected)
    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        classify_cutover_target(stale, expected)


@pytest.mark.asyncio
async def test_empty_register_loads_as_a_fresh_target_profile(
    db_session: AsyncSession,
) -> None:
    actual = await load_cutover_target_profile(
        db_session,
        parameter_keys=("ict.medium",),
    )

    assert all(not identities for identities in actual.identities.values())
    assert actual.parameter_values == {}


async def _seed_scenarios(
    db: AsyncSession,
    *,
    updated_by_id: int,
) -> dict[str, tuple[object, ...]]:
    baseline_time = datetime(2026, 7, 10, 12, 0, tzinfo=UTC)
    for index, key in enumerate(CUTOVER_SCENARIO_KEYS):
        db.add(
            ApprovalScenario(
                key=key,
                display_name=f"Scenario {index}",
                description=f"Protected scenario {index}",
                requires_approval=True,
                approver_roles=["risk_manager", "cro"],
                updated_at=baseline_time,
                updated_by_id=updated_by_id,
            )
        )
    await db.commit()
    rows = (
        await db.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
            .order_by(ApprovalScenario.key)
        )
    ).scalars()
    return {
        row.key: (
            row.display_name,
            row.description,
            row.requires_approval,
            list(row.approver_roles),
            row.updated_at,
            row.updated_by_id,
        )
        for row in rows
    }


def _scenario_state(row: ApprovalScenario) -> tuple[object, ...]:
    return (
        row.display_name,
        row.description,
        row.requires_approval,
        list(row.approver_roles),
        row.updated_at,
        row.updated_by_id,
    )


@pytest.mark.asyncio
async def test_authorized_window_audits_and_restores_the_complete_scenario_snapshot(
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_cro: User,
) -> None:
    test_user_risk_manager.email = "risk.manager@riskhub.local"
    await db_session.commit()
    baseline = await _seed_scenarios(
        db_session,
        updated_by_id=test_user_risk_manager.id,
    )
    window = await load_authorized_cutover_window(
        db_session,
        actor=test_user_risk_manager,
        authorized_by=test_user_cro.email,
        authorization_reference="#53",
        accountability_map_digest="map-digest",
    )

    await window.audit_authorization()
    await window.suspend()
    assert all(not scenario.requires_approval for scenario in window.scenarios)
    assert await db_session.scalar(select(func.count(ApprovalRequest.id))) == 0

    await window.restore()
    restored = (
        await db_session.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
            .order_by(ApprovalScenario.key)
        )
    ).scalars()
    assert {row.key: _scenario_state(row) for row in restored} == baseline

    audit_rows = list(
        (
            await db_session.execute(
                select(ActivityLog).where(ActivityLog.actor_id == test_user_cro.id).order_by(ActivityLog.id)
            )
        ).scalars()
    )
    assert [row.action for row in audit_rows] == ["approve", "update", "update"]
    assert all("#53" in row.description for row in audit_rows)
    assert all(row.entity_type == "config" for row in audit_rows)
    assert all(row.changes["code"]["new"] == "map-digest" for row in audit_rows)


@pytest.mark.asyncio
async def test_window_rollback_removes_audits_and_restores_policy(
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_cro: User,
) -> None:
    test_user_risk_manager.email = "risk.manager@riskhub.local"
    await db_session.commit()
    baseline = await _seed_scenarios(
        db_session,
        updated_by_id=test_user_risk_manager.id,
    )
    window = await load_authorized_cutover_window(
        db_session,
        actor=test_user_risk_manager,
        authorized_by=test_user_cro.email,
        authorization_reference="#53",
        accountability_map_digest="map-digest",
    )
    await window.audit_authorization()
    await window.suspend()

    await db_session.rollback()

    rows = (
        await db_session.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
            .order_by(ApprovalScenario.key)
        )
    ).scalars()
    assert {row.key: _scenario_state(row) for row in rows} == baseline
    assert await db_session.scalar(select(func.count(ActivityLog.id))) == 0


@pytest.mark.asyncio
async def test_exact_rerun_digest_rejects_same_keys_with_field_drift(
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_cro: User,
) -> None:
    test_user_risk_manager.email = "risk.manager@riskhub.local"
    await db_session.commit()
    await _seed_scenarios(
        db_session,
        updated_by_id=test_user_risk_manager.id,
    )
    vendor = Vendor(
        name="BIZ DATA s.r.o.",
        process="ICT registr",
        outsourcing_owner_user_id=test_user_risk_manager.id,
    )
    db_session.add(vendor)
    await db_session.commit()
    initial = await load_cutover_target_profile(db_session, parameter_keys=())
    expected = CutoverTargetProfile(
        identities=initial.identities,
        parameter_values=initial.parameter_values,
        fresh_parameter_values={},
        accountability_map_digest="map-digest",
    )
    window = await load_authorized_cutover_window(
        db_session,
        actor=test_user_risk_manager,
        authorized_by=test_user_cro.email,
        authorization_reference="#53",
        accountability_map_digest="map-digest",
    )
    await window.complete(await cutover_state_digest(db_session, parameter_keys=()))
    await db_session.commit()

    exact = await load_cutover_target_profile(db_session, parameter_keys=())
    assert exact.completion_marker_present is True
    assert classify_cutover_target(exact, expected) == "exact"
    completion_audit = (
        await db_session.execute(select(ActivityLog).order_by(ActivityLog.id.desc()).limit(1))
    ).scalar_one()
    marker = json.loads(completion_audit.changes["value"]["new"])
    assert completion_audit.changes["code"]["new"] == "map-digest"
    assert marker["accountability_map_sha256"] == "map-digest"
    assert marker["state_sha256"] == exact.completion_digest

    vendor.description = "Drifted after the completed manifest import"
    await db_session.commit()
    drifted = await load_cutover_target_profile(db_session, parameter_keys=())
    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        classify_cutover_target(drifted, expected)


@pytest.mark.asyncio
@pytest.mark.postgres
async def test_other_postgresql_sessions_never_observe_suspended_policy(
    async_engine,
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_cro: User,
) -> None:
    if async_engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL MVCC and row locks are authoritative")
    test_user_risk_manager.email = "risk.manager@riskhub.local"
    await db_session.commit()
    await _seed_scenarios(
        db_session,
        updated_by_id=test_user_risk_manager.id,
    )
    sessions = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with sessions() as cutover_session, sessions() as observer_session:
        window = await load_authorized_cutover_window(
            cutover_session,
            actor=test_user_risk_manager,
            authorized_by=test_user_cro.email,
            authorization_reference="#53",
            accountability_map_digest="map-digest",
        )
        await window.suspend()

        observed = tuple(
            (
                await observer_session.execute(
                    select(ApprovalScenario.requires_approval)
                    .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
                    .order_by(ApprovalScenario.key)
                )
            ).scalars()
        )
        assert observed == (True, True, True)
        await cutover_session.rollback()


async def _prepare_public_import(
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    *,
    actor: User,
) -> CutoverTargetProfile:
    actor.email = "risk.manager@riskhub.local"
    await db.commit()
    actual = await load_cutover_target_profile(db, parameter_keys=())
    expected = CutoverTargetProfile(
        identities=actual.identities,
        parameter_values=actual.parameter_values,
        fresh_parameter_values=actual.parameter_values,
        accountability_map_digest="map-digest",
    )

    @asynccontextmanager
    async def existing_session(_settings):
        yield db

    monkeypatch.setattr(importer, "session_context", existing_session)
    monkeypatch.setattr(importer, "load_builder_seed", lambda _source: SimpleNamespace())
    monkeypatch.setattr(
        importer,
        "_cutover_target_profile",
        lambda _seed, **_kwargs: expected,
    )
    monkeypatch.setattr(importer, "require_postgresql_cutover", lambda _db: None)
    monkeypatch.setattr(
        importer,
        "load_ict_register_accountability_map",
        lambda *_args, **_kwargs: ICTRegisterAccountabilityMap(
            digest="map-digest",
            synthetic_owner_email="risk.manager@riskhub.local",
            owning_department_code="RISK",
            owning_department_name="Risk Management",
            process_source_owners={},
            asset_source_owners={},
        ),
    )

    async def resolved_accountability(*_args, **_kwargs):
        return SimpleNamespace(
            owner_user_id=actor.id,
            owning_department_id=actor.department_id,
        )

    monkeypatch.setattr(importer, "resolve_ict_register_accountability", resolved_accountability)
    monkeypatch.setattr(importer, "apply_ict_register_accountability", lambda *_args, **_kwargs: None)
    return expected


@pytest.mark.asyncio
async def test_public_import_suspends_only_inside_the_atomic_window_and_restores_before_commit(
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    baseline = await _seed_scenarios(
        db_session,
        updated_by_id=test_user_risk_manager.id,
    )
    await _prepare_public_import(
        db_session,
        monkeypatch,
        actor=test_user_risk_manager,
    )
    observed: list[tuple[bool, ...]] = []
    commit_calls: list[str] = []

    async def observe_window(db, _seed, _user, _report) -> None:
        scenarios = tuple(
            (
                await db.execute(
                    select(ApprovalScenario)
                    .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
                    .order_by(ApprovalScenario.key)
                )
            ).scalars()
        )
        observed.append(tuple(row.requires_approval for row in scenarios))

    async def commit_once(db, *, boundary: str) -> None:
        commit_calls.append(boundary)
        await db.commit()

    monkeypatch.setattr(importer, "_run_import_phases", observe_window)
    monkeypatch.setattr(importer, "commit_service_boundary", commit_once)

    result = await importer.run_import(
        Path("manifest-verified-source"),
        cutover_authorized_by=test_user_cro.email,
        authorization_reference="#53",
        accountability_map_path=Path("accountability-map"),
    )

    assert result == 0
    assert observed == [(False, False, False)]
    assert commit_calls == ["ict_register_cutover_import"]
    restored = (
        await db_session.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
            .order_by(ApprovalScenario.key)
        )
    ).scalars()
    assert {row.key: _scenario_state(row) for row in restored} == baseline
    assert await db_session.scalar(select(func.count(ApprovalRequest.id))) == 0
    assert await db_session.scalar(select(func.count(ActivityLog.id))) == 4


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [RuntimeError("phase failed"), asyncio.CancelledError()])
async def test_public_import_failure_rolls_back_policy_window_and_audits(
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
    failure: BaseException,
) -> None:
    baseline = await _seed_scenarios(
        db_session,
        updated_by_id=test_user_risk_manager.id,
    )
    await _prepare_public_import(
        db_session,
        monkeypatch,
        actor=test_user_risk_manager,
    )

    async def fail_inside_window(*_args, **_kwargs) -> None:
        raise failure

    monkeypatch.setattr(importer, "_run_import_phases", fail_inside_window)

    with pytest.raises(
        type(failure),
        match="phase failed" if isinstance(failure, RuntimeError) else None,
    ):
        await importer.run_import(
            Path("manifest-verified-source"),
            cutover_authorized_by=test_user_cro.email,
            authorization_reference="#53",
            accountability_map_path=Path("accountability-map"),
        )

    restored = (
        await db_session.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
            .order_by(ApprovalScenario.key)
        )
    ).scalars()
    assert {row.key: _scenario_state(row) for row in restored} == baseline
    assert await db_session.scalar(select(func.count(ActivityLog.id))) == 0
    assert await db_session.scalar(select(func.count(ApprovalRequest.id))) == 0


@pytest.mark.asyncio
async def test_public_import_rejects_a_drifted_target_before_policy_mutation(
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    baseline = await _seed_scenarios(
        db_session,
        updated_by_id=test_user_risk_manager.id,
    )
    await _prepare_public_import(
        db_session,
        monkeypatch,
        actor=test_user_risk_manager,
    )
    db_session.add(
        Vendor(
            name="Unpinned vendor",
            process="Unpinned process",
            outsourcing_owner_user_id=test_user_risk_manager.id,
        )
    )
    await db_session.commit()
    audit_count_before = await db_session.scalar(select(func.count(ActivityLog.id)))

    async def unexpected_phases(*_args, **_kwargs) -> None:
        pytest.fail("drifted target reached mutating import phases")

    monkeypatch.setattr(importer, "_run_import_phases", unexpected_phases)

    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        await importer.run_import(
            Path("manifest-verified-source"),
            cutover_authorized_by=test_user_cro.email,
            authorization_reference="#53",
            accountability_map_path=Path("accountability-map"),
        )

    restored = (
        await db_session.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
            .order_by(ApprovalScenario.key)
        )
    ).scalars()
    assert {row.key: _scenario_state(row) for row in restored} == baseline
    assert await db_session.scalar(select(func.count(ActivityLog.id))) == audit_count_before


@pytest.mark.asyncio
async def test_public_import_rejects_a_non_ict_riz_code_collision_before_mutation(
    db_session: AsyncSession,
    test_user_risk_manager: User,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    baseline = await _seed_scenarios(
        db_session,
        updated_by_id=test_user_risk_manager.id,
    )
    db_session.add(
        Risk(
            risk_id_code="FIN-R01",
            name="Existing base risk",
            process="Enterprise risk management",
            description="Canonical non-ICT baseline risk",
        )
    )
    await db_session.commit()
    await _prepare_public_import(
        db_session,
        monkeypatch,
        actor=test_user_risk_manager,
    )
    db_session.add(
        Risk(
            risk_id_code="RIZ-001",
            name="Colliding non-ICT risk",
            process="Enterprise risk management",
            description="Must not be overwritten by the ICT cutover",
        )
    )
    await db_session.commit()
    audit_count_before = await db_session.scalar(select(func.count(ActivityLog.id)))

    async def unexpected_phases(*_args, **_kwargs) -> None:
        pytest.fail("risk-code collision reached mutating import phases")

    monkeypatch.setattr(importer, "_run_import_phases", unexpected_phases)

    with pytest.raises(SystemExit, match="neither fresh nor an exact manifest match"):
        await importer.run_import(
            Path("manifest-verified-source"),
            cutover_authorized_by=test_user_cro.email,
            authorization_reference="#53",
            accountability_map_path=Path("accountability-map"),
        )

    restored = (
        await db_session.execute(
            select(ApprovalScenario)
            .where(ApprovalScenario.key.in_(CUTOVER_SCENARIO_KEYS))
            .order_by(ApprovalScenario.key)
        )
    ).scalars()
    assert {row.key: _scenario_state(row) for row in restored} == baseline
    collision = await db_session.scalar(select(Risk).where(Risk.risk_id_code == "RIZ-001"))
    assert collision is not None
    assert collision.name == "Colliding non-ICT risk"
    assert await db_session.scalar(select(func.count(ActivityLog.id))) == audit_count_before
