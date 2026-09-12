# Native identity: external directory isolation

`AUTH_MODE=password` with `DIRECTORY_PROVIDER=none` disables external identity work.
It preserves RiskHub's local user directory, account assignments, access management,
ordinary scheduled jobs and transactional outbox. This backend delivery does not open
native production admission; #208 owns the final release matrix and admission change.

## Runtime contract

`app/core/external_identity_policy.py` owns external directory and SSO admission.
A disabled external directory raises `AuthorizationError` with `DIRECTORY_DISABLED`
before provider construction or mutation. The domain HTTP adapter exposes this as
403 with `detail.code`. SSO start/exchange retain the existing `SSO_DISABLED` response;
direct verifier admission uses `AUTH_METHOD_DISABLED`. Authorization runs before
administrative route work; these outcomes do not expose target account existence.

Graph and emulator clients are not empty-success substitutes for `none`. Their direct
constructors reject it, including Graph's token and transport components. Existing
Entra provider outage, authorization error, confirmed-missing and directory-disabled
account results retain their established behavior. An outage never enables password
fallback or converts an uncertain directory result into account deletion.

## Call-site inventory and disposition

| Surface | Source | Native disposition |
| --- | --- | --- |
| Application composition and startup | `backend/app/main.py` | No Graph/JWKS client construction; shared database/Redis/scheduler startup remains. Production guard and installation validation remain unchanged. |
| Provider facade, Graph, emulator | `backend/app/services/directory_provider_service.py`, `_graph_directory/{service,auth,transport}.py` | Reject before provider/network construction. Legacy debug `auto` remains a distinct development configuration. |
| SSO challenges, exchange, verifier cache | `backend/app/services/_auth_session/sso_challenges.py`, `sso_token_service.py` | Reject before challenge effects or cached verifier lookup. No local fallback for Entra failure. |
| Directory search/get/import HTTP | `backend/app/api/v1/endpoints/directory.py` | Admin gate, then disabled-feature rejection before provider construction. |
| Direct import service | `backend/app/services/_identity_access_lifecycle/directory_import.py` | Reject before reads, profile updates, role changes or commit. |
| Check-one, check-all, deprovision | `backend/app/services/ad_deprovision_service.py` | Public/direct checks reject before work; no successful empty scan. |
| Directory break-glass | `backend/app/api/v1/endpoints/admin/directory_sync.py` | Reject before acquiring lifecycle locks or changing eligibility. This Entra operation is not native recovery. |
| Scheduled and manual directory/JWKS jobs | `backend/app/core/scheduler_jobs.py` | Do not register either job; manual wrappers reject before a tracked run. KRI, questionnaire, issue, orphan and outbox jobs remain registered. |
| Trusted Entra bootstrap | `backend/scripts/bootstrap_sso_user.py` | Reject `none` even when an operator supplies an external ID, before database changes. Native bootstrap belongs to #203. |
| Installation initialization/adoption | `backend/app/services/identity_installation.py` | Validated immutable profile/binding; only explicit Entra adoption constructs a directory provider. |
| Public health/readiness | `backend/app/api/v1/endpoints/health.py` | `external_directory=not_applicable`; no identity binding or directory network probe. |
| Admin telemetry | `backend/app/services/_admin_telemetry/lifecycle.py` | `not_applicable` plus persisted binding for authorized admins; no directory network probe. |
| Installer status/doctor/repair/preflight | `scripts/install_lib/{status,doctor,lifecycle}.py`, `scripts/prod/{status,preflight,bootstrap_db}.sh`, deployment renderer | Existing managed production surfaces remain Entra-only until #204/#208; they cannot install a native profile through this delivery. Shared runtime diagnostic responses expose the new state. #204 owns profile-aware rendering, bootstrap selection and operator diagnostics. |
| Local directory and business pickers | `/users/directory`, `/users/lookup`, `/access/users`, department/manager/owner projections | Continue using local persisted Users and existing permission/scope filters, independent of external-directory admission. |

## Public configuration and capabilities

`/auth/config.identity` describes `native`, `entra` or `development`, whether the
external directory is enabled, implemented local enrollment/password-reset/factor
management availability, and the recovery method. Native configuration returns no
Microsoft tenant, client, authority or phantom SSO configuration error. It exposes
no security keys, SMTP secrets, account lookup result or mutable provider switch.

`/auth/me` and `/auth/me/capabilities` include an `identity` object:

- `can_invite_users`: completed active native platform admin only.
- `can_manage_own_credentials`: completed eligible native account.
- `can_import_directory_users`, `can_check_directory_users`: active platform admin
  with external directory enabled.

Access rows add `can_reissue_invitation`, `can_cancel_invitation`,
`can_request_password_reset`, `can_initiate_recovery`, `recovery_offline_required`
and `can_check_directory`. Pending invitations can be managed only while unsuspended;
password reset requires an eligible enrolled account. Ordinary assisted recovery
reuses the recovery service eligibility rules. Privileged recovery is explanatory
`offline_required`, never an executable web override. Recovery-pending accounts
cannot be resumed through ordinary lifecycle controls.

Native `verified_identity_fields=["email"]` directs email changes through verified credential workflows. Entra-linked directory-owned identity fields are not locally editable.

Existing `can_edit_business_access`, role policy, identity field ownership,
last-admin protection, suspension and session-revocation rules remain authoritative.
CRO business access does not grant credential administration. The existing
`AdminConsoleCapabilities.can_run_directory_check_all` is false in native mode.
Clients must treat absent identity capabilities as denied during version overlap;
protected mutations always revalidate in the backend.

## Diagnostics and verification

`external_directory=unchecked` in an external profile means the health request did
not contact the provider. It is not a claim that Graph is healthy. Per-account
reconciliation retains its detailed unavailable/unauthorized/missing outcomes.
Only `/admin/health` returns the persisted installation ID, mode, tenant and contract
version; public health returns no binding or user details.

Run `test_identity_directory_isolation.py` with provider/directory/deprovision,
SSO, scheduler, health, access and authorization tests. The new suite records the
initial six failed constructor/scheduler assertions, then checks wrong-profile
HTTP/direct calls, zero external HTTP attempts, retained local directory access,
operator-only diagnostics and literal actor/target capability expectations. Final
non-debug Docker/Linux installation and real-tenant evidence remains #208.
