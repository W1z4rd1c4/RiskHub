/**
 * ICT Register API helpers for E2E tests (Processes, Assets, links).
 *
 * Deterministic-state helpers mirror helpers/api-auth.ts: look up seeded
 * fixtures by their stable natural keys, force archive state, and reset link
 * baselines so UI link-management tests always start from a known state.
 * All calls run as the risk manager demo user (processes:* / assets:*).
 */

import { getApiBaseUrl, getDemoToken } from './api-auth';

const RISK_MANAGER = { email: 'risk.manager@riskhub.local', fallbackUserIds: [3] };

export interface ProcessLookup {
    id: number;
    f_code: string;
    l1_process: string;
    is_archived?: boolean;
}

export interface AssetLookup {
    id: number;
    name: string;
    is_archived?: boolean;
}

export interface ProcessAssetLinkLookup {
    id: number;
    process_id: number;
    asset_id: number;
    is_primary: boolean;
}

export interface AssetAssetLinkLookup {
    id: number;
    dependent_asset_id: number;
    supporting_asset_id: number;
}

async function riskManagerHeaders(): Promise<Record<string, string>> {
    const token = await getDemoToken(RISK_MANAGER);
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

export async function getProcessByL1(l1Process: string): Promise<ProcessLookup | null> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const params = new URLSearchParams({ search: l1Process, include_archived: 'true', limit: '100' });
    const response = await fetch(`${apiBase}/api/v1/processes?${params.toString()}`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to load processes for '${l1Process}': ${response.status}`);
    }
    const body = await response.json() as {
        items: Array<{ id: number; f_code: string; l1_process: string; is_archived?: boolean }>;
    };
    const process = body.items.find((item) => item.l1_process === l1Process);
    return process
        ? { id: process.id, f_code: process.f_code, l1_process: process.l1_process, is_archived: process.is_archived }
        : null;
}

export async function getAssetByName(name: string): Promise<AssetLookup | null> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const params = new URLSearchParams({ search: name, include_archived: 'true', limit: '100' });
    const response = await fetch(`${apiBase}/api/v1/assets?${params.toString()}`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to load assets for '${name}': ${response.status}`);
    }
    const body = await response.json() as {
        items: Array<{ id: number; name: string; is_archived?: boolean }>;
    };
    const asset = body.items.find((item) => item.name === name);
    return asset ? { id: asset.id, name: asset.name, is_archived: asset.is_archived } : null;
}

async function ensureArchivedState(
    resource: 'processes' | 'assets',
    id: number,
    currentlyArchived: boolean,
    archived: boolean,
): Promise<void> {
    if (currentlyArchived === archived) {
        return;
    }
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    if (archived) {
        const response = await fetch(`${apiBase}/api/v1/${resource}/${id}`, { method: 'DELETE', headers });
        if (!response.ok && response.status !== 204) {
            throw new Error(`Failed to archive ${resource}/${id}: ${response.status}`);
        }
    } else {
        const response = await fetch(`${apiBase}/api/v1/${resource}/${id}/restore`, {
            method: 'POST',
            headers,
            body: JSON.stringify({}),
        });
        if (!response.ok) {
            throw new Error(`Failed to restore ${resource}/${id}: ${response.status}`);
        }
    }
}

export async function ensureProcessArchived(l1Process: string, archived: boolean): Promise<number> {
    const process = await getProcessByL1(l1Process);
    if (!process) {
        throw new Error(`Process '${l1Process}' not found — run the deterministic E2E seed first.`);
    }
    await ensureArchivedState('processes', process.id, process.is_archived === true, archived);
    return process.id;
}

export async function ensureAssetArchived(name: string, archived: boolean): Promise<number> {
    const asset = await getAssetByName(name);
    if (!asset) {
        throw new Error(`Asset '${name}' not found — run the deterministic E2E seed first.`);
    }
    await ensureArchivedState('assets', asset.id, asset.is_archived === true, archived);
    return asset.id;
}

export async function createProcessViaApi(
    payload: Record<string, string | number | null>,
): Promise<ProcessLookup> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/processes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(`Failed to create process: ${response.status} - ${await response.text()}`);
    }
    const body = await response.json() as { id: number; f_code: string; l1_process: string };
    return { id: body.id, f_code: body.f_code, l1_process: body.l1_process };
}

export async function createAssetViaApi(
    payload: Record<string, string | number | null>,
): Promise<AssetLookup> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(`Failed to create asset: ${response.status} - ${await response.text()}`);
    }
    const body = await response.json() as { id: number; name: string };
    return { id: body.id, name: body.name };
}

/** POST an intentionally invalid payload; returns the HTTP status (422 expected). */
export async function postProcessExpectingStatus(payload: Record<string, unknown>): Promise<number> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/processes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    return response.status;
}

/** POST an intentionally invalid payload; returns the HTTP status (422 expected). */
export async function postAssetExpectingStatus(payload: Record<string, unknown>): Promise<number> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    return response.status;
}

export async function listAssetProcessLinks(assetId: number): Promise<ProcessAssetLinkLookup[]> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/assets/${assetId}/process-links`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to list process links for asset ${assetId}: ${response.status}`);
    }
    return await response.json() as ProcessAssetLinkLookup[];
}

export async function listAssetAssetLinks(assetId: number): Promise<AssetAssetLinkLookup[]> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/assets/${assetId}/asset-links`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to list asset links for asset ${assetId}: ${response.status}`);
    }
    return await response.json() as AssetAssetLinkLookup[];
}

/** Remove every Process link of the asset so link tests start from a clean baseline. */
export async function resetAssetProcessLinks(assetId: number): Promise<void> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const links = await listAssetProcessLinks(assetId);
    for (const link of links) {
        const response = await fetch(`${apiBase}/api/v1/assets/${assetId}/process-links/${link.process_id}`, {
            method: 'DELETE',
            headers,
        });
        if (!response.ok && response.status !== 204 && response.status !== 404) {
            throw new Error(`Failed to remove process link ${link.process_id} on asset ${assetId}: ${response.status}`);
        }
    }
}

/** Remove every Asset link of the asset so link tests start from a clean baseline. */
export async function resetAssetAssetLinks(assetId: number): Promise<void> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const links = await listAssetAssetLinks(assetId);
    for (const link of links) {
        const response = await fetch(`${apiBase}/api/v1/assets/${assetId}/asset-links/${link.id}`, {
            method: 'DELETE',
            headers,
        });
        if (!response.ok && response.status !== 204 && response.status !== 404) {
            throw new Error(`Failed to remove asset link ${link.id} on asset ${assetId}: ${response.status}`);
        }
    }
}

/** Re-point the asset's primary designation at the given process (idempotent). */
export async function ensureAssetPrimaryProcess(assetId: number, processId: number): Promise<void> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const links = await listAssetProcessLinks(assetId);
    const target = links.find((link) => link.process_id === processId);
    if (!target) {
        throw new Error(`Asset ${assetId} has no link to process ${processId} — reseed the deterministic fixtures.`);
    }
    if (target.is_primary) {
        return;
    }
    const response = await fetch(`${apiBase}/api/v1/assets/${assetId}/process-links/${processId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_primary: true }),
    });
    if (!response.ok) {
        throw new Error(`Failed to set primary process ${processId} on asset ${assetId}: ${response.status}`);
    }
}
