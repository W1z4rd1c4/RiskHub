# frontend/scripts/i18n

## Purpose

Folder for `frontend/scripts/i18n` implementation assets.

## Contents

- `allowlist.json`
- `inventory-ui-text.mjs`
- `plural-allowlist.json`
- `plural-baseline.json`
- `scan-hardcoded-ui.mjs`
- `validate-key-usage.mjs`
- `validate-parity.mjs`
- `validate-plurals.mjs`

## Notes

- `scan-hardcoded-ui.mjs` flags single-word JSX text; `allowlist.json` holds global `tokenPatterns`
  and file-local `scopedExceptions` (`path`, `text`, `reason`; stale entries fail).
- `validate-plurals.mjs` (`npm run i18n:validate:plurals`) requires `{{count}}` strings to be plural
  families (`cs` `_one/_few/_other`, `en` `_one/_other`); `plural-allowlist.json` exempts count-free
  forms and `plural-baseline.json` ratchets legacy violations down. See `docs/LOCALIZATION.md`.

Keep this README updated when responsibilities or structure in this folder change.
