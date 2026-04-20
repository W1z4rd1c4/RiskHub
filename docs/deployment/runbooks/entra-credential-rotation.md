# Entra Credential Rotation

Use this runbook to rotate the Microsoft Entra confidential credential used for Graph access without relying on an undocumented reload path. This pass supports a rolling restart only.

## Scope

- Supported modes:
  - client secret via `ENTRA_CLIENT_SECRET_FILE`
  - certificate mode via `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT` and `ENTRA_CLIENT_CERTIFICATE_PRIVATE_KEY_FILE`
- This runbook does not add a hot-reload endpoint.
- `ENTRA_CREDENTIAL_FINGERPRINT` changes the Graph cache key, but old in-memory cache entries remain until workers restart.

## Preconditions

- Identify a known directory-linked user ID that can be checked after the rollout.
- Ensure the replacement secret or certificate is already added to the Entra app before changing RiskHub.
- Keep the old credential active until post-rotation verification succeeds.

## Procedure

1. Add the new credential to the Entra app registration while the old one remains valid.
2. Stage the new RiskHub credential material:
   - client-secret mode: update `/etc/riskhub/secrets/entra_client_secret`
   - certificate mode: update `/etc/riskhub/secrets/entra_client_certificate_private_key` and `ENTRA_CLIENT_CERTIFICATE_THUMBPRINT`
3. Bump `ENTRA_CREDENTIAL_FINGERPRINT` in `/etc/riskhub/riskhub.env`.
4. Perform a rolling restart of the RiskHub backend workers and scheduler so each process reloads settings and drops old in-memory Graph token cache entries.
5. Verify Graph auth with a platform-admin token against a known linked user:

```bash
curl -X POST \
  "$PUBLIC_URL/api/v1/admin/directory/check-user/<known_directory_linked_user_id>" \
  -H "Authorization: Bearer <platform-admin-access-token>"
```

Expected result: HTTP `200` with a normal directory status payload. Do not remove the old Entra credential until this check succeeds after the restart.

6. Remove the old Entra credential from the app registration only after verification passes.

## Notes

- Fingerprint bump without restart is not sufficient for this pass.
- If verification fails, restore the previous secret/key material, keep the old Entra credential active, and repeat the rolling restart.
