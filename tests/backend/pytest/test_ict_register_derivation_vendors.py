"""ICT Register derivation engine — vendor-cascade golden suite (issue #49).

Sibling of test_ict_register_derivation.py (the #48 process/asset goldens),
same two seams:

1. **The pure engine**: golden, table-driven graphs through
   ``derive_ict_register`` asserting workbook-exact outputs. Every expected
   value is a literal worked by hand from
   docs/dora-ict-register/dora-excel-functional-spec.md (sections 1.3-1.5,
   2.3, 3.4) and, where the spec's edge behavior needed the ground truth, the
   openpyxl builder source quoted per formula (sheets_vendors.py /
   sheets_core.py file:line in the docstrings below).

2. **The HTTP seam** via ``client_factory``: the Vendor, Contract, and
   Sub-outsourcing Read payloads carry their derived blocks, the Process
   ``dod_n`` counts the derived §2 expansion, the Asset payload carries
   ``hotovo``, and derived blocks stay rejected on write.

Workbook rules under test:
- Vendor two-path CIF any-true (builder sheets_vendors.py:96-98) and the
  MAXIFS ``h_rank`` -> ``max_krit`` (:106-108, :153-154);
- the tier formula verbatim (:109-115) — every branch, including the
  "Významný" branch that is structurally unreachable under seed-shaped data
  (spec section 8 item 3), driven via direct engine input;
- ``cif_ret`` chain propagation (:124-126): UNIFORM from the contract's prime
  vendor via the hidden 08!W (:287-289), never re-derived per tier;
- Sub-outsourcing Rank recursion with the "?" break sentinel and the
  DUPLICITA-first check column (:362-370);
- ``uroven_ret`` chain position (:116-119), ``subdod``/``subdod_n`` (:120-123),
  ``vyz_vysledek`` (:134-136), Vendor ``hotovo`` (:142-148) incl. the ex-ante
  date rule, ``kat_zeme`` (spec 3.4);
- Contract deriveds: vendor-name F, full-depth chain display S (the workbook
  capped the STRING at ranks 2-3 — builder :276-282 — a recorded display-only
  deviation; the DATA stays faithful), DUPLICITA U, hidden CIF W;
- the derived-only §2 transitive Process<->Vendor expansion (spec 1.8) and the
  Process ``dod_n`` = §1 + §2 flip (builder sheets_core.py:202-204);
- Asset ``hotovo`` (builder sheets_core.py:400-406), deferred from #48.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.models import User
from app.models.global_config import clear_config_cache
from app.services._ict_register_lifecycle.derivation import (
    AssetDerivationInput,
    AssetVendorLinkInput,
    IctRegisterGraph,
    ProcessAssetLinkInput,
    ProcessDerivationInput,
    ProcessVendorLinkInput,
    SubOutsourcingInput,
    VendorContractInput,
    VendorDerivationInput,
    derive_ict_register,
)
from app.services._ict_register_reference.parameters import (
    ICT_WORKBOOK_PARAMETERS,
    IctParameterValue,
    IctWorkbookParameterSet,
)


@pytest.fixture(autouse=True)
def _clear_config_cache():
    clear_config_cache()
    yield
    clear_config_cache()


def parameter_set(**overrides: IctParameterValue) -> IctWorkbookParameterSet:
    """The verbatim workbook parameter set (spec section 6), with overrides."""
    values: dict[str, IctParameterValue] = {p.name: p.default for p in ICT_WORKBOOK_PARAMETERS}
    values.update(overrides)
    return IctWorkbookParameterSet(version=str(values["P_Verze"]), values=values)


def process_row(pid: int = 1, **overrides: object) -> ProcessDerivationInput:
    defaults: dict[str, object] = {"id": pid, "l1_process": f"Proces {pid}"}
    defaults.update(overrides)
    return ProcessDerivationInput(**defaults)  # type: ignore[arg-type]


def cif_process_row(pid: int = 1, **overrides: object) -> ProcessDerivationInput:
    """Score 21 (16+5) -> Kritická -> cif Ano (spec 2.1 literals)."""
    defaults: dict[str, object] = {
        "impact_client": 4,
        "impact_market_operations": 4,
        "impact_regulatory": 4,
        "impact_financial": 4,
        "mtpd_hours": 4,
    }
    defaults.update(overrides)
    return process_row(pid, **defaults)


def low_process_row(pid: int = 2, **overrides: object) -> ProcessDerivationInput:
    """Score 5 (4+1) -> Nízká -> cif Ne."""
    defaults: dict[str, object] = {
        "impact_client": 1,
        "impact_market_operations": 1,
        "impact_regulatory": 1,
        "impact_financial": 1,
        "mtpd_hours": 100,
    }
    defaults.update(overrides)
    return process_row(pid, **defaults)


def asset_row(aid: int = 1, **overrides: object) -> AssetDerivationInput:
    defaults: dict[str, object] = {"id": aid, "name": f"Aktivum {aid}"}
    defaults.update(overrides)
    return AssetDerivationInput(**defaults)  # type: ignore[arg-type]


def vendor_row(vid: int = 1, **overrides: object) -> VendorDerivationInput:
    defaults: dict[str, object] = {"id": vid, "name": f"Dodavatel {vid}"}
    defaults.update(overrides)
    return VendorDerivationInput(**defaults)  # type: ignore[arg-type]


def contract_row(cid: int = 1, vendor_id: int = 1, **overrides: object) -> VendorContractInput:
    defaults: dict[str, object] = {"id": cid, "vendor_id": vendor_id}
    defaults.update(overrides)
    return VendorContractInput(**defaults)  # type: ignore[arg-type]


def sub_row(sid: int, vendor_id: int, contract_id: int, **overrides: object) -> SubOutsourcingInput:
    defaults: dict[str, object] = {"id": sid, "vendor_id": vendor_id, "contract_id": contract_id}
    defaults.update(overrides)
    return SubOutsourcingInput(**defaults)  # type: ignore[arg-type]


def vad(asset_id: int, vendor_id: int, code: str = "S02", **overrides: object) -> AssetVendorLinkInput:
    defaults: dict[str, object] = {
        "asset_id": asset_id,
        "vendor_id": vendor_id,
        "ict_service_code": code,
    }
    defaults.update(overrides)
    return AssetVendorLinkInput(**defaults)  # type: ignore[arg-type]


def derive(graph: IctRegisterGraph, params: IctWorkbookParameterSet | None = None):
    return derive_ict_register(graph, params or parameter_set())


# ===========================================================================
# Seam 1 — pure engine: Vendor CIF, h_rank/max_krit, kat_zeme (spec 2.3(2))
# ===========================================================================


def test_vendor_cif_two_paths_any_true():
    """07!cif = ANY-true over the asset path (10) AND the direct §1 path (11).

    Builder sheets_vendors.py:96-98: COUNTIFS(10.C,this,10.M,"Ano")
    + COUNTIFS(11§1.C,this,11§1.F,"Ano") > 0.
    """
    graph = IctRegisterGraph(
        processes=(cif_process_row(1), low_process_row(2)),
        assets=(asset_row(1),),
        # Asset 1 is CIF via linked process 1 (asset cif = ANY-true over 05).
        process_asset_links=(ProcessAssetLinkInput(process_id=1, asset_id=1),),
        asset_vendor_links=(vad(1, 10),),  # vendor 10: asset path only
        process_vendor_links=(
            ProcessVendorLinkInput(process_id=1, vendor_id=20),  # CIF process, §1 path
            ProcessVendorLinkInput(process_id=2, vendor_id=30),  # non-CIF process
        ),
        vendors=(vendor_row(10), vendor_row(20), vendor_row(30), vendor_row(40)),
    )
    result = derive(graph)
    assert result.vendors[10].cif == "Ano"  # via the asset cascade
    assert result.vendors[10].inputs.cif_asset_link_count == 1
    assert result.vendors[20].cif == "Ano"  # via the direct process pair
    assert result.vendors[20].inputs.cif_process_link_count == 1
    assert result.vendors[30].cif == "Ne"  # linked, but the process is not CIF
    assert result.vendors[40].cif == "Ne"  # no links at all


def test_vendor_h_rank_is_max_of_max_and_empty_maxifs_resolves_to_zero():
    """h_rank = IFERROR(MAXIFS(10.assetRank, 10.vendorID=this), 0);
    max_krit = CHOOSE(h_rank,...) — blank at 0 ("empty means none").

    Builder sheets_vendors.py:106-108, 153-154; per-link rank :440-441.
    """
    graph = IctRegisterGraph(
        assets=(
            asset_row(1, preliminary_criticality="medium"),  # vysledna Střední (rank 2)
            asset_row(
                2, preliminary_criticality="critical"
            ),  # vysledna Kritická (rank 4)
            asset_row(3),  # no signals: vysledna blank, contributes nothing
        ),
        asset_vendor_links=(vad(1, 1), vad(2, 1), vad(3, 1), vad(3, 2)),
        vendors=(vendor_row(1), vendor_row(2), vendor_row(3)),
    )
    result = derive(graph)
    assert result.vendors[1].h_rank == 4  # MAX over ranks {2, 4, blank}
    assert result.vendors[1].max_criticality == "Kritická"
    # Only unranked assets linked: MAXIFS over blanks -> 0 -> blank class.
    assert result.vendors[2].h_rank == 0
    assert result.vendors[2].max_criticality is None
    # No links at all: IFERROR(MAXIFS(...),0) -> 0 -> blank class.
    assert result.vendors[3].h_rank == 0
    assert result.vendors[3].max_criticality is None


@pytest.mark.parametrize(
    ("country", "expected"),
    [
        ("CZ", "ČR"),
        ("SK", "EU"),
        ("LU", "EU"),
        ("US", "mimo EU"),
        ("XX", "?"),  # INDEX/MATCH miss -> the formula's IFERROR "?"
        (None, None),  # IF(zeme="","") guard
    ],
)
def test_vendor_country_category_static_lookup(country: str | None, expected: str | None):
    """kat_zeme (spec 3.4): CZ->ČR; SK,DE,AT,NL,PL,IE,FR,LU->EU; GB,US->mimo EU."""
    result = derive(IctRegisterGraph(vendors=(vendor_row(1, country=country),)))
    assert result.vendors[1].country_category == expected


# ===========================================================================
# Seam 1 — the tier formula, every branch (spec 2.3(3))
# ===========================================================================


def test_tier_critical_gate_is_cif_ret_and_nothing_else_is_checked():
    """Kritický ⇔ cif_ret="Ano" — the ONLY gate; substitutability and cloud
    links are never consulted once it is true (builder :109-115)."""
    graph = IctRegisterGraph(
        processes=(cif_process_row(1),),
        vendors=(vendor_row(1, substitutability="Snadno nahraditelný"),),
        process_vendor_links=(ProcessVendorLinkInput(process_id=1, vendor_id=1),),
    )
    result = derive(graph)
    assert result.vendors[1].cif == "Ano"
    assert result.vendors[1].cif_chain == "Ano"
    assert result.vendors[1].tier == "Kritický dodavatel"


def test_tier_significant_via_max_linked_asset_rank_at_least_high():
    """Významný via N(h_rank)>=3 — a Vysoká asset WITHOUT CIF; the rank-2
    boundary stays Standardní."""
    graph = IctRegisterGraph(
        assets=(
            asset_row(1, preliminary_criticality="high"),
            asset_row(2, preliminary_criticality="medium"),
        ),
        asset_vendor_links=(vad(1, 1), vad(2, 2)),
        vendors=(vendor_row(1), vendor_row(2)),
    )
    result = derive(graph)
    assert result.vendors[1].cif == "Ne"
    assert result.vendors[1].h_rank == 3
    assert result.vendors[1].tier == "Významný dodavatel"
    assert result.vendors[1].inputs.tier_max_rank_at_least_high is True
    # Boundary: rank 2 (Střední) does not reach the >=3 trigger.
    assert result.vendors[2].h_rank == 2
    assert result.vendors[2].tier == "Standardní dodavatel"


@pytest.mark.parametrize(
    ("substitutability", "expected_tier"),
    [
        # The formula's two literals (builder :111-112) — the top-2 Substituce values.
        ("Nenahraditelný", "Významný dodavatel"),
        ("Velmi obtížně nahraditelný", "Významný dodavatel"),
        ("Středně obtížně nahraditelný", "Standardní dodavatel"),
        ("Snadno nahraditelný", "Standardní dodavatel"),
        (None, "Standardní dodavatel"),
    ],
)
def test_tier_significant_via_substitutability_without_any_links(
    substitutability: str | None, expected_tier: str
):
    """The structurally-unreachable branch, driven via direct engine input: no
    VAD links (h_rank=0), no CIF — substitutability alone decides (spec
    section 8 item 3: unreachable for every seeded candidate until a human
    enters linking/substitutability data)."""
    result = derive(IctRegisterGraph(vendors=(vendor_row(1, substitutability=substitutability),)))
    assert result.vendors[1].h_rank == 0
    assert result.vendors[1].cif_chain == "Ne"
    assert result.vendors[1].tier == expected_tier


@pytest.mark.parametrize(
    ("code", "expected_tier"),
    [
        ("S17", "Významný dodavatel"),  # IaaS
        ("S18", "Významný dodavatel"),  # PaaS
        ("S19", "Významný dodavatel"),  # SaaS
        ("S16", "Standardní dodavatel"),  # non-cloud code: no trigger
    ],
)
def test_tier_significant_via_cloud_service_codes(code: str, expected_tier: str):
    """COUNTIFS over S17+S18+S19 links (builder :113-114) — ANY cloud link to
    an unranked, non-CIF asset still lifts the tier."""
    graph = IctRegisterGraph(
        assets=(asset_row(1),),
        asset_vendor_links=(vad(1, 1, code),),
        vendors=(vendor_row(1),),
    )
    result = derive(graph)
    assert result.vendors[1].h_rank == 0
    assert result.vendors[1].tier == expected_tier
    assert result.vendors[1].inputs.cloud_service_link_count == (1 if code != "S16" else 0)


# ===========================================================================
# Seam 1 — cif_ret propagation + rank recursion (spec 2.3(3a)/(3b))
# ===========================================================================


def _three_deep_chain_graph(*, prime_is_cif: bool) -> IctRegisterGraph:
    """Prime vendor 1 -> contract 100 -> X(11, rank 2) -> Y(12, rank 3) -> Z(13, rank 4).

    Sub-provider rows carry ``sub_provider_vendor_id`` — the engine-level
    analog of 09!F (see the engine module docstring for the #45 disposition).
    """
    prime_links = (
        (ProcessVendorLinkInput(process_id=1, vendor_id=1),) if prime_is_cif else ()
    )
    return IctRegisterGraph(
        processes=(cif_process_row(1),),
        vendors=(vendor_row(1), vendor_row(11), vendor_row(12), vendor_row(13)),
        process_vendor_links=prime_links,
        contracts=(contract_row(100, 1, contract_reference="SML-2020-001"),),
        sub_outsourcing=(
            sub_row(31, 1, 100, sub_provider_name="X", sub_provider_vendor_id=11),
            sub_row(32, 1, 100, predecessor_id=31, sub_provider_name="Y", sub_provider_vendor_id=12),
            sub_row(33, 1, 100, predecessor_id=32, sub_provider_name="Z", sub_provider_vendor_id=13),
        ),
    )


def test_cif_ret_propagates_uniformly_down_a_three_deep_chain():
    """The contract's hidden 08!W carries the PRIME vendor's cif; every chain
    row's J reads that same W — uniform at ranks 2, 3, AND 4, never re-derived
    per tier (builder :287-289, :366-368; spec 2.3(3a))."""
    result = derive(_three_deep_chain_graph(prime_is_cif=True))
    assert result.contracts[100].cif == "Ano"
    assert [result.sub_outsourcing[sid].rank for sid in (31, 32, 33)] == [2, 3, 4]
    assert [result.sub_outsourcing[sid].critical_service for sid in (31, 32, 33)] == [
        "Ano",
        "Ano",
        "Ano",
    ]
    # cif_ret = Ano for every subcontractor vendor, at every depth -> Kritický.
    for vendor_id in (11, 12, 13):
        assert result.vendors[vendor_id].cif == "Ne"  # no own links
        assert result.vendors[vendor_id].cif_chain == "Ano"
        assert result.vendors[vendor_id].tier == "Kritický dodavatel"


def test_cif_ret_stays_ne_when_the_prime_vendor_is_not_cif():
    result = derive(_three_deep_chain_graph(prime_is_cif=False))
    assert result.contracts[100].cif == "Ne"
    assert [result.sub_outsourcing[sid].critical_service for sid in (31, 32, 33)] == [
        "Ne",
        "Ne",
        "Ne",
    ]
    for vendor_id in (11, 12, 13):
        assert result.vendors[vendor_id].cif_chain == "Ne"
        assert result.vendors[vendor_id].tier == "Standardní dodavatel"


def test_sub_outsourcing_rank_recursion_and_break_sentinel():
    """09!I (builder :362-365): direct = 2, deeper = predecessor + 1; a missing
    predecessor yields the "?" sentinel (rank None) and 09!K flags
    CHYBA ŘETĚZCE; the break PROPAGATES ("?"+1 is an Excel error -> "?")."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1),),
        contracts=(contract_row(100, 1),),
        sub_outsourcing=(
            sub_row(31, 1, 100, sub_provider_name="A"),
            sub_row(32, 1, 100, predecessor_id=31, sub_provider_name="B"),
            # Predecessor id 999 exists nowhere: broken.
            sub_row(33, 1, 100, predecessor_id=999, sub_provider_name="C"),
            # Child of the broken row: the "?" propagates down.
            sub_row(34, 1, 100, predecessor_id=33, sub_provider_name="D"),
        ),
    )
    result = derive(graph)
    assert result.sub_outsourcing[31].rank == 2
    assert result.sub_outsourcing[31].chain_check == "OK"
    assert result.sub_outsourcing[32].rank == 3
    assert result.sub_outsourcing[32].inputs.predecessor_rank == 2
    assert result.sub_outsourcing[33].rank is None
    assert result.sub_outsourcing[33].chain_check == "CHYBA ŘETĚZCE"
    assert result.sub_outsourcing[34].rank is None
    assert result.sub_outsourcing[34].chain_check == "CHYBA ŘETĚZCE"


def test_sub_outsourcing_cross_contract_predecessor_and_cycle_break_the_chain():
    """The workbook MATCH searches the compound key under the SAME contract
    (M = B&"|"&F, builder :371-372) — a cross-contract predecessor finds no
    row; a cycle can never resolve. Both yield the sentinel (write-time policy
    forbids them; the pure engine must still never loop)."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1),),
        contracts=(contract_row(100, 1), contract_row(200, 1)),
        sub_outsourcing=(
            sub_row(31, 1, 100, sub_provider_name="A"),
            # Predecessor lives under contract 100; this row under 200: broken.
            sub_row(41, 1, 200, predecessor_id=31, sub_provider_name="B"),
            # A two-row cycle (unwritable in production): both unresolvable.
            sub_row(51, 1, 100, predecessor_id=52, sub_provider_name="C"),
            sub_row(52, 1, 100, predecessor_id=51, sub_provider_name="D"),
        ),
    )
    result = derive(graph)
    assert result.sub_outsourcing[41].rank is None
    assert result.sub_outsourcing[41].chain_check == "CHYBA ŘETĚZCE"
    assert result.sub_outsourcing[51].rank is None
    assert result.sub_outsourcing[52].rank is None


def test_sub_outsourcing_duplicate_check_wins_over_chain_error():
    """09!K = IF(dup>1,"DUPLICITA",IF(I="?","CHYBA ŘETĚZCE","OK")) (builder
    :369-370): the duplicate finding takes precedence; the key is
    contract|sub-provider, and blank identities never participate."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1),),
        contracts=(contract_row(100, 1), contract_row(200, 1)),
        sub_outsourcing=(
            # Same contract + same name twice; the second one even has a
            # broken predecessor — DUPLICITA still wins.
            sub_row(31, 1, 100, sub_provider_name="CLOUD OPS"),
            sub_row(32, 1, 100, predecessor_id=999, sub_provider_name="CLOUD OPS"),
            # The same name under ANOTHER contract is a different key: OK.
            sub_row(41, 1, 200, sub_provider_name="CLOUD OPS"),
            # Blank names never form a duplicate key (M="" when F="").
            sub_row(51, 1, 100),
            sub_row(52, 1, 100),
        ),
    )
    result = derive(graph)
    assert result.sub_outsourcing[31].chain_check == "DUPLICITA"
    assert result.sub_outsourcing[32].chain_check == "DUPLICITA"
    assert result.sub_outsourcing[41].chain_check == "OK"
    assert result.sub_outsourcing[51].chain_check == "OK"
    assert result.sub_outsourcing[52].chain_check == "OK"


def test_sub_outsourcing_contract_lookups():
    """09!C/D/J/O are XLOOKUPs into 08 (builder :354-358, :366-368, :375-377)."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1, name="BIZ DATA"),),
        contracts=(
            contract_row(100, 1, contract_reference="SML-2020-001", roi_scope="Ano"),
        ),
        sub_outsourcing=(sub_row(31, 1, 100, sub_provider_name="X"),),
    )
    result = derive(graph)
    entry = result.sub_outsourcing[31]
    assert entry.contract_reference == "SML-2020-001"
    assert entry.contract_vendor_id == 1
    assert entry.contract_vendor_name == "BIZ DATA"
    assert entry.roi_scope == "Ano"
    assert entry.inputs.is_direct is True


# ===========================================================================
# Seam 1 — uroven_ret, subdod, vyz_vysledek (spec 1.3 ~263, ~264, ~267)
# ===========================================================================


def test_chain_level_a_for_any_own_contract_asset_or_process_link():
    """uroven_ret "A" ⇔ N(h_smluv)+N(aktiva_n)+N(proc_n)>0 (builder :116-119)."""
    graph = IctRegisterGraph(
        processes=(low_process_row(1),),
        assets=(asset_row(1),),
        asset_vendor_links=(vad(1, 2),),
        process_vendor_links=(ProcessVendorLinkInput(process_id=1, vendor_id=3),),
        vendors=(vendor_row(1), vendor_row(2), vendor_row(3), vendor_row(4)),
        contracts=(contract_row(100, 1),),
    )
    result = derive(graph)
    assert result.vendors[1].chain_level == "A"  # via a contract
    assert result.vendors[2].chain_level == "A"  # via an asset link
    assert result.vendors[3].chain_level == "A"  # via a §1 process link
    assert result.vendors[4].chain_level is None  # nothing anywhere -> blank


def test_chain_level_b_and_c_from_subcontractor_rank():
    """"B" ⇔ subcontractor at rank exactly 2 anywhere; "C" ⇔ subcontractor at
    all (deeper, or with a broken rank)."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1), vendor_row(11), vendor_row(12), vendor_row(13)),
        contracts=(contract_row(100, 1),),
        sub_outsourcing=(
            sub_row(31, 1, 100, sub_provider_name="X", sub_provider_vendor_id=11),
            sub_row(32, 1, 100, predecessor_id=31, sub_provider_name="Y", sub_provider_vendor_id=12),
            # Broken rank: counts for C (COUNTIF matches F), never for B.
            sub_row(33, 1, 100, predecessor_id=999, sub_provider_name="Z", sub_provider_vendor_id=13),
        ),
    )
    result = derive(graph)
    assert result.vendors[11].chain_level == "B"  # rank 2
    assert result.vendors[12].chain_level == "C"  # rank 3 only
    assert result.vendors[13].chain_level == "C"  # broken rank, still a sub


def test_direct_sub_providers_list_rows_whose_parent_is_this_vendor():
    """subdod/subdod_n (builder :120-123): rows where 09!E = this vendor — the
    contract-direct rows for the prime vendor, the successor rows for a
    mid-chain subcontractor."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1), vendor_row(11)),
        contracts=(contract_row(100, 1),),
        sub_outsourcing=(
            sub_row(31, 1, 100, sub_provider_name="X", sub_provider_vendor_id=11),
            sub_row(32, 1, 100, predecessor_id=31, sub_provider_name="Y"),
            sub_row(33, 1, 100, sub_provider_name="W"),
        ),
    )
    result = derive(graph)
    assert result.vendors[1].direct_sub_provider_names == ("X", "W")
    assert result.vendors[1].direct_sub_provider_count == 2
    # X (vendor 11) is the parent of Y through the predecessor edge.
    assert result.vendors[11].direct_sub_provider_names == ("Y",)
    assert result.vendors[11].direct_sub_provider_count == 1


@pytest.mark.parametrize("answer_field", [
    "significance_authorization_conditions",
    "significance_regulatory_requirements",
    "significance_service_quality",
    "significance_financial_impact",
    "significance_reputation_continuity",
    "significance_cumulative_impact",
])
def test_significance_outcome_any_true_over_the_six_criteria(answer_field: str):
    """vyz_vysledek = "Ano" iff COUNTIF(the 6 criteria,"Ano")>0 (builder
    :134-136); "Ne" and "Nerelevantní" never count."""
    single_yes = derive(IctRegisterGraph(vendors=(vendor_row(1, **{answer_field: "Ano"}),)))
    assert single_yes.vendors[1].significance_outcome == "Ano"

    others = derive(
        IctRegisterGraph(vendors=(vendor_row(1, **{answer_field: "Nerelevantní"}),))
    )
    assert others.vendors[1].significance_outcome == "Ne"


def test_significance_outcome_ne_for_all_blank_or_all_ne():
    all_blank = derive(IctRegisterGraph(vendors=(vendor_row(1),)))
    assert all_blank.vendors[1].significance_outcome == "Ne"
    all_ne = derive(
        IctRegisterGraph(
            vendors=(
                vendor_row(
                    1,
                    significance_authorization_conditions="Ne",
                    significance_regulatory_requirements="Ne",
                    significance_service_quality="Ne",
                    significance_financial_impact="Ne",
                    significance_reputation_continuity="Ne",
                    significance_cumulative_impact="Ne",
                ),
            )
        )
    )
    assert all_ne.vendors[1].significance_outcome == "Ne"


# ===========================================================================
# Seam 1 — Vendor hotovo incl. the ex-ante conditional (spec 1.3 ~268)
# ===========================================================================


def _complete_vendor_kwargs() -> dict[str, object]:
    return {
        "person_type": "Právnická osoba",
        "identifier_type": "IČO (CRN)",
        "identifier_value": "12345678",
        "country": "CZ",
        "substitutability": "Snadno nahraditelný",
        "exit_plan_state": "Schválen",
    }


def _complete_main_contract(cid: int = 100, vendor_id: int = 1) -> VendorContractInput:
    return contract_row(
        cid,
        vendor_id,
        contract_reference="SML-2020-001",
        arrangement_type="Rámcové (master)",
        main_contract="Ano",
        start_date=date(2020, 1, 1),
        end_date=date(9999, 12, 31),
    )


def test_vendor_completeness_requires_identity_main_contract_subst_and_exit():
    """07!hotovo (builder :142-148): COUNTBLANK(typ_osoby:zeme) +
    COUNTBLANK(sml_ref:typ_ujedn) + COUNTBLANK(zahajeni:ukonceni) + subst +
    exit — all zero. Substitutability "Snadno nahraditelný" keeps the tier
    Standardní, so no ex-ante date is required."""
    complete = derive(
        IctRegisterGraph(
            vendors=(vendor_row(1, **_complete_vendor_kwargs()),),
            contracts=(_complete_main_contract(),),
        )
    )
    assert complete.vendors[1].tier == "Standardní dodavatel"
    assert complete.vendors[1].is_complete is True
    assert complete.vendors[1].inputs.missing_for_completeness == ()
    assert complete.vendors[1].main_contract_reference == "SML-2020-001"
    assert complete.vendors[1].main_contract_arrangement_type == "Rámcové (master)"
    assert complete.vendors[1].contract_count == 1
    assert complete.vendors[1].main_contract_count == 1

    # Without ANY main contract, all four block-B lookups are blank.
    no_main = derive(IctRegisterGraph(vendors=(vendor_row(1, **_complete_vendor_kwargs()),)))
    assert no_main.vendors[1].is_complete is False
    assert no_main.vendors[1].inputs.missing_for_completeness == (
        "main_contract_reference",
        "main_contract_arrangement_type",
        "main_contract_start_date",
        "main_contract_end_date",
    )


def test_vendor_completeness_ex_ante_date_required_only_for_top_tiers():
    """IF(AND(OR(tier=Kritický,tier=Významný), ea_datum=""),1,0) — the ex-ante
    date is a completeness ingredient ONLY for the top two tiers."""
    critical_kwargs = _complete_vendor_kwargs()
    graph = IctRegisterGraph(
        processes=(cif_process_row(1),),
        vendors=(vendor_row(1, **critical_kwargs),),
        process_vendor_links=(ProcessVendorLinkInput(process_id=1, vendor_id=1),),
        contracts=(_complete_main_contract(),),
    )
    missing_ea = derive(graph)
    assert missing_ea.vendors[1].tier == "Kritický dodavatel"
    assert missing_ea.vendors[1].is_complete is False
    assert missing_ea.vendors[1].inputs.missing_for_completeness == ("ex_ante_assessment_date",)

    with_ea = derive(
        IctRegisterGraph(
            processes=graph.processes,
            vendors=(vendor_row(1, ex_ante_assessment_date=date(2026, 1, 5), **critical_kwargs),),
            process_vendor_links=graph.process_vendor_links,
            contracts=graph.contracts,
        )
    )
    assert with_ea.vendors[1].is_complete is True


def test_vendor_main_contract_lookup_takes_the_first_main_in_row_order():
    """The block-B XLOOKUP over the hidden vendor-if-main column returns the
    FIRST match (builder :70-84); h_hlavni still counts both (DQ-39's feed)."""
    first = _complete_main_contract(100)
    second = contract_row(200, 1, contract_reference="SML-2021-002", main_contract="Ano")
    result = derive(
        IctRegisterGraph(
            vendors=(vendor_row(1, **_complete_vendor_kwargs()),),
            contracts=(first, second),
        )
    )
    assert result.vendors[1].main_contract_reference == "SML-2020-001"
    assert result.vendors[1].main_contract_count == 2


# ===========================================================================
# Seam 1 — Asset hotovo, deferred from #48 (builder sheets_core.py:400-406)
# ===========================================================================


def _complete_asset_kwargs() -> dict[str, object]:
    return {
        "asset_type": "application",
        "asset_level": "primary",
        "description": "Core pojistný systém",
        "physical_location": "DC Praha",
        "deployment_model": "on_premise",
        "business_owner": "Vlastník B",
        "ict_owner": "Vlastník ICT",
        "gdpr_relevance": "yes",
        "ai_relevance": "no",
        "data_classification": "highly_confidential_regulated",
        "confidentiality_rating": 5,
        "integrity_rating": 5,
        "availability_rating": 5,
        "authenticity_rating": 5,
        "impact_client": 5,
        "impact_regulatory": 5,
        "substitutability_rating": 5,
        "vendor_dependency_rating": 4,
        "internet_exposed": "no",
        "lifecycle_state": "operational",
    }


def test_asset_completeness_requires_every_span_and_a_primary_process():
    """04!hotovo: the COUNTBLANK spans (name-block, location, owners,
    regulation, CIAA, business impacts, dependency ratings, internet, state)
    plus the proc_id primary designation. `utvar` and every derived cell
    between the span endpoints are deliberately outside the check."""
    graph = IctRegisterGraph(
        processes=(low_process_row(1),),
        assets=(asset_row(1, **_complete_asset_kwargs()),),
        process_asset_links=(ProcessAssetLinkInput(process_id=1, asset_id=1, is_primary=True),),
    )
    complete = derive(graph)
    assert complete.assets[1].is_complete is True
    assert complete.assets[1].inputs.missing_for_completeness == ()

    # Same asset without the primary designation: the proc_id cell is blank.
    undesignated = derive(
        IctRegisterGraph(
            processes=(low_process_row(1),),
            assets=(asset_row(1, **_complete_asset_kwargs()),),
            process_asset_links=(ProcessAssetLinkInput(process_id=1, asset_id=1),),
        )
    )
    assert undesignated.assets[1].is_complete is False
    assert undesignated.assets[1].inputs.missing_for_completeness == ("primary_process",)


def test_asset_completeness_lists_missing_fields_in_span_order():
    kwargs = _complete_asset_kwargs()
    kwargs.pop("deployment_model")
    kwargs.pop("data_classification")
    kwargs.pop("internet_exposed")
    result = derive(
        IctRegisterGraph(
            processes=(low_process_row(1),),
            assets=(asset_row(1, **kwargs),),
            process_asset_links=(ProcessAssetLinkInput(process_id=1, asset_id=1, is_primary=True),),
        )
    )
    assert result.assets[1].is_complete is False
    assert result.assets[1].inputs.missing_for_completeness == (
        "deployment_model",
        "data_classification",
        "internet_exposed",
    )


def test_empty_asset_missing_list_places_primary_process_between_the_spans():
    """The proc_id pseudo-field sits between klasdat and c:au, as in the
    formula's COUNTBLANK order."""
    result = derive(IctRegisterGraph(assets=(asset_row(1),)))
    missing = result.assets[1].inputs.missing_for_completeness
    assert missing.index("primary_process") == missing.index("data_classification") + 1
    assert missing.index("primary_process") == missing.index("confidentiality_rating") - 1
    assert result.assets[1].is_complete is False


# ===========================================================================
# Seam 1 — Contract deriveds (spec 1.4 ~295-299)
# ===========================================================================


def test_contract_vendor_name_lookup_and_unknown_fallback():
    """F = IFERROR(XLOOKUP($E, 07!A, 07!B, "?"),"?") (builder :267-269)."""
    result = derive(
        IctRegisterGraph(
            vendors=(vendor_row(1, name="BIZ DATA"),),
            contracts=(contract_row(100, 1), contract_row(200, 999)),
        )
    )
    assert result.contracts[100].vendor_name == "BIZ DATA"
    assert result.contracts[200].vendor_name == "?"


def test_contract_duplicate_reference_check_is_register_wide():
    """U flags DUPLICITA when >1 row shares the Ref. smlouvy — across the
    WHOLE register, vendors notwithstanding (builder :283-284); blank
    references never participate."""
    result = derive(
        IctRegisterGraph(
            vendors=(vendor_row(1), vendor_row(2)),
            contracts=(
                contract_row(100, 1, contract_reference="SML-2020-001"),
                contract_row(200, 2, contract_reference="SML-2020-001"),
                contract_row(300, 1, contract_reference="SML-2021-002"),
                contract_row(400, 1),
                contract_row(500, 2),
            ),
        )
    )
    assert result.contracts[100].duplicate_check == "DUPLICITA"
    assert result.contracts[200].duplicate_check == "DUPLICITA"
    assert result.contracts[300].duplicate_check == "OK"
    assert result.contracts[400].duplicate_check == "OK"  # blank ref: no key
    assert result.contracts[500].duplicate_check == "OK"


def test_contract_chain_display_renders_full_depth_by_rank_tier():
    """S = vendor & " → " & TEXTJOIN(rank-2 names) & " → " & TEXTJOIN(rank-3
    names) (builder :276-282). The workbook's STRING stops at rank 3 — our
    display is full-depth (spec section 8 item 7, the recorded display-only
    deviation), so the rank-4 name appears in a third segment. Broken rows
    appear at no tier."""
    graph = IctRegisterGraph(
        vendors=(vendor_row(1, name="BIZ DATA"),),
        contracts=(contract_row(100, 1),),
        sub_outsourcing=(
            sub_row(31, 1, 100, sub_provider_name="X"),
            sub_row(32, 1, 100, sub_provider_name="W"),
            sub_row(33, 1, 100, predecessor_id=31, sub_provider_name="Y"),
            sub_row(34, 1, 100, predecessor_id=33, sub_provider_name="Z"),
            sub_row(35, 1, 100, predecessor_id=999, sub_provider_name="BROKEN"),
        ),
    )
    result = derive(graph)
    assert result.contracts[100].sub_outsourcing_chain == "BIZ DATA → X, W → Y → Z"
    assert result.contracts[100].inputs.sub_outsourcing_count == 5

    bare = derive(IctRegisterGraph(vendors=(vendor_row(1, name="BIZ DATA"),), contracts=(contract_row(100, 1),)))
    assert bare.contracts[100].sub_outsourcing_chain == "BIZ DATA"


# ===========================================================================
# Seam 1 — the derived §2 transitive expansion (spec 1.8, ~428-429; 1.1 ~137)
# ===========================================================================


def test_transitive_expansion_counts_two_rows_per_vad_role_pattern():
    """The §2 join emits one row per (05-link, 10-link) combination: the
    workbook's pairs_total = 2 × (# of 05-rows for the asset) when the asset
    carries two VAD roles (build.py `_pairs_total`, spec 1.8 §2) — never
    deduplicated by (process, vendor)."""
    graph = IctRegisterGraph(
        processes=(cif_process_row(1), low_process_row(2)),
        assets=(asset_row(1, name="Veris"),),
        process_asset_links=(
            ProcessAssetLinkInput(process_id=1, asset_id=1, is_primary=True),
            ProcessAssetLinkInput(process_id=2, asset_id=1),
        ),
        # Two roles (Dodává S02 / Spravuje S14), one vendor — the seed shape.
        asset_vendor_links=(
            vad(1, 10, "S02", vendor_name="BIZ DATA"),
            vad(1, 10, "S14", vendor_name="BIZ DATA"),
        ),
        vendors=(vendor_row(10, name="BIZ DATA"),),
    )
    result = derive(graph)

    # Process side: dod_n = §1 (0) + §2 (2 VAD × its own 05-link) = 2 each.
    assert result.processes[1].linked_vendor_count == 2
    assert result.processes[1].inputs.manual_vendor_link_count == 0
    assert result.processes[1].inputs.transitive_vendor_pair_count == 2
    assert result.processes[2].linked_vendor_count == 2

    # Vendor side: proc_n = §1 (0) + §2 (2 roles × 2 processes) = 4;
    # cif_proc_n counts only the CIF process's pairs.
    assert result.vendors[10].linked_process_count == 4
    assert result.vendors[10].cif_process_count == 2
    assert result.vendors[10].linked_asset_count == 2

    # The records carry the §2 columns: process, CIF, class, vendor, via-asset.
    links = result.vendors[10].transitive_process_links
    assert len(links) == 4
    assert {(link.process_id, link.via_asset_id) for link in links} == {(1, 1), (2, 1)}
    cif_link = next(link for link in links if link.process_id == 1)
    assert cif_link.process_name == "Proces 1"
    assert cif_link.process_cif == "Ano"
    assert cif_link.process_criticality == "Kritická"
    assert cif_link.vendor_name == "BIZ DATA"
    assert cif_link.via_asset_name == "Veris"

    # The process-side view carries the same records, filtered.
    process_links = result.processes[1].transitive_vendor_links
    assert len(process_links) == 2
    assert {link.vendor_id for link in process_links} == {10}


def test_manual_and_transitive_pairs_add_up_in_dod_n():
    """dod_n = COUNTIF(11§1) + COUNTIF(11§2) (builder sheets_core.py:202-204)."""
    graph = IctRegisterGraph(
        processes=(cif_process_row(1),),
        assets=(asset_row(1),),
        process_asset_links=(ProcessAssetLinkInput(process_id=1, asset_id=1),),
        asset_vendor_links=(vad(1, 10),),
        process_vendor_links=(ProcessVendorLinkInput(process_id=1, vendor_id=10),),
        vendors=(vendor_row(10),),
    )
    result = derive(graph)
    # §1 = 1 manual pair, §2 = 1 derived triple — both count, same vendor or not.
    assert result.processes[1].linked_vendor_count == 2
    assert result.vendors[10].linked_process_count == 2
    assert result.vendors[10].cif_process_count == 2


# ===========================================================================
# Seam 2 — HTTP via client_factory: the three vendor-domain derived blocks.
# ===========================================================================


async def _create_via_api(client, path: str, payload: dict[str, object]) -> dict[str, object]:
    response = await client.post(path, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def _create_vendor(client, *, department_id: int, owner_user_id: int, **overrides: object) -> dict:
    payload: dict[str, object] = {
        "name": "BIZ DATA",
        "process": "IT",
        "department_id": department_id,
        "outsourcing_owner_user_id": owner_user_id,
    }
    payload.update(overrides)
    return await _create_via_api(client, "/api/v1/vendors", payload)


@pytest.mark.asyncio
async def test_vendor_domain_read_payloads_carry_the_derived_blocks(
    client_factory, test_user_cro: User, test_department
):
    """The #49 cascade end to end over HTTP: a CIF process feeds an asset,
    the asset feeds the vendor, the contract propagates CIF down a 2-deep
    chain — and all three vendor-domain Read payloads expose their engine
    blocks, plus the Process dod_n flip and the Asset hotovo."""
    async with client_factory(user=test_user_cro) as client:
        process = await _create_via_api(
            client,
            "/api/v1/processes",
            {
                "l0_area": "Prodej a distribuce",
                "l1_process": "Sjednání pojištění",
                "l2_subprocess": "Online",
                "process_owner_user_id": test_user_cro.id,
                "owning_department_id": test_department.id,
                "impact_client": 4,
                "impact_market_operations": 4,
                "impact_regulatory": 4,
                "impact_financial": 4,
                "mtpd_hours": 4,
            },
        )
        asset = await _create_via_api(
            client,
            "/api/v1/assets",
            {
                "name": "Veris",
                "business_owner_user_id": test_user_cro.id,
                "ict_owner_user_id": test_user_cro.id,
                "owning_department_id": test_department.id,
            },
        )
        link = await client.post(
            f"/api/v1/assets/{asset['id']}/process-links",
            json={"process_id": process["id"], "is_primary": True},
        )
        assert link.status_code == 201, link.text

        vendor = await _create_vendor(
            client,
            department_id=test_department.id,
            owner_user_id=test_user_cro.id,
            country="CZ",
            replaceability="Nenahraditelný",
        )
        # Two VAD roles (the workbook seed shape: Dodává S02 / Spravuje S14).
        for code in ("S02", "S14"):
            created = await client.post(
                f"/api/v1/assets/{asset['id']}/vendor-links",
                json={"vendor_id": vendor["id"], "ict_service_code": code},
            )
            assert created.status_code == 201, created.text

        contract = await _create_via_api(
            client,
            f"/api/v1/vendors/{vendor['id']}/contracts",
            {
                "contract_reference": "SML-2020-001",
                "arrangement_type": "Rámcové (master)",
                "main_contract": "Ano",
                "roi_scope": "Ano",
                "start_date": "2020-01-01",
                "end_date": "9999-12-31",
            },
        )
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        direct = await _create_via_api(
            client, chain_url, {"contract_id": contract["id"], "sub_provider_name": "CLOUD OPS s.r.o."}
        )
        deeper = await _create_via_api(
            client,
            chain_url,
            {
                "contract_id": contract["id"],
                "predecessor_id": direct["id"],
                "sub_provider_name": "DC HOSTING GmbH",
            },
        )

        # --- Vendor detail: the engine block rides the Read payload.
        detail = await client.get(f"/api/v1/vendors/{vendor['id']}")
        assert detail.status_code == 200, detail.text
        derived = detail.json()["derived"]
        assert derived is not None
        assert derived["cif"] == "Ano"  # via the asset cascade
        assert derived["cif_chain"] == "Ano"
        assert derived["tier"] == "Kritický dodavatel"  # the cif_ret gate wins
        assert derived["country_category"] == "ČR"
        assert derived["linked_asset_count"] == 2
        assert derived["h_rank"] == 4  # Veris is Kritická (CIF floor + primary)
        assert derived["max_criticality"] == "Kritická"
        assert derived["chain_level"] == "A"
        assert derived["main_contract_reference"] == "SML-2020-001"
        assert derived["contract_count"] == 1
        assert derived["main_contract_count"] == 1
        assert derived["direct_sub_provider_names"] == ["CLOUD OPS s.r.o."]
        assert derived["significance_outcome"] == "Ne"
        # Kritický without an ex-ante date: incomplete, and the explain block
        # names the identity gaps too.
        assert derived["is_complete"] is False
        assert "ex_ante_assessment_date" in derived["inputs"]["missing_for_completeness"]
        # proc_n = §1 (0) + §2 (2 roles × 1 process) = 2.
        assert derived["linked_process_count"] == 2
        assert derived["cif_process_count"] == 2
        # The transitive expansion is browsable on the vendor payload.
        transitive = derived["transitive_process_links"]
        assert len(transitive) == 2
        assert {row["process_id"] for row in transitive} == {process["id"]}
        assert transitive[0]["process_name"] == "Sjednání pojištění – Online"
        assert transitive[0]["process_cif"] == "Ano"
        assert transitive[0]["via_asset_name"] == "Veris"

        # --- Contract collection: F/S/U/W ride each row.
        contracts = await client.get(f"/api/v1/vendors/{vendor['id']}/contracts")
        assert contracts.status_code == 200
        [contract_read] = contracts.json()
        assert contract_read["derived"]["vendor_name"] == "BIZ DATA"
        assert contract_read["derived"]["cif"] == "Ano"
        assert contract_read["derived"]["duplicate_check"] == "OK"
        assert (
            contract_read["derived"]["sub_outsourcing_chain"]
            == "BIZ DATA → CLOUD OPS s.r.o. → DC HOSTING GmbH"
        )

        # --- Sub-outsourcing collection: authoritative Ranks + uniform CIF.
        chain = await client.get(chain_url)
        assert chain.status_code == 200
        rows = {row["id"]: row for row in chain.json()}
        assert rows[direct["id"]]["derived"]["rank"] == 2
        assert rows[deeper["id"]]["derived"]["rank"] == 3
        assert rows[deeper["id"]]["derived"]["inputs"]["predecessor_rank"] == 2
        for row in rows.values():
            assert row["derived"]["critical_service"] == "Ano"  # uniform, spec 2.3(3a)
            assert row["derived"]["chain_check"] == "OK"
            assert row["derived"]["contract_reference"] == "SML-2020-001"
            assert row["derived"]["contract_vendor_name"] == "BIZ DATA"
            assert row["derived"]["roi_scope"] == "Ano"

        # --- Process detail: dod_n now counts the §2 triples.
        process_detail = await client.get(f"/api/v1/processes/{process['id']}")
        assert process_detail.status_code == 200
        process_derived = process_detail.json()["derived"]
        assert process_derived["linked_vendor_count"] == 2
        assert process_derived["inputs"]["manual_vendor_link_count"] == 0
        assert process_derived["inputs"]["transitive_vendor_pair_count"] == 2
        process_transitive = process_derived["transitive_vendor_links"]
        assert len(process_transitive) == 2
        assert {row["vendor_id"] for row in process_transitive} == {vendor["id"]}
        assert process_transitive[0]["vendor_name"] == "BIZ DATA"
        assert process_transitive[0]["via_asset_name"] == "Veris"

        # --- Asset detail: hotovo (deferred from #48) with the explain list.
        asset_detail = await client.get(f"/api/v1/assets/{asset['id']}")
        assert asset_detail.status_code == 200
        asset_derived = asset_detail.json()["derived"]
        assert asset_derived["is_complete"] is False
        missing = asset_derived["inputs"]["missing_for_completeness"]
        assert "asset_type" in missing
        assert "primary_process" not in missing  # designated above


@pytest.mark.asyncio
async def test_vendor_derived_block_recomputes_on_read(
    client_factory, test_user_cro: User, test_department
):
    """Compute-on-read: unlinking the CIF path immediately demotes the tier."""
    async with client_factory(user=test_user_cro) as client:
        process = await _create_via_api(
            client,
            "/api/v1/processes",
            {
                "l0_area": "Finance",
                "l1_process": "Regulatorní reporting",
                "process_owner_user_id": test_user_cro.id,
                "owning_department_id": test_department.id,
                "impact_client": 4,
                "impact_market_operations": 4,
                "impact_regulatory": 4,
                "impact_financial": 4,
                "mtpd_hours": 4,
            },
        )
        vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id
        )
        created = await client.post(
            f"/api/v1/processes/{process['id']}/vendor-links",
            json={"vendor_id": vendor["id"]},
        )
        assert created.status_code == 201, created.text
        link_id = created.json()["id"]

        before = await client.get(f"/api/v1/vendors/{vendor['id']}")
        assert before.json()["derived"]["tier"] == "Kritický dodavatel"
        assert before.json()["derived"]["cif"] == "Ano"

        removed = await client.delete(f"/api/v1/processes/{process['id']}/vendor-links/{link_id}")
        assert removed.status_code == 204, removed.text

        after = await client.get(f"/api/v1/vendors/{vendor['id']}")
        assert after.json()["derived"]["tier"] == "Standardní dodavatel"
        assert after.json()["derived"]["cif"] == "Ne"
        assert after.json()["derived"]["chain_level"] is None


@pytest.mark.asyncio
async def test_vendor_writes_that_include_derived_fields_are_rejected(
    client_factory, test_user_cro: User, test_department
):
    """AC: derived values are rejected on write — the derived block and every
    one of its member names 422 BY NAME, while Vendor writes stay tolerant of
    other unknown keys (the #44 decision, locked by the contracts suite)."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id
        )
        base = {
            "name": "X",
            "process": "IT",
            "department_id": test_department.id,
            "outsourcing_owner_user_id": test_user_cro.id,
        }
        for extra in (
            {"derived": {"tier": "Kritický dodavatel"}},
            {"tier": "Kritický dodavatel"},
            {"cif_chain": "Ano"},
            {"max_criticality": "Kritická"},
            {"country_category": "ČR"},
        ):
            response = await client.post("/api/v1/vendors", json={**base, **extra})
            assert response.status_code == 422, f"POST accepted derived field {extra}"
            patched = await client.patch(f"/api/v1/vendors/{vendor['id']}", json=extra)
            assert patched.status_code == 422, f"PATCH accepted derived field {extra}"

        # Non-derived unknown keys keep being ignored (legacy `status` senders).
        tolerant = await client.post("/api/v1/vendors", json={**base, "status": "active"})
        assert tolerant.status_code == 201, tolerant.text


@pytest.mark.asyncio
async def test_archived_predecessor_breaks_the_derived_chain(
    client_factory, test_user_cro: User, test_department
):
    """An archived predecessor is a #49 chain break, never a valid rank source:
    once the row a successor points at is archived it stops feeding the graph,
    so the successor's Rank recursion misses and 09!K derives "CHYBA ŘETĚZCE"
    (rank None). Spec 2.3(3b); sub_outsourcing_policy.py:120-121."""
    async with client_factory(user=test_user_cro) as client:
        vendor = await _create_vendor(
            client, department_id=test_department.id, owner_user_id=test_user_cro.id
        )
        contract = await _create_via_api(
            client,
            f"/api/v1/vendors/{vendor['id']}/contracts",
            {"contract_reference": "SML-2020-001"},
        )
        chain_url = f"/api/v1/vendors/{vendor['id']}/sub-outsourcing"
        predecessor = await _create_via_api(
            client, chain_url, {"contract_id": contract["id"], "sub_provider_name": "CLOUD OPS s.r.o."}
        )
        successor = await _create_via_api(
            client,
            chain_url,
            {
                "contract_id": contract["id"],
                "predecessor_id": predecessor["id"],
                "sub_provider_name": "DC HOSTING GmbH",
            },
        )

        # The fully active chain resolves: predecessor rank 2, successor rank 3.
        active = {row["id"]: row for row in (await client.get(chain_url)).json()}
        assert active[predecessor["id"]]["derived"]["rank"] == 2
        assert active[successor["id"]]["derived"]["rank"] == 3
        assert active[successor["id"]]["derived"]["chain_check"] == "OK"

        # Archive the predecessor — it leaves the active register entirely.
        assert (await client.delete(f"{chain_url}/{predecessor['id']}")).status_code == 204

        successor_row = next(
            row for row in (await client.get(chain_url)).json() if row["id"] == successor["id"]
        )
        assert successor_row["derived"]["rank"] is None
        assert successor_row["derived"]["chain_check"] == "CHYBA ŘETĚZCE"
