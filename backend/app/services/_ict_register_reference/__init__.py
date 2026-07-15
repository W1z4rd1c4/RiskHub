"""ICT Register reference data — closed lists, workbook parameters, CZ->EN RoI maps.

Read-shape context (ADR-007): projects the workbook's reference data and the
seeded parameter rows; owns no commits. The functional reproduction spec at
docs/dora-ict-register/dora-excel-functional-spec.md is the source of truth.
"""

from app.services._ict_register_reference.closed_lists import (
    CANONICAL_PROVIDER_IDENTIFIER_TYPES,
    CLOSED_LISTS,
    DEPRECATED_PROVIDER_IDENTIFIER_TYPES,
    ClosedListValue,
    closed_list_values,
    is_closed_list_value,
    is_provider_identifier_type_write_value,
)
from app.services._ict_register_reference.country_categories import COUNTRY_CATEGORIES
from app.services._ict_register_reference.ict_service_taxonomy import (
    CLOUD_SERVICE_S_CODES,
    ICT_SERVICE_TAXONOMY,
)
from app.services._ict_register_reference.parameters import (
    ICT_APP_SCALE_RISK_BAND_DEFAULTS,
    ICT_PARAMETER_CONFIG_CATEGORY,
    ICT_WORKBOOK_PARAMETERS,
    ICT_WORKBOOK_PARAMETERS_BY_NAME,
    IctParameterValue,
    IctWorkbookParameter,
    IctWorkbookParameterSet,
    load_ict_workbook_parameter_set,
)
from app.services._ict_register_reference.process_values import (
    PROCESS_BCM_LINK_CODES,
    PROCESS_CIF_OVERRIDE_CODES,
    PROCESS_CONTROLLED_CODES_BY_FIELD,
    PROCESS_DR_TEST_RESULT_CODES,
    PROCESS_INTERRUPTION_IMPACT_CODES,
    PROCESS_LICENSED_ACTIVITY_CODES,
    PROCESS_PRELIMINARY_CRITICALITY_CODES,
    PROCESS_REGULATORY_EN_VALUES_BY_FIELD,
    WORKBOOK_PROCESS_VALUE_TO_CODE_BY_FIELD,
    process_controlled_value_code,
    process_regulatory_value,
)
from app.services._ict_register_reference.roi_maps import (
    ROI_CZ_EN_MAPS,
    roi_en_value,
    roi_map_entries,
)
from app.services._ict_register_reference.threat_categories import (
    THREAT_CATEGORY_CODES,
    WORKBOOK_THREAT_CATEGORY_TO_CODE,
    threat_category_code,
)

__all__ = [
    "CLOSED_LISTS",
    "CANONICAL_PROVIDER_IDENTIFIER_TYPES",
    "CLOUD_SERVICE_S_CODES",
    "COUNTRY_CATEGORIES",
    "DEPRECATED_PROVIDER_IDENTIFIER_TYPES",
    "ICT_APP_SCALE_RISK_BAND_DEFAULTS",
    "ICT_PARAMETER_CONFIG_CATEGORY",
    "ICT_SERVICE_TAXONOMY",
    "ICT_WORKBOOK_PARAMETERS",
    "ICT_WORKBOOK_PARAMETERS_BY_NAME",
    "ROI_CZ_EN_MAPS",
    "PROCESS_BCM_LINK_CODES",
    "PROCESS_CIF_OVERRIDE_CODES",
    "PROCESS_CONTROLLED_CODES_BY_FIELD",
    "PROCESS_DR_TEST_RESULT_CODES",
    "PROCESS_INTERRUPTION_IMPACT_CODES",
    "PROCESS_LICENSED_ACTIVITY_CODES",
    "PROCESS_PRELIMINARY_CRITICALITY_CODES",
    "PROCESS_REGULATORY_EN_VALUES_BY_FIELD",
    "THREAT_CATEGORY_CODES",
    "WORKBOOK_THREAT_CATEGORY_TO_CODE",
    "WORKBOOK_PROCESS_VALUE_TO_CODE_BY_FIELD",
    "ClosedListValue",
    "IctParameterValue",
    "IctWorkbookParameter",
    "IctWorkbookParameterSet",
    "closed_list_values",
    "is_closed_list_value",
    "is_provider_identifier_type_write_value",
    "load_ict_workbook_parameter_set",
    "process_controlled_value_code",
    "process_regulatory_value",
    "roi_en_value",
    "roi_map_entries",
    "threat_category_code",
]
