from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_process_asset_and_threat_admin_runbooks_exist_in_english_and_czech() -> None:
    expected_terms = {
        "processes.md": (
            ("Process Owner", "Owning Department", "pending change"),
            ("Vlastník procesu", "Vlastnické oddělení", "čekající změna"),
        ),
        "assets.md": (
            ("Business Owner", "ICT Owner", "Composite"),
            ("Business vlastník", "ICT vlastník", "Composite"),
        ),
        "threats.md": (
            ("Threat Steward", "CISO", "orphan"),
            ("Správce hrozby", "CISO", "osiřel"),
        ),
    }

    for filename, (english_terms, czech_terms) in expected_terms.items():
        english = _read(f"docs/admin/{filename}")
        czech = _read(f"docs/admin-cs/{filename}")

        for term in english_terms:
            assert term in english
        for term in czech_terms:
            assert term in czech


def test_related_bilingual_manuals_route_users_to_complete_governance_support() -> None:
    fixed_scenarios = (
        "protected_process_edit",
        "protected_asset_edit",
        "protected_vendor_edit",
        "accountability_reassignment",
    )

    for relative_path in (
        "docs/user/risk-hub.md",
        "docs/user-cs/risk-hub.md",
        "docs/admin/riskhub-config.md",
        "docs/admin-cs/riskhub-config.md",
        "docs/admin/approvals.md",
        "docs/admin-cs/approvals.md",
    ):
        manual = _read(relative_path)
        for scenario in fixed_scenarios:
            assert scenario in manual, f"{relative_path} must name {scenario}"

    english_admin_index = _read("docs/admin/README.md")
    czech_admin_index = _read("docs/admin-cs/README.md")
    for link in ("./processes.md", "./assets.md", "./threats.md"):
        assert link in english_admin_index
        assert link in czech_admin_index

    english_getting_started = _read("docs/user/getting-started.md")
    czech_getting_started = _read("docs/user-cs/getting-started.md")
    assert "ten demo personas" in english_getting_started
    assert "five-column by two-row" in english_getting_started
    assert "deset demo person" in czech_getting_started
    assert "pěti sloupcích a dvou řádcích" in czech_getting_started


def test_related_vendor_department_and_notification_manuals_pin_runtime_behavior() -> None:
    expected_terms = {
        "docs/user/vendors.md": (
            "Outsourcing Owner",
            "Critical or Significant Vendor",
            "approved Vendor remains",
        ),
        "docs/user-cs/vendors.md": (
            "vlastníka outsourcingu",
            "kritického nebo významného dodavatele",
            "schválený dodavatel",
        ),
        "docs/admin/approvals.md": (
            "Protected Vendor request remains pending",
            "Composite requests",
            "approved Vendor",
        ),
        "docs/admin-cs/approvals.md": (
            "Chráněná žádost dodavatele zůstává čekající",
            "složené návrhy",
            "Schválený dodavatel",
        ),
        "docs/user/notifications.md": (
            "Approval requests requiring my action",
            "Updates to my approval requests",
            "affects notifications only",
        ),
        "docs/user-cs/notifications.md": (
            "Žádosti o schválení vyžadující mou akci",
            "Aktualizace mých žádostí o schválení",
            "ovlivní pouze notifikace",
        ),
        "docs/admin/departments.md": (
            "exactly ten tabs",
            "locked Department constraint",
            "There is no Threat tab",
        ),
        "docs/admin-cs/departments.md": (
            "přesně deseti záložkami",
            "uzamčeným omezením Oddělení",
            "Záložka Hrozby neexistuje",
        ),
    }

    for relative_path, terms in expected_terms.items():
        manual = _read(relative_path)
        for term in terms:
            assert term in manual, f"{relative_path} must retain {term}"


def test_canonical_navigation_and_release_guidance_expose_issue_91_contract() -> None:
    glossary = _read("docs/GLOSSARY.md")
    for term in (
        "Process Owner",
        "Asset Business Owner",
        "Asset ICT Owner",
        "Threat Steward",
        "Composite approval",
        "Accountability reassignment",
    ):
        assert term in glossary

    e2e = _read("docs/E2E_TESTING.md")
    for term in (
        "CISO stewardship",
        "Composite cascade",
        "ten-persona",
        "language-pure",
    ):
        assert term in e2e

    development = _read("docs/development/README.md")
    assert "ten demo personas" in development
    assert "five-column by two-row" in development

    navigation = "\n".join(
        (
            _read("docs/README.md"),
            _read("docs/DOCUMENTATION_TREE.md"),
            _read("docs/dora-ict-register/README.md"),
        )
    )
    for relative_path in (
        "docs/user/processes.md",
        "docs/user/assets.md",
        "docs/user/threats.md",
        "docs/user-cs/processes.md",
        "docs/user-cs/assets.md",
        "docs/user-cs/threats.md",
        "docs/admin/processes.md",
        "docs/admin/assets.md",
        "docs/admin/threats.md",
        "docs/admin-cs/processes.md",
        "docs/admin-cs/assets.md",
        "docs/admin-cs/threats.md",
    ):
        assert relative_path in navigation
