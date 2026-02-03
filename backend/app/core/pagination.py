"""Shared pagination constants for the API."""

# Default page size for list endpoints
DEFAULT_PAGE_SIZE = 50

# Maximum page size for paginated list endpoints
MAX_PAGE_SIZE = 100

# Maximum size for lookup endpoints (pickers, dropdowns)
MAX_LOOKUP_SIZE = 200

# Non-paginated endpoint caps (safety limits)
MAX_VENDOR_SIGNALS = 200

# KRIs list endpoint page size cap (see /api/v1/kris)
MAX_KRI_PAGE_SIZE = 1000

# Department detail endpoint: recent executions list
DEPARTMENT_RECENT_EXECUTIONS_LIMIT = 10
