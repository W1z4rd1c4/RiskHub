"""
English language messages for API responses.
"""

MESSAGES = {
    # Error messages
    'errors': {
        'not_found': 'Not found',
        'access_denied': 'Access denied',
        'unauthorized': 'Unauthorized',
        'invalid_credentials': 'Invalid credentials',
        'session_expired': 'Session expired',
        'rate_limit_exceeded': 'Rate limit exceeded',
        'validation_failed': 'Validation failed',
        'internal_error': 'An internal error occurred',
        'bad_request': 'Bad request',
        'conflict': 'Resource conflict',
        'forbidden': 'Forbidden',
        'method_not_allowed': 'Method not allowed',
        'request_timeout': 'Request timeout',
        'service_unavailable': 'Service temporarily unavailable',
    },
    
    # Validation messages
    'validation': {
        'required': 'This field is required',
        'invalid_email': 'Must be a valid email address',
        'invalid_format': 'Invalid format',
        'value_range': 'Value must be between {min} and {max}',
        'min_value': 'Value must be at least {min}',
        'max_value': 'Value must be at most {max}',
        'min_length': 'Must be at least {min} characters',
        'max_length': 'Must be at most {max} characters',
        'invalid_choice': 'Invalid choice. Valid options: {choices}',
        'unique': 'This value already exists',
        'positive_number': 'Must be a positive number',
        'integer_required': 'Must be a whole number',
        'date_format': 'Invalid date format',
        'future_date': 'Date must be in the future',
        'past_date': 'Date must be in the past',
    },
    
    # Approval workflow messages
    'approvals': {
        'request_created': 'Approval request created',
        'request_approved': 'Request approved',
        'request_rejected': 'Request rejected',
        'request_cancelled': 'Request cancelled',
        'cannot_approve_own': 'Cannot approve your own request',
        'already_resolved': 'Request has already been resolved',
        'not_authorized_approver': 'You are not authorized to approve this request',
        'pending_approval': 'Changes pending approval',
        'privileged_required': 'Privileged approval required',
        'resolution_notes_required': 'Resolution notes are required',
    },
    
    # Notification messages
    'notifications': {
        'kri_value_due': 'KRI value submission due',
        'kri_overdue': 'KRI value is overdue',
        'approval_required': 'Approval required',
        'breach_detected': 'Limit breach detected',
        'control_execution_due': 'Control execution due',
        'control_overdue': 'Control execution is overdue',

        'questionnaire_sent_title': 'Questionnaire sent',
        'questionnaire_sent_message': "A risk assessment questionnaire for '{risk_name}' was sent to you. Due {due_date}.",
        'questionnaire_due_soon_title': 'Questionnaire due soon',
        'questionnaire_due_soon_message': "Your risk assessment questionnaire for '{risk_name}' is due on {due_date}.",
        'questionnaire_overdue_title': 'Questionnaire overdue',
        'questionnaire_overdue_message': "Your risk assessment questionnaire for '{risk_name}' was due on {due_date}.",
        'questionnaire_submitted_title': 'Questionnaire submitted',
        'questionnaire_submitted_message': "{actor_name} submitted the risk assessment questionnaire for '{risk_name}'.",
        'questionnaire_clarification_requested_title': 'Clarification requested',
        'questionnaire_clarification_requested_message': "A clarification was requested for your risk assessment questionnaire for '{risk_name}'.",
    },
    
    # Activity log action descriptions
    'activity': {
        # Risk actions
        'risk_created': 'Created risk',
        'risk_updated': 'Updated risk',
        'risk_archived': 'Archived risk',
        'risk_deleted': 'Deleted risk',
        'risk_restored': 'Restored risk',
        
        # Control actions
        'control_created': 'Created control',
        'control_updated': 'Updated control',
        'control_archived': 'Archived control',
        'control_deleted': 'Deleted control',
        'control_executed': 'Executed control',
        
        # KRI actions
        'kri_created': 'Created KRI',
        'kri_updated': 'Updated KRI',
        'kri_archived': 'Archived KRI',
        'kri_deleted': 'Deleted KRI',
        'kri_value_submitted': 'Submitted KRI value',
        'kri_value_corrected': 'Corrected KRI value',
        
        # Approval actions
        'approval_created': 'Created approval request',
        'approval_approved': 'Approved request',
        'approval_rejected': 'Rejected request',
        'approval_cancelled': 'Cancelled request',
        
        # Link actions
        'link_created': 'Created link between {source} and {target}',
        'link_removed': 'Removed link between {source} and {target}',
        
        # User actions
        'user_login': 'User logged in',
        'user_logout': 'User logged out',
        'user_created': 'Created user',
        'user_updated': 'Updated user',
        'user_deactivated': 'Deactivated user',
    },
    
    # Entity type names
    'entities': {
        'risk': 'Risk',
        'control': 'Control',
        'kri': 'Key Risk Indicator',
        'user': 'User',
        'department': 'Department',
        'approval': 'Approval Request',
    },
    
    # Status labels
    'status': {
        'active': 'Active',
        'inactive': 'Inactive',
        'pending': 'Pending',
        'approved': 'Approved',
        'rejected': 'Rejected',
        'cancelled': 'Cancelled',
        'archived': 'Archived',
        'monitoring': 'Monitoring',
        'closed': 'Closed',
    },
    
    # Success messages
    'success': {
        'created': '{entity} created successfully',
        'updated': '{entity} updated successfully',
        'deleted': '{entity} deleted successfully',
        'archived': '{entity} archived successfully',
        'restored': '{entity} restored successfully',
    },
}
