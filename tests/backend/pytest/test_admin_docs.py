import shutil
from pathlib import Path

import pytest
from httpx import AsyncClient


def _read_frontmatter(path: Path) -> dict[str, str | list[str]]:
    content = path.read_text(encoding="utf-8")
    if not content.startswith("---\n"):
        return {}

    lines = content.splitlines()
    metadata: dict[str, str | list[str]] = {}
    index = 1
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if stripped == "---":
            break
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            index += 1
            continue
        key, raw_value = stripped.split(":", 1)
        key = key.strip()
        value = raw_value.strip().strip('"').strip("'")
        if value:
            metadata[key] = value
            index += 1
            continue

        items: list[str] = []
        index += 1
        while index < len(lines):
            item_line = lines[index].strip()
            if item_line == "---":
                break
            if not item_line.startswith("- "):
                break
            items.append(item_line[2:].strip().strip('"').strip("'"))
            index += 1
        metadata[key] = items
        continue

    return metadata


@pytest.mark.asyncio
async def test_admin_docs_endpoint_returns_admin_audience_only_for_platform_admin(
    client_platform_admin: AsyncClient,
):
    response = await client_platform_admin.get("/api/v1/admin/docs")
    assert response.status_code == 200

    documents = response.json()["documents"]
    assert documents
    assert documents[0]["id"] == "admin_incident-quick-reference"
    assert documents[1]["id"] == "admin_getting-started"
    assert any(document["id"] == "admin_incident-quick-reference" for document in documents)
    assert any(document["id"] == "admin_getting-started" for document in documents)
    assert all(document["audience"] == "admin" for document in documents)
    assert all(document["id"].startswith("admin_") for document in documents)
    assert all(isinstance(document["tags"], list) and document["tags"] for document in documents)
    assert all(document.get("slug") for document in documents)
    assert all(document.get("summary") for document in documents)
    assert all(document.get("version") for document in documents)
    assert all(document.get("last_updated") for document in documents)
    assert all(document.get("source_of_truth") for document in documents)
    incident_doc = next(document for document in documents if document["id"] == "admin_incident-quick-reference")
    expected_tags = _read_frontmatter(
        Path(__file__).resolve().parents[3] / "docs" / "admin" / "incident-quick-reference.md"
    )["tags"]
    assert incident_doc["tags"] == expected_tags


@pytest.mark.asyncio
async def test_admin_docs_endpoint_returns_localized_incident_quick_reference_for_platform_admin(
    client_platform_admin: AsyncClient,
):
    response = await client_platform_admin.get("/api/v1/admin/docs", params={"locale": "cs"})
    assert response.status_code == 200

    documents = response.json()["documents"]
    incident_doc = next((document for document in documents if document["id"] == "admin_incident-quick-reference"), None)
    assert incident_doc is not None
    assert incident_doc["audience"] == "admin"
    assert incident_doc["title"] == "Rychlá reference admin incidentů"
    assert "Když se něco rozbije" in incident_doc["content"]


@pytest.mark.asyncio
async def test_admin_docs_endpoint_returns_user_audience_only_for_cro(client_cro: AsyncClient):
    response = await client_cro.get("/api/v1/admin/docs")
    assert response.status_code == 200

    documents = response.json()["documents"]
    assert documents
    assert any(document["id"] == "user_getting-started" for document in documents)
    assert all(document["audience"] == "user" for document in documents)
    assert all(document["id"].startswith("user_") for document in documents)
    assert all(isinstance(document["tags"], list) and document["tags"] for document in documents)
    assert all(document.get("slug") for document in documents)
    assert all(document.get("summary") for document in documents)
    assert all(document.get("version") for document in documents)


@pytest.mark.asyncio
async def test_admin_docs_endpoint_returns_user_audience_only_for_employee(client_employee: AsyncClient):
    response = await client_employee.get("/api/v1/admin/docs")
    assert response.status_code == 200

    documents = response.json()["documents"]
    assert documents
    assert all(document["audience"] == "user" for document in documents)
    assert all(document["id"].startswith("user_") for document in documents)


@pytest.mark.asyncio
async def test_admin_docs_locale_file_level_fallback_for_missing_user_cs_vendors(
    client_employee: AsyncClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    repo_root = Path(__file__).resolve().parents[3]
    docs_source = repo_root / "docs"
    docs_copy = tmp_path / "docs"
    shutil.copytree(docs_source, docs_copy)

    missing_cs_vendors_doc = docs_copy / "user-cs" / "vendors.md"
    assert missing_cs_vendors_doc.exists()
    missing_cs_vendors_doc.unlink()
    assert not missing_cs_vendors_doc.exists()

    english_vendors_doc = docs_copy / "user" / "vendors.md"
    expected_metadata = _read_frontmatter(english_vendors_doc)

    monkeypatch.setenv("RISKHUB_DOCS_BASE_DIR", str(docs_copy))

    response = await client_employee.get("/api/v1/admin/docs", params={"locale": "cs"})
    assert response.status_code == 200
    documents = response.json()["documents"]

    vendors_doc = next((document for document in documents if document["id"] == "user_vendors"), None)
    assert vendors_doc is not None
    assert vendors_doc["audience"] == "user"
    assert vendors_doc["slug"] == "vendors"
    assert vendors_doc["version"] == expected_metadata["version"]
    assert vendors_doc["last_updated"] == expected_metadata["last_updated"]
    assert vendors_doc["source_of_truth"] == expected_metadata["source_of_truth"]
    assert "Managing Vendors" in vendors_doc["content"]
    assert vendors_doc["tags"] == expected_metadata["tags"]
