"""Visibility helpers for user-owned notification payloads."""

from typing import Any

from sqlalchemy import Boolean, String, and_, cast, false, func, literal, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.functions import FunctionElement

from app.core.permissions import (
    can_resolve_approvals,
    control_visibility_clause,
    get_issue_scope_clause,
    has_permission,
    kri_visibility_clause,
    risk_visibility_clause,
    vendor_visibility_clause,
)
from app.models import (
    ApprovalRequest,
    ApprovalScenario,
    Control,
    GovernedMutationProposal,
    Issue,
    KeyRiskIndicator,
    Notification,
    Risk,
    RiskQuestionnaire,
    User,
)
from app.models.approval_request import ApprovalResourceType
from app.models.vendor import Vendor
from app.services._governed_mutations.asset_identity import (
    ASSET_ARCHIVE_KIND,
    ASSET_EDIT_KIND,
    ASSET_RELATIONSHIP_KINDS,
)
from app.services._governed_mutations.fixed_asset_policy import ASSET_SCENARIO_KEY
from app.services._governed_mutations.process_identity import (
    _JsonFieldArrayLength,
    _JsonFieldArrayText,
    _JsonFieldBoolean,
    _JsonFieldText,
    _JsonFieldType,
    _JsonObjectLength,
    _JsonType,
    any_governed_mutation_proposal_exists_clause,
)
from app.services._governed_mutations.process_mutations import (
    valid_extended_process_approval_ids,
)
from app.services.approval_scenario_policy import (
    approval_privilege_tier,
    governed_process_requester_clause,
    process_approval_resolver_clause,
)
from app.services.risk_questionnaire_service import can_read_questionnaire


class _JsonBoundedShape(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _CanonicalUuid4(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _JsonFieldArrayEquals(FunctionElement):
    type = Boolean()
    inherit_cache = True


class _StrictAssetSemanticEnvelope(FunctionElement):
    """Dialect-native, correlated equivalent of the strict Asset parser."""

    type = Boolean()
    inherit_cache = True


@compiles(_CanonicalUuid4, "sqlite")
def _compile_canonical_uuid4_sqlite(element, compiler, **kw):
    (value,) = [compiler.process(item, **kw) for item in element.clauses]
    compact = f"replace({value}, '-', '')"
    return (
        f"(length({value}) = 36 AND lower({value}) = {value} "
        f"AND substr({value}, 9, 1) = '-' AND substr({value}, 14, 1) = '-' "
        f"AND substr({value}, 15, 1) = '4' AND substr({value}, 19, 1) = '-' "
        f"AND substr({value}, 20, 1) IN ('8', '9', 'a', 'b') "
        f"AND substr({value}, 24, 1) = '-' AND {compact} NOT GLOB '*[^0-9a-f]*')"
    )


@compiles(_CanonicalUuid4, "postgresql")
def _compile_canonical_uuid4_postgresql(element, compiler, **kw):
    (value,) = [compiler.process(item, **kw) for item in element.clauses]
    return (
        f"({value} ~ '^[0-9a-f]{{8}}-[0-9a-f]{{4}}-4[0-9a-f]{{3}}-"
        "[89ab][0-9a-f]{3}-[0-9a-f]{12}$')"
    )


@compiles(_JsonFieldArrayEquals, "sqlite")
def _compile_json_field_array_equals_sqlite(element, compiler, **kw):
    document, key, expected = [compiler.process(item, **kw) for item in element.clauses]
    return f"(json_extract({document}, '$.' || {key}) = json({expected}))"


@compiles(_JsonFieldArrayEquals, "postgresql")
def _compile_json_field_array_equals_postgresql(element, compiler, **kw):
    document, key, expected = [compiler.process(item, **kw) for item in element.clauses]
    return f"(({document}->({key})) = ({expected})::jsonb)"


@compiles(_JsonBoundedShape, "sqlite")
def _compile_json_bounded_shape_sqlite(element, compiler, **kw):
    (document,) = [compiler.process(value, **kw) for value in element.clauses]
    tree = f"json_tree({document})"
    depth = (
        "((length(fullkey) - length(replace(fullkey, '.', ''))) + "
        "(length(fullkey) - length(replace(fullkey, '[', ''))))"
    )
    return (
        f"((SELECT count(*) FROM {tree}) <= 512 AND "
        f"NOT EXISTS (SELECT 1 FROM {tree} WHERE {depth} > 12) AND "
        f"NOT EXISTS (SELECT 1 FROM {tree} WHERE parent IS NOT NULL "
        "GROUP BY parent HAVING count(*) > 128))"
    )


@compiles(_JsonBoundedShape, "postgresql")
def _compile_json_bounded_shape_postgresql(element, compiler, **kw):
    (document,) = [compiler.process(value, **kw) for value in element.clauses]
    return (
        "(WITH RECURSIVE walk(value, depth) AS ("
        f"SELECT {document}, 0 UNION ALL "
        "SELECT child.value, walk.depth + 1 FROM walk "
        "CROSS JOIN LATERAL jsonb_path_query(walk.value, '$.*') AS child(value) "
        "WHERE walk.depth <= 12 AND jsonb_typeof(walk.value) IN ('object', 'array')"
        ") SELECT count(*) <= 512 AND coalesce(max(depth), 0) <= 12 AND NOT bool_or("
        "CASE jsonb_typeof(value) "
        "WHEN 'array' THEN jsonb_array_length(value) > 128 "
        "WHEN 'object' THEN (SELECT count(*) FROM jsonb_object_keys(value)) > 128 "
        "ELSE false END) FROM walk)"
    )


def _compiled_asset_semantic_arguments(element, compiler, **kw) -> list[str]:
    return [compiler.process(value, **kw) for value in element.clauses]


@compiles(_StrictAssetSemanticEnvelope, "sqlite")
def _compile_strict_asset_semantics_sqlite(element, compiler, **kw):
    (
        kind,
        primary_id,
        primary_name,
        base,
        before,
        after,
        derived,
        proposed,
        impacts,
        approval_action,
        approval_resource_id,
        pending,
    ) = _compiled_asset_semantic_arguments(element, compiler, **kw)

    def object_length(document: str) -> str:
        return f"(SELECT count(*) FROM json_each({document}))"

    def impact_block(document: str) -> str:
        return (
            f"(json_type({document}) = 'object' AND {object_length(document)} = 2 "
            f"AND json_type({document}, '$.cif') = 'text' "
            f"AND json_extract({document}, '$.cif') IN ('yes', 'no') "
            f"AND (json_type({document}, '$.resulting_criticality') = 'null' "
            f"OR (json_type({document}, '$.resulting_criticality') = 'text' "
            f"AND json_extract({document}, '$.resulting_criticality') "
            "IN ('low', 'medium', 'high', 'critical'))))"
        )

    before_impact = f"json_extract({derived}, '$.before')"
    after_impact = f"json_extract({derived}, '$.after')"
    proposed_before = f"json_extract({proposed}, '$.before')"
    proposed_after = f"json_extract({proposed}, '$.after')"
    first_impact = f"json_extract({impacts}, '$[0]')"
    base_version = f"json_extract({base}, '$.asset')"
    single_base = (
        f"json_type({base}) = 'object' AND {object_length(base)} = 1 "
        f"AND json_type({base}, '$.asset') = 'integer' AND {base_version} > 0"
    )
    single_impact = (
        f"json_type({impacts}) = 'array' AND json_array_length({impacts}) = 1 "
        f"AND json_type({first_impact}) = 'object' AND {object_length(first_impact)} = 4 "
        f"AND json_extract({first_impact}, '$.resource_type') = 'asset' "
        f"AND json_extract({first_impact}, '$.resource_id') IS {primary_id} "
        f"AND json_extract({first_impact}, '$.resource_name') IS {primary_name} "
        f"AND json_extract({first_impact}, '$.base_governance_version') IS {base_version}"
    )
    derived_pair = (
        f"json_type({derived}) = 'object' AND {object_length(derived)} = 2 "
        f"AND {impact_block(before_impact)} AND {impact_block(after_impact)}"
    )

    # pending_changes is the exact object diff of the immutable display snapshots.
    changed_keys = f"(SELECT key FROM json_each({before}) UNION SELECT key FROM json_each({after}))"
    changed = (
        f"((SELECT type FROM json_each({before}) WHERE key = keys.key) "
        f"IS NOT (SELECT type FROM json_each({after}) WHERE key = keys.key) OR "
        f"(SELECT value FROM json_each({before}) WHERE key = keys.key) "
        f"IS NOT (SELECT value FROM json_each({after}) WHERE key = keys.key))"
    )
    pending_exact = (
        f"json_type({pending}) = 'object' AND "
        f"{object_length(pending)} = (SELECT count(*) FROM {changed_keys} AS keys WHERE {changed}) "
        f"AND NOT EXISTS (SELECT 1 FROM json_each({pending}) AS delta "
        f"WHERE json_type(delta.value) != 'object' "
        f"OR (SELECT count(*) FROM json_each(delta.value)) != 2 "
        f"OR NOT EXISTS (SELECT 1 FROM json_each(delta.value) WHERE key = 'old') "
        f"OR NOT EXISTS (SELECT 1 FROM json_each(delta.value) WHERE key = 'new') "
        f"OR (SELECT type FROM json_each(delta.value) WHERE key = 'old') "
        f"IS NOT coalesce((SELECT type FROM json_each({before}) WHERE key = delta.key), 'null') "
        f"OR (SELECT value FROM json_each(delta.value) WHERE key = 'old') "
        f"IS NOT (SELECT value FROM json_each({before}) WHERE key = delta.key) "
        f"OR (SELECT type FROM json_each(delta.value) WHERE key = 'new') "
        f"IS NOT coalesce((SELECT type FROM json_each({after}) WHERE key = delta.key), 'null') "
        f"OR (SELECT value FROM json_each(delta.value) WHERE key = 'new') "
        f"IS NOT (SELECT value FROM json_each({after}) WHERE key = delta.key))"
    )

    create = (
        f"({kind} = 'asset.create' AND lower(CAST({approval_action} AS TEXT)) = 'create' "
        f"AND {primary_id} IS NULL AND {approval_resource_id} IS NULL "
        f"AND json_type({base}) = 'object' AND {object_length(base)} = 0 "
        f"AND json_type({before}) = 'object' AND {object_length(before)} = 0 "
        f"AND json_type({impacts}) = 'array' AND json_array_length({impacts}) = 0 "
        f"AND json_type({proposed}) = 'object' AND {object_length(proposed)} = 1 "
        f"AND json_type({proposed}, '$.after') = 'object' "
        f"AND json_type({derived}) = 'object' AND {object_length(derived)} = 2 "
        f"AND json_type({derived}, '$.before') = 'null' AND {impact_block(after_impact)})"
    )
    edit = (
        f"({kind} = 'asset.edit' AND lower(CAST({approval_action} AS TEXT)) = 'edit' "
        f"AND {primary_id} IS {approval_resource_id} AND {single_base} AND {single_impact} "
        f"AND json_type({proposed}) = 'object' AND {object_length(proposed)} = 2 "
        f"AND json_type({proposed_before}) = 'object' "
        f"AND json_type({proposed_after}) = 'object' "
        f"AND {object_length(proposed_after)} > 0 "
        f"AND {object_length(proposed_before)} = {object_length(proposed_after)} "
        f"AND NOT EXISTS (SELECT 1 FROM json_each({proposed_before}) raw_before "
        f"WHERE NOT EXISTS (SELECT 1 FROM json_each({proposed_after}) raw_after "
        f"WHERE raw_after.key = raw_before.key)) "
        f"AND NOT EXISTS (SELECT 1 FROM json_each({proposed_after}) raw_after "
        f"WHERE NOT EXISTS (SELECT 1 FROM json_each({proposed_before}) raw_before "
        f"WHERE raw_before.key = raw_after.key)) "
        f"AND {derived_pair})"
    )
    archive = (
        f"({kind} = 'asset.archive' AND lower(CAST({approval_action} AS TEXT)) = 'delete' "
        f"AND {primary_id} IS {approval_resource_id} AND {single_base} AND {single_impact} "
        f"AND json({before}) = json('{{\"is_archived\":false}}') "
        f"AND json({after}) = json('{{\"is_archived\":true}}') "
        f"AND json_type({proposed}) = 'object' AND {object_length(proposed)} = 2 "
        f"AND {derived_pair} AND json({before_impact}) = json({after_impact}))"
    )
    relationship_kinds = ", ".join(f"'{value}'" for value in sorted(ASSET_RELATIONSHIP_KINDS))
    operation = f"json_extract({proposed}, '$.operation')"
    relationship = (
        f"({kind} IN ({relationship_kinds}) AND lower(CAST({approval_action} AS TEXT)) = 'edit' "
        f"AND {primary_id} IS {approval_resource_id} AND json_type({base}) = 'object' "
        f"AND json_type({impacts}) = 'array' AND json_array_length({impacts}) > 0 "
        f"AND {object_length(base)} = json_array_length({impacts}) "
        f"AND NOT EXISTS (SELECT 1 FROM json_each({impacts}) AS impact "
        f"WHERE json_type(impact.value) != 'object' OR (SELECT count(*) FROM json_each(impact.value)) != 4 "
        f"OR json_extract(impact.value, '$.resource_type') != 'asset' "
        f"OR json_type(impact.value, '$.resource_id') != 'integer' "
        f"OR json_extract(impact.value, '$.resource_id') <= 0 "
        f"OR json_type(impact.value, '$.resource_name') != 'text' "
        f"OR trim(json_extract(impact.value, '$.resource_name')) = '' "
        f"OR json_extract(impact.value, '$.base_governance_version') "
        f"IS NOT (SELECT value FROM json_each({base}) "
        f"WHERE key = 'asset:' || json_extract(impact.value, '$.resource_id')) "
        f"OR EXISTS (SELECT 1 FROM json_each({impacts}) earlier "
        f"WHERE CAST(earlier.key AS INTEGER) < CAST(impact.key AS INTEGER) "
        f"AND json_extract(earlier.value, '$.resource_id') >= json_extract(impact.value, '$.resource_id'))) "
        f"AND EXISTS (SELECT 1 FROM json_each({impacts}) "
        f"WHERE json_extract(value, '$.resource_id') IS {primary_id}) "
        f"AND json_type({proposed}) = 'object' AND {object_length(proposed)} = 1 "
        f"AND json_type({operation}) = 'object' "
        f"AND {object_length(operation)} = CASE WHEN {kind} LIKE 'asset.link.risk.%' THEN 5 ELSE 4 END "
        f"AND {kind} = 'asset.link.' || json_extract({operation}, '$.relationship_type') "
        f"|| '.' || json_extract({operation}, '$.action') "
        f"AND json_extract({operation}, '$.relationship_type') IN ('asset', 'vendor', 'risk') "
        f"AND json_extract({operation}, '$.action') IN ('add', 'remove') "
        f"AND (CASE WHEN json_extract({operation}, '$.action') = 'add' "
        f"THEN json_type({operation}, '$.before') = 'null' AND json_type({operation}, '$.after') = 'object' "
        f"ELSE json_type({operation}, '$.before') = 'object' AND json_type({operation}, '$.after') = 'null' END) "
        f"AND (CASE WHEN json_extract({operation}, '$.relationship_type') = 'risk' "
        f"THEN json_type({operation}, '$.related_resource_id') = 'integer' "
        f"AND json_extract({operation}, '$.related_resource_id') > 0 "
        f"ELSE NOT EXISTS (SELECT 1 FROM json_each({operation}) WHERE key = 'related_resource_id') END) "
        f"AND json_type({before}) = 'object' AND {object_length(before)} = 1 "
        f"AND json_type({after}) = 'object' AND {object_length(after)} = 1 "
        f"AND json(json_extract({before}, '$.relationship')) IS json(json_extract({operation}, '$.before')) "
        f"AND json(json_extract({after}, '$.relationship')) IS json(json_extract({operation}, '$.after')) "
        f"AND json_type({derived}) = 'object' AND {object_length(derived)} = 1 "
        f"AND json_type({derived}, '$.assets') = 'array' "
        f"AND json_array_length(json_extract({derived}, '$.assets')) = json_array_length({impacts}) "
        f"AND NOT EXISTS (SELECT 1 FROM json_each(json_extract({derived}, '$.assets')) row "
        f"WHERE json_type(row.value) != 'object' OR (SELECT count(*) FROM json_each(row.value)) != 3 "
        f"OR json_extract(row.value, '$.resource_id') IS NOT "
        f"json_extract({impacts}, '$[' || row.key || '].resource_id') "
        f"OR NOT {impact_block("json_extract(row.value, '$.before')")} "
        f"OR NOT {impact_block("json_extract(row.value, '$.after')")}) )"
    )
    return f"(({create} OR {edit} OR {archive} OR {relationship}) AND {pending_exact})"


@compiles(_StrictAssetSemanticEnvelope, "postgresql")
def _compile_strict_asset_semantics_postgresql(element, compiler, **kw):
    (
        kind,
        primary_id,
        primary_name,
        base,
        before,
        after,
        derived,
        proposed,
        impacts,
        approval_action,
        approval_resource_id,
        pending,
    ) = _compiled_asset_semantic_arguments(element, compiler, **kw)
    relationship_kinds = ", ".join(f"'{value}'" for value in sorted(ASSET_RELATIONSHIP_KINDS))
    pending_jsonb = f"({pending})::jsonb"

    def object_length(document: str) -> str:
        return f"(SELECT count(*) FROM jsonb_object_keys({document}))"

    def impact_block(document: str) -> str:
        return (
            f"(jsonb_typeof({document}) = 'object' AND {object_length(document)} = 2 "
            f"AND {document}->>'cif' IN ('yes', 'no') "
            f"AND ({document}->'resulting_criticality' = 'null'::jsonb "
            f"OR {document}->>'resulting_criticality' IN ('low', 'medium', 'high', 'critical')))"
        )

    def positive_json_integer(document: str) -> tuple[str, str]:
        lexical = f"(({document})#>>'{{}}')"
        in_bigint_range = (
            f"(length({lexical}) < 19 OR "
            f"(length({lexical}) = 19 AND {lexical} <= '9223372036854775807'))"
        )
        guard = (
            f"jsonb_typeof({document}) = 'number' "
            f"AND {lexical} ~ '^[1-9][0-9]*$' AND {in_bigint_range}"
        )
        safe_value = f"CASE WHEN {guard} THEN {lexical}::bigint END"
        return guard, safe_value

    before_impact = f"{derived}->'before'"
    after_impact = f"{derived}->'after'"
    first_impact = f"{impacts}->0"
    first_resource_id_guard, first_resource_id = positive_json_integer(f"{first_impact}->'resource_id'")
    single_base = (
        f"jsonb_typeof({base}) = 'object' AND {object_length(base)} = 1 "
        f"AND jsonb_typeof({base}->'asset') = 'number' "
        f"AND ({base}->>'asset') ~ '^[1-9][0-9]*$'"
    )
    single_impact = (
        f"jsonb_typeof({impacts}) = 'array' AND jsonb_array_length({impacts}) = 1 "
        f"AND jsonb_typeof({first_impact}) = 'object' AND {object_length(first_impact)} = 4 "
        f"AND {first_impact}->>'resource_type' = 'asset' "
        f"AND {first_resource_id_guard} AND {first_resource_id} = {primary_id} "
        f"AND {first_impact}->>'resource_name' = {primary_name} "
        f"AND {first_impact}->>'base_governance_version' = {base}->>'asset'"
    )
    derived_pair = (
        f"jsonb_typeof({derived}) = 'object' AND {object_length(derived)} = 2 "
        f"AND {impact_block(before_impact)} AND {impact_block(after_impact)}"
    )
    pending_exact = (
        f"jsonb_typeof({pending_jsonb}) = 'object' "
        f"AND NOT EXISTS (SELECT 1 FROM jsonb_each({pending_jsonb}) delta "
        f"WHERE jsonb_typeof(delta.value) != 'object' OR {object_length('delta.value')} != 2 "
        "OR NOT (delta.value ?& ARRAY['old','new']) "
        f"OR delta.value->'old' IS DISTINCT FROM coalesce({before}->delta.key, 'null'::jsonb) "
        f"OR delta.value->'new' IS DISTINCT FROM coalesce({after}->delta.key, 'null'::jsonb)) "
        f"AND {object_length(pending_jsonb)} = "
        f"(SELECT count(*) FROM (SELECT jsonb_object_keys({before}) AS key "
        f"UNION SELECT jsonb_object_keys({after}) AS key) keys "
        f"WHERE {before}->keys.key IS DISTINCT FROM {after}->keys.key)"
    )
    create = (
        f"({kind} = 'asset.create' AND lower({approval_action}::text) = 'create' "
        f"AND {primary_id} IS NULL AND {approval_resource_id} IS NULL "
        f"AND {base} = '{{}}'::jsonb AND {before} = '{{}}'::jsonb AND {impacts} = '[]'::jsonb "
        f"AND jsonb_typeof({proposed}) = 'object' AND {object_length(proposed)} = 1 "
        f"AND jsonb_typeof({proposed}->'after') = 'object' "
        f"AND jsonb_typeof({derived}) = 'object' AND {object_length(derived)} = 2 "
        f"AND {derived}->'before' = 'null'::jsonb AND {impact_block(after_impact)})"
    )
    proposed_before = f"{proposed}->'before'"
    proposed_after = f"{proposed}->'after'"
    edit = (
        f"({kind} = 'asset.edit' AND lower({approval_action}::text) = 'edit' "
        f"AND {primary_id} = {approval_resource_id} AND {single_base} AND {single_impact} "
        f"AND jsonb_typeof({proposed}) = 'object' AND {object_length(proposed)} = 2 "
        f"AND jsonb_typeof({proposed_before}) = 'object' AND jsonb_typeof({proposed_after}) = 'object' "
        f"AND {object_length(proposed_after)} > 0 "
        f"AND NOT EXISTS (SELECT 1 FROM (SELECT jsonb_object_keys({proposed_before}) AS key "
        f"UNION SELECT jsonb_object_keys({proposed_after}) AS key) keys "
        f"WHERE NOT ({proposed_before} ? keys.key) OR NOT ({proposed_after} ? keys.key)) "
        f"AND {derived_pair})"
    )
    archive = (
        f"({kind} = 'asset.archive' AND lower({approval_action}::text) = 'delete' "
        f"AND {primary_id} = {approval_resource_id} AND {single_base} AND {single_impact} "
        f"AND {before} = '{{\"is_archived\":false}}'::jsonb "
        f"AND {after} = '{{\"is_archived\":true}}'::jsonb "
        f'AND {proposed} = \'{{"before":{{"is_archived":false}},"after":{{"is_archived":true}}}}\'::jsonb '
        f"AND {derived_pair} AND {before_impact} = {after_impact})"
    )
    operation = f"{proposed}->'operation'"
    impact_id_guard, impact_id = positive_json_integer("impact.value->'resource_id'")
    earlier_id_guard, earlier_id = positive_json_integer("earlier.value->'resource_id'")
    operation_related_id_guard, _operation_related_id = positive_json_integer(f"{operation}->'related_resource_id'")
    primary_impact_id_guard, primary_impact_id = positive_json_integer("impact->'resource_id'")
    relationship = (
        f"({kind} IN ({relationship_kinds}) AND lower({approval_action}::text) = 'edit' "
        f"AND {primary_id} = {approval_resource_id} "
        f"AND jsonb_typeof({base}) = 'object' AND jsonb_typeof({impacts}) = 'array' "
        f"AND jsonb_array_length({impacts}) > 0 "
        f"AND {object_length(base)} = jsonb_array_length({impacts}) "
        f"AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements({impacts}) WITH ORDINALITY impact(value, ord) "
        f"WHERE jsonb_typeof(impact.value) != 'object' OR {object_length('impact.value')} != 4 "
        f"OR impact.value->>'resource_type' != 'asset' "
        f"OR NOT ({impact_id_guard}) "
        f"OR coalesce(btrim(impact.value->>'resource_name'), '') = '' "
        f"OR impact.value->'base_governance_version' IS DISTINCT FROM "
        f"{base}->('asset:' || (impact.value->>'resource_id')) "
        f"OR EXISTS (SELECT 1 FROM jsonb_array_elements({impacts}) WITH ORDINALITY earlier(value, ord) "
        f"WHERE earlier.ord < impact.ord "
        f"AND {earlier_id_guard} AND {earlier_id} >= {impact_id})) "
        f"AND EXISTS (SELECT 1 FROM jsonb_array_elements({impacts}) impact "
        f"WHERE {primary_impact_id_guard} AND {primary_impact_id} = {primary_id}) "
        f"AND jsonb_typeof({proposed}) = 'object' AND {object_length(proposed)} = 1 "
        f"AND jsonb_typeof({operation}) = 'object' "
        f"AND {object_length(operation)} = CASE WHEN {kind} LIKE 'asset.link.risk.%' THEN 5 ELSE 4 END "
        f"AND {kind} = 'asset.link.' || ({operation}->>'relationship_type') || '.' || ({operation}->>'action') "
        f"AND {operation}->>'relationship_type' IN ('asset', 'vendor', 'risk') "
        f"AND {operation}->>'action' IN ('add', 'remove') "
        f"AND CASE WHEN {operation}->>'action' = 'add' THEN {operation}->'before' = 'null'::jsonb "
        f"AND jsonb_typeof({operation}->'after') = 'object' ELSE jsonb_typeof({operation}->'before') = 'object' "
        f"AND {operation}->'after' = 'null'::jsonb END "
        f"AND CASE WHEN {operation}->>'relationship_type' = 'risk' "
        f"THEN {operation_related_id_guard} "
        f"ELSE NOT ({operation} ? 'related_resource_id') END "
        f"AND {before} = jsonb_build_object('relationship', {operation}->'before') "
        f"AND {after} = jsonb_build_object('relationship', {operation}->'after') "
        f"AND jsonb_typeof({derived}) = 'object' AND {object_length(derived)} = 1 "
        f"AND jsonb_typeof({derived}->'assets') = 'array' "
        f"AND jsonb_array_length({derived}->'assets') = jsonb_array_length({impacts}) "
        f"AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements({derived}->'assets') WITH ORDINALITY row(value, ord) "
        f"JOIN jsonb_array_elements({impacts}) WITH ORDINALITY impact(value, ord) USING (ord) "
        f"WHERE jsonb_typeof(row.value) != 'object' OR {object_length('row.value')} != 3 "
        f"OR row.value->'resource_id' IS DISTINCT FROM impact.value->'resource_id' "
        f"OR NOT {impact_block("row.value->'before'")} OR NOT {impact_block("row.value->'after'")}) )"
    )
    return f"(({create} OR {edit} OR {archive} OR {relationship}) AND {pending_exact})"


async def visible_notification_clause(db: AsyncSession, current_user: User) -> ColumnElement[bool]:
    """Build the bounded SQL predicate for notifications visible to the current actor."""
    risk_clause = await risk_visibility_clause(db, current_user)
    control_clause = control_visibility_clause(current_user)
    kri_clause = await kri_visibility_clause(db, current_user)
    vendor_clause = vendor_visibility_clause(current_user)
    issue_clause = (
        await get_issue_scope_clause(db, current_user) if has_permission(current_user, "issues", "read") else false()
    )
    notification_approval_ids = set(
        (
            await db.execute(
                select(Notification.resource_id).where(
                    Notification.user_id == current_user.id,
                    func.lower(Notification.resource_type) == "approval",
                    Notification.resource_id.is_not(None),
                )
            )
        ).scalars()
    )
    valid_extended_ids = await valid_extended_process_approval_ids(
        db,
        approval_ids=notification_approval_ids,
    )
    resource_type = func.lower(Notification.resource_type)

    return and_(
        Notification.user_id == current_user.id,
        or_(
            Notification.resource_type.is_(None),
            Notification.resource_id.is_(None),
            and_(resource_type == "risk", _risk_exists_clause(risk_clause, Notification.resource_id)),
            and_(resource_type == "control", _control_exists_clause(control_clause, Notification.resource_id)),
            and_(resource_type == "kri", _kri_exists_clause(kri_clause, Notification.resource_id)),
            and_(resource_type == "vendor", _vendor_exists_clause(vendor_clause, Notification.resource_id)),
            and_(resource_type == "issue", _issue_exists_clause(issue_clause, Notification.resource_id)),
            and_(resource_type == "questionnaire", _questionnaire_exists_clause(risk_clause, Notification.resource_id)),
            and_(
                resource_type == "approval",
                _approval_exists_clause(
                    current_user,
                    risk_clause=risk_clause,
                    control_clause=control_clause,
                    kri_clause=kri_clause,
                    resource_id=Notification.resource_id,
                    valid_extended_approval_ids=valid_extended_ids,
                ),
            ),
        ),
    )


async def can_view_notification_resource(
    db: AsyncSession,
    current_user: User,
    notification: Notification,
) -> bool:
    """Return whether the linked notification payload is still visible to the actor."""
    clause = await visible_notification_clause(db, current_user)
    result = await db.execute(select(Notification.id).where(Notification.id == notification.id, clause))
    return result.scalar_one_or_none() is not None


async def _can_view_questionnaire_notification(db: AsyncSession, current_user: User, questionnaire_id: int) -> bool:
    questionnaire = await db.get(RiskQuestionnaire, questionnaire_id)
    if questionnaire is None:
        return False
    return await can_read_questionnaire(db, current_user, questionnaire)


async def paginate_visible_notifications(
    db: AsyncSession,
    current_user: User,
    *,
    skip: int,
    limit: int,
    unread_only: bool = False,
) -> tuple[list[Notification], int, int]:
    visibility_clause = await visible_notification_clause(db, current_user)
    total_query = select(func.count()).select_from(Notification).where(visibility_clause)
    if unread_only:
        total_query = total_query.where(Notification.is_read.is_(False))
    total = (await db.execute(total_query)).scalar() or 0

    unread_count = await count_visible_unread_notifications(db, current_user)

    page_query = (
        select(Notification)
        .where(visibility_clause)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(skip)
        .limit(limit)
    )
    if unread_only:
        page_query = page_query.where(Notification.is_read.is_(False))

    notifications = list((await db.execute(page_query)).scalars().all())
    return notifications, total, unread_count


async def count_visible_unread_notifications(db: AsyncSession, current_user: User) -> int:
    visibility_clause = await visible_notification_clause(db, current_user)
    result = await db.execute(
        select(func.count()).select_from(Notification).where(visibility_clause, Notification.is_read.is_(False))
    )
    return result.scalar() or 0


def _risk_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(Risk.id).where(Risk.id == resource_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _control_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(Control.id).where(Control.id == resource_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _kri_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = (
        select(KeyRiskIndicator.id)
        .join(Risk, Risk.id == KeyRiskIndicator.risk_id)
        .where(KeyRiskIndicator.id == resource_id)
    )
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _vendor_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(Vendor.id).where(Vendor.id == resource_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _issue_exists_clause(
    visibility_clause: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = select(Issue.id).where(Issue.id == resource_id)
    if visibility_clause is not None:
        query = query.where(visibility_clause)
    return query.exists()


def _questionnaire_exists_clause(
    risk_visibility_clause_value: ColumnElement[bool] | None,
    resource_id: Any,
) -> ColumnElement[bool]:
    query = (
        select(RiskQuestionnaire.id)
        .join(Risk, Risk.id == RiskQuestionnaire.risk_id)
        .where(RiskQuestionnaire.id == resource_id)
    )
    if risk_visibility_clause_value is not None:
        query = query.where(risk_visibility_clause_value)
    return query.exists()


def _approval_exists_clause(
    current_user: User,
    *,
    risk_clause: ColumnElement[bool] | None,
    control_clause: ColumnElement[bool] | None,
    kri_clause: ColumnElement[bool] | None,
    resource_id: Any,
    valid_extended_approval_ids: frozenset[int],
) -> ColumnElement[bool]:
    any_proposal = any_governed_mutation_proposal_exists_clause()
    direct_clauses: list[ColumnElement[bool]] = [
        or_(
            and_(
                ~any_proposal,
                ApprovalRequest.requested_by_id == current_user.id,
            ),
            governed_process_requester_clause(
                current_user.id,
                valid_extended_approval_ids,
            ),
            _asset_approval_visibility_clause(
                current_user,
            ),
        ),
        process_approval_resolver_clause(
            current_user,
            valid_extended_approval_ids,
        ),
        and_(
            ~any_proposal,
            ApprovalRequest.primary_approver_id == current_user.id,
        ),
    ]
    if approval_privilege_tier(current_user).is_privileged:
        direct_clauses.append(
            and_(
                ~any_proposal,
                true(),
            )
        )

    role_name = getattr(getattr(current_user, "role", None), "name", None)
    scenario_clause: ColumnElement[bool] = false()
    if role_name:
        scenario_clause = and_(
            ~any_proposal,
            ApprovalRequest.scenario_approver_roles.is_not(None),
            cast(ApprovalRequest.scenario_approver_roles, String).contains(f'"{role_name}"'),
            _approval_resource_visibility_clause(
                risk_clause=risk_clause,
                control_clause=control_clause,
                kri_clause=kri_clause,
            ),
        )

    return (
        select(ApprovalRequest.id)
        .where(
            ApprovalRequest.id == resource_id,
            or_(*direct_clauses, scenario_clause),
        )
        .exists()
    )


def _asset_approval_visibility_clause(
    current_user: User,
) -> ColumnElement[bool]:
    """Correlate one linked Asset approval without materializing proposal IDs."""
    proposal_exists = (
        select(GovernedMutationProposal.id)
        .where(
            GovernedMutationProposal.approval_request_id == ApprovalRequest.id,
            GovernedMutationProposal.primary_resource_type == "asset",
            GovernedMutationProposal.proposal_version == 1,
            GovernedMutationProposal.schema_version == 1,
            GovernedMutationProposal.requested_by_id == ApprovalRequest.requested_by_id,
            GovernedMutationProposal.primary_resource_name == ApprovalRequest.resource_name,
            _strict_asset_proposal_shape_clause(),
            _StrictAssetSemanticEnvelope(
                GovernedMutationProposal.mutation_kind,
                GovernedMutationProposal.primary_resource_id,
                GovernedMutationProposal.primary_resource_name,
                GovernedMutationProposal.base_versions,
                GovernedMutationProposal.before_snapshot,
                GovernedMutationProposal.after_snapshot,
                GovernedMutationProposal.derived_impact_snapshot,
                GovernedMutationProposal.proposed_changes,
                GovernedMutationProposal.impacted_resources_snapshot,
                ApprovalRequest.action_type,
                ApprovalRequest.resource_id,
                ApprovalRequest.pending_changes,
            ),
            or_(
                and_(
                    GovernedMutationProposal.primary_resource_id.is_(None),
                    ApprovalRequest.resource_id.is_(None),
                    GovernedMutationProposal.mutation_kind == "asset.create",
                ),
                and_(
                    GovernedMutationProposal.primary_resource_id == ApprovalRequest.resource_id,
                    GovernedMutationProposal.mutation_kind.in_(
                        (ASSET_EDIT_KIND, ASSET_ARCHIVE_KIND, *ASSET_RELATIONSHIP_KINDS)
                    ),
                ),
            ),
        )
        .correlate(ApprovalRequest)
        .exists()
    )
    role_name = getattr(getattr(current_user, "role", None), "name", None)
    live_resolver = false()
    if current_user.is_active and role_name in {"risk_manager", "cro"} and can_resolve_approvals(current_user):
        live_scenario = (
            select(ApprovalScenario.id)
            .where(
                ApprovalScenario.key == ASSET_SCENARIO_KEY,
                ApprovalScenario.requires_approval.is_(True),
                cast(ApprovalScenario.approver_roles, String).contains(f'"{role_name}"'),
                cast(ApprovalRequest.scenario_approver_roles, String).contains(f'"{role_name}"'),
                cast(ApprovalScenario.approver_roles, String) == cast(ApprovalRequest.scenario_approver_roles, String),
            )
            .correlate(ApprovalRequest)
            .exists()
        )
        live_resolver = and_(
            ApprovalRequest.requested_by_id != current_user.id,
            live_scenario,
        )
    return and_(
        ApprovalRequest.resource_type == ApprovalResourceType.ASSET,
        ApprovalRequest.scenario_key == ASSET_SCENARIO_KEY,
        proposal_exists,
        or_(ApprovalRequest.requested_by_id == current_user.id, live_resolver),
    )


def _strict_asset_proposal_shape_clause() -> ColumnElement[bool]:
    """SQL-side fail-closed envelope checks for correlated notification reads."""
    scenario = GovernedMutationProposal.scenario_snapshot
    roles_length = _JsonFieldArrayLength(scenario, literal("approver_roles"))
    first_role = _JsonFieldArrayText(
        scenario,
        literal("approver_roles"),
        literal(0),
    )
    second_role = _JsonFieldArrayText(
        scenario,
        literal("approver_roles"),
        literal(1),
    )
    return and_(
        _CanonicalUuid4(GovernedMutationProposal.proposal_id),
        _JsonType(scenario) == "object",
        _JsonObjectLength(scenario) == 3,
        _JsonFieldText(scenario, literal("key")) == ASSET_SCENARIO_KEY,
        _JsonFieldBoolean(scenario, literal("requires_approval")) == "true",
        _JsonFieldType(scenario, literal("approver_roles")) == "array",
        roles_length.in_((1, 2)),
        first_role.in_(("risk_manager", "cro")),
        or_(roles_length == 1, second_role.in_(("risk_manager", "cro"))),
        or_(roles_length == 1, second_role != first_role),
        _JsonFieldArrayEquals(
            scenario,
            literal("approver_roles"),
            ApprovalRequest.scenario_approver_roles,
        ),
        _JsonType(GovernedMutationProposal.base_versions) == "object",
        _JsonType(GovernedMutationProposal.before_snapshot) == "object",
        _JsonType(GovernedMutationProposal.after_snapshot) == "object",
        _JsonType(GovernedMutationProposal.derived_impact_snapshot) == "object",
        _JsonType(GovernedMutationProposal.proposed_changes) == "object",
        _JsonType(GovernedMutationProposal.impacted_resources_snapshot) == "array",
        _JsonBoundedShape(GovernedMutationProposal.scenario_snapshot),
        _JsonBoundedShape(GovernedMutationProposal.base_versions),
        _JsonBoundedShape(GovernedMutationProposal.before_snapshot),
        _JsonBoundedShape(GovernedMutationProposal.after_snapshot),
        _JsonBoundedShape(GovernedMutationProposal.derived_impact_snapshot),
        _JsonBoundedShape(GovernedMutationProposal.proposed_changes),
        _JsonBoundedShape(GovernedMutationProposal.impacted_resources_snapshot),
    )


def _approval_resource_visibility_clause(
    *,
    risk_clause: ColumnElement[bool] | None,
    control_clause: ColumnElement[bool] | None,
    kri_clause: ColumnElement[bool] | None,
) -> ColumnElement[bool]:
    return or_(
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.RISK,
            _risk_exists_clause(risk_clause, ApprovalRequest.resource_id),
        ),
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.CONTROL,
            _control_exists_clause(control_clause, ApprovalRequest.resource_id),
        ),
        and_(
            ApprovalRequest.resource_type == ApprovalResourceType.KRI,
            _kri_exists_clause(kri_clause, ApprovalRequest.resource_id),
        ),
    )
