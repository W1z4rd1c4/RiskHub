"""Shared Risk Hub configuration workflow helpers."""

_EXPORTS = {
    "DepartmentDependencyCounts": (".departments", "DepartmentDependencyCounts"),
    "department_capabilities": (".departments", "department_capabilities"),
    "department_create_audit_plan": (".departments", "department_create_audit_plan"),
    "department_delete_audit_plan": (".departments", "department_delete_audit_plan"),
    "department_restore_audit_plan": (".departments", "department_restore_audit_plan"),
    "department_to_read": (".departments", "department_to_read"),
    "department_update_audit_plan": (".departments", "department_update_audit_plan"),
    "get_department_dependency_counts": (".departments", "get_department_dependency_counts"),
    "load_department_for_update": (".departments", "load_department_for_update"),
    "validate_department_manager": (".departments", "validate_department_manager"),
    "ConfigAuditPlan": (".lifecycle", "ConfigAuditPlan"),
    "ConfigEntityDefinition": (".lifecycle", "ConfigEntityDefinition"),
    "ConfigLifecycleOutcome": (".lifecycle", "ConfigLifecycleOutcome"),
    "build_config_audit_plan": (".lifecycle", "build_config_audit_plan"),
    "run_config_create": (".lifecycle", "run_config_create"),
    "run_config_delete": (".lifecycle", "run_config_delete"),
    "run_config_noop_update": (".lifecycle", "run_config_noop_update"),
    "run_config_restore": (".lifecycle", "run_config_restore"),
    "run_config_update": (".lifecycle", "run_config_update"),
    "load_role_for_update": (".roles", "load_role_for_update"),
    "role_capabilities": (".roles", "role_capabilities"),
    "role_to_read": (".roles", "role_to_read"),
    "validate_permission_ids": (".roles", "validate_permission_ids"),
}

__all__ = list(_EXPORTS)


def __getattr__(name: str):
    if name not in _EXPORTS:
        raise AttributeError(name)
    module_name, attribute_name = _EXPORTS[name]
    from importlib import import_module

    module = import_module(module_name, __name__)
    value = getattr(module, attribute_name)
    globals()[name] = value
    return value
