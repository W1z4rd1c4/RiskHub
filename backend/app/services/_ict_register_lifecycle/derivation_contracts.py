"""Vendor-contract derivation formulas for the ICT register."""

from __future__ import annotations

from collections.abc import Mapping

from ._derivation_impl import (
    CHECK_OK,
    DUPLICATE_CHECK,
    UNKNOWN_LOOKUP,
    SubOutsourcingInput,
    VendorContractDerivation,
    VendorContractDerivedInputs,
    VendorContractInput,
)


def _derive_contract(
    contract: VendorContractInput,
    *,
    vendor_names_by_id: Mapping[int, str],
    prime_vendor_cif: str,
    reference_counts: Mapping[str, int],
    contract_sub_rows: tuple[SubOutsourcingInput, ...],
    sub_ranks: Mapping[int, int | None],
) -> VendorContractDerivation:
    # F — =IFERROR(XLOOKUP($E, 07!A, 07!B, "?"),"?") (builder :267-269).
    vendor_name = vendor_names_by_id.get(contract.vendor_id, UNKNOWN_LOOKUP)

    # S — builder :276-282: the prime vendor's name, then one " → " segment
    # per rank tier joining that tier's sub-provider names with ", ". The
    # workbook display hardcodes tiers 2 and 3 (spec section 8 item 7); the
    # app renders the FULL depth — the recorded display-only deviation. A
    # broken row (rank "?") appears at no tier, exactly as in the workbook.
    chain_parts = [vendor_name]
    ranked_tiers = sorted(
        {rank for sub in contract_sub_rows if (rank := sub_ranks[sub.id]) is not None}
    )
    for tier in ranked_tiers:
        tier_names = [
            sub.sub_provider_name
            for sub in contract_sub_rows
            if sub_ranks[sub.id] == tier and sub.sub_provider_name
        ]
        chain_parts.append(", ".join(tier_names))
    sub_outsourcing_chain = " → ".join(chain_parts)

    # U — =IF(COUNTIF($B,$B{r})>1,"DUPLICITA","OK") (builder :283-284): the
    # Ref. smlouvy is compared across the WHOLE register, not per vendor.
    duplicate_count = (
        reference_counts.get(contract.contract_reference, 0)
        if contract.contract_reference is not None
        else 0
    )
    duplicate_check = DUPLICATE_CHECK if duplicate_count > 1 else CHECK_OK

    return VendorContractDerivation(
        vendor_name=vendor_name,
        sub_outsourcing_chain=sub_outsourcing_chain,
        duplicate_check=duplicate_check,
        # W — =IFERROR(XLOOKUP($E, 07!A, 07!cif, "Ne"),"Ne") (builder
        # :287-289): the prime vendor's own CIF (NOT cif_ret), read by every
        # subcontracting row under this contract.
        cif=prime_vendor_cif,
        inputs=VendorContractDerivedInputs(
            vendor_id=contract.vendor_id,
            prime_vendor_cif=prime_vendor_cif,
            reference_duplicate_count=duplicate_count,
            sub_outsourcing_count=len(contract_sub_rows),
        ),
    )


# ---------------------------------------------------------------------------
