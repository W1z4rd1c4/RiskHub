# Phase 100-03 High-Res Updates

## Cíl
Aktualizovat screenshoty v prezentaci na vysoké rozlišení (Retina/4K), protože současné (1024px) jsou pro tisk rozmazané.

## Postup
1.  **Vytvoření skriptu `capture_assets.js`**:
    *   Využití Playwright (již v projektu).
    *   Login jako System Admin (ID 1) přes demo login.
    *   Viewport 2560x1440 @ 2x scale (Retina).
    *   Automatický průchod všemi stránkami.
2.  **Spuštění capture**:
    *   Node script proti běžícímu localhost:5173.
    *   Uložení do `.planning/phases/100-marketing/`.
3.  **Re-build prezentace**:
    *   Spuštění `build_presentation.py` s novými obrázky.

## Screenshot Mapping

| Filename | Route | Action |
|----------|-------|--------|
| dashboard_operational_insight.png | `/` | Wait for cards |
| workflow_pending_queue.png | `/approvals` | - |
| risk_register.png | `/risks` | - |
| risk_assessment_details.png | `/risks` -> click first risk | Dynamic ID |
| control_definition.png | `/controls/new` | - |
| control_details_execution.png | `/controls` -> click first control | Dynamic ID |
| risk_appetite_kri.png | `/kris` -> click first KRI | Dynamic ID |
| risk_appetite_list.png | `/kris` | - |
| risk_appetite_details.png | `/kris` | (Maybe same as list or specific tab?) |
| governance_oversight.png | `/governance` | - |
| governance_uncategorised.png | `/governance` | (Maybe scroll down?) |
| audit_trail.png | `/audit-trail` | - |
| user_management.png | `/users` | - |
| departments_overview.png | `/departments` | - |
| hero_shield.png | N/A | Keep existing render |
| architecture_viz.png | N/A | Keep existing render |

## Verifikace
- [ ] Zkontrolovat rozlišení nových PNG (min 2560px šířka).
- [ ] Zkontrolovat ostrost v `presentation.html`.
