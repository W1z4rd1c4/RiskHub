"""
Report generation translations module.

Provides localized strings for PDF and Excel report generation.
"""

from typing import Any, Dict

from app.i18n import DEFAULT_LOCALE

# English report translations
REPORT_STRINGS_EN: Dict[str, Any] = {
    # Common
    'generated_on': 'Generated on',
    'page_x_of_y': 'Page {page} of {total}',
    'report': 'Report',
    'summary': 'Summary',
    'total': 'Total',
    'department': 'Department',
    'owner': 'Owner',
    'status': 'Status',
    'description': 'Description',
    'name': 'Name',
    'active': 'Active',
    'archived': 'Archived',
    'inactive': 'Inactive',
    'created_at': 'Created',
    'updated_at': 'Last Updated',

    # Risk Report
    'risk_register': 'Risk Register',
    'risk_register_subtitle': 'Comprehensive view of organizational risks',
    'risks': 'Risks',
    'risk': 'Risk',
    'gross_score': 'Gross Score',
    'net_score': 'Net Score',
    'probability': 'Probability',
    'impact': 'Impact',
    'priority': 'Priority',
    'high_priority': 'High Priority',
    'category': 'Category',
    'process': 'Process',
    'risk_type': 'Risk Type',
    'inherent': 'Inherent',
    'residual': 'Residual',
    'mitigation': 'Mitigation Strategy',
    'linked_controls': 'Linked Controls',

    # Control Report
    'control_inventory': 'Control Inventory',
    'control_inventory_subtitle': 'Control catalog with execution status',
    'controls': 'Controls',
    'control': 'Control',
    'control_type': 'Type',
    'frequency': 'Frequency',
    'last_execution': 'Last Execution',
    'next_due': 'Next Due',
    'executions': 'Executions',
    'linked_risks': 'Linked Risks',
    'effectiveness': 'Effectiveness',
    'risk_level': 'Risk Level',

    # Control types
    'preventive': 'Preventive',
    'detective': 'Detective',
    'corrective': 'Corrective',

    # Control forms
    'automatic': 'Automatic',
    'manual': 'Manual',

    # Frequencies
    'daily': 'Daily',
    'weekly': 'Weekly',
    'monthly': 'Monthly',
    'quarterly': 'Quarterly',
    'annually': 'Annually',

    # KRI Report
    'kri_report': 'Key Risk Indicators Report',
    'kri_report_subtitle': 'Monitoring risk appetite and thresholds',
    'kris': 'Key Risk Indicators',
    'kri': 'KRI',
    'metric_name': 'Metric',
    'current_value': 'Current Value',
    'upper_limit': 'Upper Limit',
    'lower_limit': 'Lower Limit',
    'breach_status': 'Status',
    'within_limits': 'Within Limits',
    'breached': 'Breached',
    'threshold': 'Threshold',

    # Audit Trail
    'audit_trail': 'Audit Trail',
    'audit_trail_subtitle': 'Control execution history',
    'action': 'Action',
    'timestamp': 'Timestamp',
    'user': 'User',
    'entity': 'Entity',
    'changes': 'Changes',
    'executed_by': 'Executed By',
    'execution_date': 'Execution Date',
    'result': 'Result',
    'notes': 'Notes',

    # Dashboard Summary
    'dashboard_summary': 'Executive Dashboard Summary',
    'total_risks': 'Total Risks',
    'critical_risks': 'Critical Risks',
    'total_controls': 'Total Controls',
    'avg_net_score': 'Average Net Score',

    # Sheet names (Excel)
    'sheet_risks': 'Risks',
    'sheet_controls': 'Controls',
    'sheet_summary': 'Summary',
    'sheet_executions': 'Executions',
    'sheet_audit': 'Audit Trail',
}


# Czech report translations
REPORT_STRINGS_CS: Dict[str, Any] = {
    # Common
    'generated_on': 'Vygenerováno',
    'page_x_of_y': 'Strana {page} z {total}',
    'report': 'Zpráva',
    'summary': 'Souhrn',
    'total': 'Celkem',
    'department': 'Oddělení',
    'owner': 'Vlastník',
    'status': 'Stav',
    'description': 'Popis',
    'name': 'Název',
    'active': 'Aktivní',
    'archived': 'Archivováno',
    'inactive': 'Neaktivní',
    'created_at': 'Vytvořeno',
    'updated_at': 'Poslední aktualizace',

    # Risk Report
    'risk_register': 'Registr rizik',
    'risk_register_subtitle': 'Komplexní přehled organizačních rizik',
    'risks': 'Rizika',
    'risk': 'Riziko',
    'gross_score': 'Hrubé skóre',
    'net_score': 'Čisté skóre',
    'probability': 'Pravděpodobnost',
    'impact': 'Dopad',
    'priority': 'Priorita',
    'high_priority': 'Vysoká priorita',
    'category': 'Kategorie',
    'process': 'Proces',
    'risk_type': 'Typ rizika',
    'inherent': 'Inherentní',
    'residual': 'Reziduální',
    'mitigation': 'Strategie zmírnění',
    'linked_controls': 'Propojené kontroly',

    # Control Report
    'control_inventory': 'Katalog kontrol',
    'control_inventory_subtitle': 'Katalog kontrol se stavem provedení',
    'controls': 'Kontroly',
    'control': 'Kontrola',
    'control_type': 'Typ',
    'frequency': 'Frekvence',
    'last_execution': 'Poslední provedení',
    'next_due': 'Další termín',
    'executions': 'Provedení',
    'linked_risks': 'Propojená rizika',
    'effectiveness': 'Efektivita',
    'risk_level': 'Úroveň rizika',

    # Control types
    'preventive': 'Preventivní',
    'detective': 'Detektivní',
    'corrective': 'Korektivní',

    # Control forms
    'automatic': 'Automatická',
    'manual': 'Manuální',

    # Frequencies
    'daily': 'Denně',
    'weekly': 'Týdně',
    'monthly': 'Měsíčně',
    'quarterly': 'Čtvrtletně',
    'annually': 'Ročně',

    # KRI Report
    'kri_report': 'Zpráva o klíčových indikátorech rizik',
    'kri_report_subtitle': 'Sledování rizikového apetitu a prahových hodnot',
    'kris': 'Klíčové indikátory rizik',
    'kri': 'KRI',
    'metric_name': 'Metrika',
    'current_value': 'Aktuální hodnota',
    'upper_limit': 'Horní limit',
    'lower_limit': 'Dolní limit',
    'breach_status': 'Stav',
    'within_limits': 'V limitech',
    'breached': 'Překročeno',
    'threshold': 'Prahová hodnota',

    # Audit Trail
    'audit_trail': 'Auditní stopa',
    'audit_trail_subtitle': 'Historie provádění kontrol',
    'action': 'Akce',
    'timestamp': 'Časová značka',
    'user': 'Uživatel',
    'entity': 'Entita',
    'changes': 'Změny',
    'executed_by': 'Provedl',
    'execution_date': 'Datum provedení',
    'result': 'Výsledek',
    'notes': 'Poznámky',

    # Dashboard Summary
    'dashboard_summary': 'Manažerský přehled',
    'total_risks': 'Celkem rizik',
    'critical_risks': 'Kritická rizika',
    'total_controls': 'Celkem kontrol',
    'avg_net_score': 'Průměrné čisté skóre',

    # Sheet names (Excel)
    'sheet_risks': 'Rizika',
    'sheet_controls': 'Kontroly',
    'sheet_summary': 'Souhrn',
    'sheet_executions': 'Provedení',
    'sheet_audit': 'Auditní stopa',
}


# Translation registry
_REPORT_TRANSLATIONS = {
    'en': REPORT_STRINGS_EN,
    'cs': REPORT_STRINGS_CS,
}


def get_report_string(key: str, locale: str = DEFAULT_LOCALE, **kwargs) -> str:
    """
    Get a translated report string.

    Args:
        key: Translation key
        locale: Language code ('en', 'cs')
        **kwargs: Values for string interpolation

    Returns:
        Translated string
    """
    strings = _REPORT_TRANSLATIONS.get(locale, REPORT_STRINGS_EN)
    text = strings.get(key, REPORT_STRINGS_EN.get(key, key))

    if kwargs:
        try:
            text = text.format(**kwargs)
        except KeyError:
            pass

    return text


def get_report_translator(locale: str = DEFAULT_LOCALE):
    """
    Get a translator function for report strings.

    Args:
        locale: Language code

    Returns:
        Function that translates keys to strings
    """
    def translate(key: str, **kwargs) -> str:
        return get_report_string(key, locale, **kwargs)

    return translate
