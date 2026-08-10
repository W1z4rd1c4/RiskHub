from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def _manual(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_department_user_manuals_describe_the_exact_health_drilldown_contract():
    english = _manual("docs/user/departments.md")
    czech = _manual("docs/user-cs/departments.md")

    for manual in (english, czech):
        assert "Risks" in manual or "Rizika" in manual
        assert "Controls" in manual or "Kontroly" in manual
        assert "KRIs" in manual or "KRI" in manual
        assert "Issues" in manual or "Nálezy" in manual
        assert "Processes" in manual or "Procesy" in manual
        assert "Assets" in manual or "Aktiva" in manual
        assert "Vendors" in manual or "Dodavatelé" in manual
        assert "Users" in manual or "Uživatelé" in manual
        assert "CIF" in manual
        assert "DORA" in manual
        assert "N/A" in manual
        assert "four-column by two-row" in manual or "čtyři krát dva" in manual
        assert "two columns" in manual or "dva" in manual
        assert "one column" in manual or "jeden" in manual
        assert "full-width" in manual or "celou šířku" in manual
        assert "pending approval" in manual or "čekají na schválení" in manual
        assert "Department filter remains locked" in manual or "filtr Oddělení uzamčený" in manual
