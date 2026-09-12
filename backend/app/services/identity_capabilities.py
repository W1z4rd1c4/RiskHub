"""Identity capability projections reuse enforcement eligibility, independently of business access."""

from app.core.config import Settings
from app.core.exceptions import AuthenticationError
from app.core.external_identity_policy import external_directory_enabled
from app.core.local_session import native_identity_selected
from app.core.permissions import is_platform_admin
from app.models import User
from app.schemas.identity import CurrentIdentityCapabilities, IdentityConfig
from app.services._local_auth.common import local_user_ready
from app.services._local_auth.recovery_policy import privileged_recovery_target, require_recoverable


def identity_config(settings: Settings) -> IdentityConfig:
    native = native_identity_selected(settings)
    return IdentityConfig(
        mode="native" if native else "entra" if settings.auth_mode == "microsoft_sso" else "development",
        external_directory="enabled" if external_directory_enabled(settings) else "disabled",
        local_enrollment_enabled=native,
        password_reset_enabled=native,
        factor_management_enabled=native,
        recovery_method="governed_local"
        if native
        else "identity_provider"
        if settings.auth_mode == "microsoft_sso"
        else "unsupported",
    )


def current_identity_capabilities(user: User, settings: Settings) -> CurrentIdentityCapabilities:
    active = bool(
        user.is_active
        and not user.local_suspended
        and not user.local_recovery_pending
        and user.role
        and user.role.is_active
    )
    admin = active and is_platform_admin(user)
    native = native_identity_selected(settings)
    return CurrentIdentityCapabilities(
        can_invite_users=bool(native and admin and local_user_ready(user)),
        can_manage_own_credentials=bool(native and active and local_user_ready(user)),
        can_import_directory_users=bool(admin and external_directory_enabled(settings)),
        can_check_directory_users=bool(admin and external_directory_enabled(settings)),
    )


def target_identity_capabilities(actor: User, target: User, settings: Settings) -> dict[str, bool]:
    current = current_identity_capabilities(actor, settings)
    native_target = native_identity_selected(settings) and target.external_id is None
    pending = native_target and target.local_enrollment_state == "invited" and not target.local_suspended
    recoverable = False
    if native_target and target.role is not None:
        try:
            require_recoverable(target, version=target.token_version)
        except AuthenticationError:
            pass
        else:
            recoverable = True
    offline = bool(recoverable and privileged_recovery_target(target))
    return {
        "can_reissue_invitation": bool(current.can_invite_users and pending),
        "can_cancel_invitation": bool(current.can_invite_users and pending),
        "can_request_password_reset": bool(current.can_invite_users and native_target and local_user_ready(target)),
        "can_initiate_recovery": bool(current.can_invite_users and recoverable and not offline),
        "recovery_offline_required": bool(current.can_invite_users and offline),
        "can_check_directory": bool(current.can_check_directory_users and target.external_id),
    }
