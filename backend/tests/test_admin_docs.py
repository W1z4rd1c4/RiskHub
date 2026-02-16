import shutil
from pathlib import Path

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_docs_endpoint_returns_admin_audience_only_for_platform_admin(
    client_platform_admin: AsyncClient,
):
    response = await client_platform_admin.get("/api/v1/admin/docs")
    assert response.status_code == 200

    documents = response.json()["documents"]
    assert documents
    assert documents[0]["id"] == "admin_getting-started"
    assert all(document["audience"] == "admin" for document in documents)
    assert all(document["id"].startswith("admin_") for document in documents)
    assert all(isinstance(document["tags"], list) and document["tags"] for document in documents)
    assert all(document.get("slug") for document in documents)
    assert all(document.get("summary") for document in documents)
    assert all(document.get("version") for document in documents)
    assert all(document.get("last_updated") for document in documents)
    assert all(document.get("source_of_truth") for document in documents)


@pytest.mark.asyncio
async def test_admin_docs_endpoint_returns_user_audience_only_for_cro(client_cro: AsyncClient):
    response = await client_cro.get("/api/v1/admin/docs")
    assert response.status_code == 200

    documents = response.json()["documents"]
    assert documents
    assert documents[0]["id"] == "user_getting-started"
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
    repo_root = Path(__file__).resolve().parents[2]
    docs_source = repo_root / "docs"
    docs_copy = tmp_path / "docs"
    shutil.copytree(docs_source, docs_copy)

    missing_cs_vendors_doc = docs_copy / "user-cs" / "vendors.md"
    assert missing_cs_vendors_doc.exists()
    missing_cs_vendors_doc.unlink()
    assert not missing_cs_vendors_doc.exists()

    monkeypatch.setenv("RISKHUB_DOCS_BASE_DIR", str(docs_copy))

    response = await client_employee.get("/api/v1/admin/docs", params={"locale": "cs"})
    assert response.status_code == 200
    documents = response.json()["documents"]

    vendors_doc = next((document for document in documents if document["id"] == "user_vendors"), None)
    assert vendors_doc is not None
    assert vendors_doc["audience"] == "user"
    assert vendors_doc["slug"] == "vendors"
    assert vendors_doc["version"] == "2.0"
    assert vendors_doc["source_of_truth"]
    assert "Managing Vendors" in vendors_doc["content"]
    assert "vendors" in vendors_doc["tags"] or "third-party" in vendors_doc["tags"]
