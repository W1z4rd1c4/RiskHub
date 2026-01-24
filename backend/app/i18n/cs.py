"""
Czech language messages for API responses.
"""

MESSAGES = {
    # Error messages
    'errors': {
        'not_found': 'Nenalezeno',
        'access_denied': 'Přístup odepřen',
        'unauthorized': 'Neautorizováno',
        'invalid_credentials': 'Neplatné přihlašovací údaje',
        'session_expired': 'Relace vypršela',
        'rate_limit_exceeded': 'Překročen limit požadavků',
        'validation_failed': 'Validace selhala',
        'internal_error': 'Došlo k interní chybě',
        'bad_request': 'Neplatný požadavek',
        'conflict': 'Konflikt zdrojů',
        'forbidden': 'Zakázáno',
        'method_not_allowed': 'Metoda není povolena',
        'request_timeout': 'Časový limit požadavku vypršel',
        'service_unavailable': 'Služba je dočasně nedostupná',
    },
    
    # Validation messages
    'validation': {
        'required': 'Toto pole je povinné',
        'invalid_email': 'Musí být platná e-mailová adresa',
        'invalid_format': 'Neplatný formát',
        'value_range': 'Hodnota musí být mezi {min} a {max}',
        'min_value': 'Hodnota musí být alespoň {min}',
        'max_value': 'Hodnota musí být nejvýše {max}',
        'min_length': 'Musí mít alespoň {min} znaků',
        'max_length': 'Musí mít nejvýše {max} znaků',
        'invalid_choice': 'Neplatná volba. Platné možnosti: {choices}',
        'unique': 'Tato hodnota již existuje',
        'positive_number': 'Musí být kladné číslo',
        'integer_required': 'Musí být celé číslo',
        'date_format': 'Neplatný formát data',
        'future_date': 'Datum musí být v budoucnosti',
        'past_date': 'Datum musí být v minulosti',
    },
    
    # Approval workflow messages
    'approvals': {
        'request_created': 'Žádost o schválení vytvořena',
        'request_approved': 'Žádost schválena',
        'request_rejected': 'Žádost zamítnuta',
        'request_cancelled': 'Žádost zrušena',
        'cannot_approve_own': 'Nelze schválit vlastní žádost',
        'already_resolved': 'Žádost již byla vyřešena',
        'not_authorized_approver': 'Nejste oprávněni schvalovat tuto žádost',
        'pending_approval': 'Změny čekají na schválení',
        'privileged_required': 'Vyžadováno privilegované schválení',
        'resolution_notes_required': 'Poznámky k rozhodnutí jsou povinné',
    },
    
    # Notification messages
    'notifications': {
        'kri_value_due': 'KRI hodnota k odeslání',
        'kri_overdue': 'KRI hodnota je opožděna',
        'approval_required': 'Vyžadováno schválení',
        'breach_detected': 'Zjištěno překročení limitu',
        'control_execution_due': 'Kontrola k provedení',
        'control_overdue': 'Provedení kontroly je opožděno',

        'questionnaire_sent_title': 'Dotazník odeslán',
        'questionnaire_sent_message': "Byl vám odeslán dotazník k hodnocení rizika '{risk_name}'. Termín {due_date}.",
        'questionnaire_due_soon_title': 'Blížící se termín dotazníku',
        'questionnaire_due_soon_message': "Dotazník k hodnocení rizika '{risk_name}' má termín {due_date}.",
        'questionnaire_overdue_title': 'Dotazník po termínu',
        'questionnaire_overdue_message': "Dotazník k hodnocení rizika '{risk_name}' měl termín {due_date}.",
        'questionnaire_submitted_title': 'Dotazník odeslán',
        'questionnaire_submitted_message': "{actor_name} odeslal(a) dotazník k hodnocení rizika '{risk_name}'.",
    },
    
    # Activity log action descriptions
    'activity': {
        # Risk actions
        'risk_created': 'Vytvořeno riziko',
        'risk_updated': 'Aktualizováno riziko',
        'risk_archived': 'Archivováno riziko',
        'risk_deleted': 'Smazáno riziko',
        'risk_restored': 'Obnoveno riziko',
        
        # Control actions
        'control_created': 'Vytvořena kontrola',
        'control_updated': 'Aktualizována kontrola',
        'control_archived': 'Archivována kontrola',
        'control_deleted': 'Smazána kontrola',
        'control_executed': 'Provedena kontrola',
        
        # KRI actions
        'kri_created': 'Vytvořen KRI',
        'kri_updated': 'Aktualizován KRI',
        'kri_archived': 'Archivován KRI',
        'kri_deleted': 'Smazán KRI',
        'kri_value_submitted': 'Odeslána hodnota KRI',
        'kri_value_corrected': 'Opravena hodnota KRI',
        
        # Approval actions
        'approval_created': 'Vytvořena žádost o schválení',
        'approval_approved': 'Schválena žádost',
        'approval_rejected': 'Zamítnuta žádost',
        'approval_cancelled': 'Zrušena žádost',
        
        # Link actions
        'link_created': 'Vytvořeno propojení mezi {source} a {target}',
        'link_removed': 'Odstraněno propojení mezi {source} a {target}',
        
        # User actions
        'user_login': 'Uživatel přihlášen',
        'user_logout': 'Uživatel odhlášen',
        'user_created': 'Vytvořen uživatel',
        'user_updated': 'Aktualizován uživatel',
        'user_deactivated': 'Deaktivován uživatel',
    },
    
    # Entity type names
    'entities': {
        'risk': 'Riziko',
        'control': 'Kontrola',
        'kri': 'Klíčový indikátor rizika',
        'user': 'Uživatel',
        'department': 'Oddělení',
        'approval': 'Žádost o schválení',
    },
    
    # Status labels
    'status': {
        'active': 'Aktivní',
        'inactive': 'Neaktivní',
        'pending': 'Čekající',
        'approved': 'Schváleno',
        'rejected': 'Zamítnuto',
        'cancelled': 'Zrušeno',
        'archived': 'Archivováno',
        'monitoring': 'Monitorováno',
        'closed': 'Uzavřeno',
    },
    
    # Success messages
    'success': {
        'created': '{entity} úspěšně vytvořen/a',
        'updated': '{entity} úspěšně aktualizován/a',
        'deleted': '{entity} úspěšně smazán/a',
        'archived': '{entity} úspěšně archivován/a',
        'restored': '{entity} úspěšně obnoven/a',
    },
}
