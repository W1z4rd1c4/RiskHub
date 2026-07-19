/**
 * ICT Register API helpers for E2E tests (Processes, Assets, links,
 * Vendor Contracts, and Sub-outsourcing chains).
 *
 * Deterministic-state helpers mirror helpers/api-auth.ts: look up seeded
 * fixtures by their stable natural keys, force archive state, and reset link
 * baselines so UI link-management tests always start from a known state.
 * All calls run as the risk manager demo user (processes:* / assets:*).
 */

import type { TestInfo } from '@playwright/test';

import { getApiBaseUrl, getDemoToken } from './api-auth';

const RISK_MANAGER = { email: 'risk.manager@riskhub.local', fallbackUserIds: [3] };
const CRO = { email: 'cro@riskhub.local', fallbackUserIds: [2] };
const PROTECTED_PROCESS_SCENARIO = 'protected_process_edit';

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

async function croHeaders(): Promise<Record<string, string>> {
    const token = await getDemoToken(CRO);
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

async function defaultProcessAccountability(): Promise<{
    process_owner_user_id: number;
    owning_department_id: number;
}> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const [ownersResponse, departmentsResponse] = await Promise.all([
        fetch(`${apiBase}/api/v1/users/lookup/process-owners?q=ops.analyst%40riskhub.local&limit=10`, { headers }),
        fetch(`${apiBase}/api/v1/departments/lookup/process-owners?q=Operations&limit=10`, { headers }),
    ]);
    if (!ownersResponse.ok || !departmentsResponse.ok) {
        throw new Error(
            `Failed to resolve Process accountability fixtures: owners=${ownersResponse.status}, departments=${departmentsResponse.status}`,
        );
    }
    const owners = await ownersResponse.json() as Array<{ id: number; email: string }>;
    const departments = await departmentsResponse.json() as Array<{ id: number; name: string }>;
    const owner = owners.find((candidate) => candidate.email === 'ops.analyst@riskhub.local');
    const department = departments.find((candidate) => candidate.name === 'Operations');
    if (!owner || !department) {
        throw new Error('Required default Process Owner or Owning Department fixture is missing');
    }
    return {
        process_owner_user_id: owner.id,
        owning_department_id: department.id,
    };
}

async function defaultAssetAccountability(): Promise<{
    business_owner_user_id: number;
    ict_owner_user_id: number;
    owning_department_id: number;
}> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const [businessOwnersResponse, ictOwnersResponse, departmentsResponse] = await Promise.all([
        fetch(`${apiBase}/api/v1/users/lookup/asset-owners?q=ops.head%40riskhub.local&limit=10`, { headers }),
        fetch(`${apiBase}/api/v1/users/lookup/asset-owners?q=it.head%40riskhub.local&limit=10`, { headers }),
        fetch(`${apiBase}/api/v1/departments/lookup/asset-owners?q=Operations&limit=10`, { headers }),
    ]);
    if (!businessOwnersResponse.ok || !ictOwnersResponse.ok || !departmentsResponse.ok) {
        throw new Error(
            `Failed to resolve Asset accountability fixtures: business=${businessOwnersResponse.status}, ict=${ictOwnersResponse.status}, departments=${departmentsResponse.status}`,
        );
    }
    const businessOwners = await businessOwnersResponse.json() as Array<{ id: number; email: string }>;
    const ictOwners = await ictOwnersResponse.json() as Array<{ id: number; email: string }>;
    const departments = await departmentsResponse.json() as Array<{ id: number; name: string }>;
    const businessOwner = businessOwners.find((candidate) => candidate.email === 'ops.head@riskhub.local');
    const ictOwner = ictOwners.find((candidate) => candidate.email === 'it.head@riskhub.local');
    const department = departments.find((candidate) => candidate.name === 'Operations');
    if (!businessOwner || !ictOwner || !department) {
        throw new Error('Required default Asset owners or Owning Department fixture is missing');
    }
    return {
        business_owner_user_id: businessOwner.id,
        ict_owner_user_id: ictOwner.id,
        owning_department_id: department.id,
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
    const accountability = await defaultProcessAccountability();
    const response = await fetch(`${apiBase}/api/v1/processes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...accountability, ...payload }),
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
    const accountability = await defaultAssetAccountability();
    const response = await fetch(`${apiBase}/api/v1/assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...accountability, ...payload }),
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
    const accountability = await defaultProcessAccountability();
    const response = await fetch(`${apiBase}/api/v1/processes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...accountability, ...payload }),
    });
    return response.status;
}

/** POST an intentionally invalid payload; returns the HTTP status (422 expected). */
export async function postAssetExpectingStatus(payload: Record<string, unknown>): Promise<number> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const accountability = await defaultAssetAccountability();
    const response = await fetch(`${apiBase}/api/v1/assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...accountability, ...payload }),
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

interface ApprovalScenarioSnapshot {
    requires_approval: boolean;
    approver_roles: string[];
}

interface ApprovalQueueItem {
    id: number;
    status: string;
    reason: string;
    resource_name: string;
}

interface ProcessRiskLinkCleanup {
    id: number;
    risk_id: number;
}

interface ProcessVendorLinkCleanup {
    id: number;
}

interface RelationshipCleanupOptions<TLink> {
    relationshipName: 'Risk' | 'Asset' | 'Vendor';
    listUrl: string;
    removalUrl: (link: TLink) => string;
    linkId: (link: TLink) => number;
    headers: Record<string, string>;
    processId: number;
}

export interface GovernedProcessCleanupOptions {
    processName: string;
    assetPrimaryBaseline?: {
        assetId: number;
        processId: number | null;
    };
}

async function cancelPendingApprovalsForMarker(marker: string): Promise<void> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const params = new URLSearchParams({ my_requests: 'true', skip: '0', limit: '100' });
    const response = await fetch(`${apiBase}/api/v1/approvals?${params.toString()}`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to list pending approvals for '${marker}': ${response.status}`);
    }
    const body = await response.json() as { items: ApprovalQueueItem[] };
    const pending = body.items.filter((item) => (
        (item.status === 'pending' || item.status === 'pending_privileged')
        && (item.reason.includes(marker) || item.resource_name.includes(marker))
    ));
    for (const approval of pending) {
        const cancelled = await fetch(`${apiBase}/api/v1/approvals/${approval.id}/cancel`, {
            method: 'POST',
            headers,
        });
        if (!cancelled.ok && ![400, 404, 409].includes(cancelled.status)) {
            throw new Error(`Failed to cancel approval ${approval.id}: ${cancelled.status}`);
        }
    }
}

async function getProtectedProcessScenario(): Promise<ApprovalScenarioSnapshot> {
    const apiBase = getApiBaseUrl();
    const headers = await croHeaders();
    const response = await fetch(`${apiBase}/api/v1/riskhub/approval-scenarios`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to read protected Process approval scenario: ${response.status}`);
    }
    const scenarios = await response.json() as Array<ApprovalScenarioSnapshot & { key: string }>;
    const scenario = scenarios.find((candidate) => candidate.key === PROTECTED_PROCESS_SCENARIO);
    if (!scenario) {
        throw new Error(`Approval scenario '${PROTECTED_PROCESS_SCENARIO}' is missing`);
    }
    return {
        requires_approval: scenario.requires_approval,
        approver_roles: [...scenario.approver_roles],
    };
}

async function updateProtectedProcessScenario(snapshot: ApprovalScenarioSnapshot): Promise<void> {
    const apiBase = getApiBaseUrl();
    const headers = await croHeaders();
    const response = await fetch(
        `${apiBase}/api/v1/riskhub/approval-scenarios/${PROTECTED_PROCESS_SCENARIO}`,
        {
            method: 'PATCH',
            headers,
            body: JSON.stringify(snapshot),
        },
    );
    if (!response.ok) {
        throw new Error(
            `Failed to update protected Process approval scenario: ${response.status} - ${await response.text()}`,
        );
    }
}

function cleanupFailureMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Report a secondary cleanup failure without replacing the failure that made
 * the test enter its finally block. A cleanup-only failure still fails the test.
 */
export async function cleanupWithoutMaskingPrimaryFailure(
    primaryFailure: unknown,
    cleanup: () => Promise<void>,
    testInfo: TestInfo,
): Promise<void> {
    try {
        await cleanup();
    } catch (cleanupError) {
        if (primaryFailure === undefined) {
            throw cleanupError;
        }
        testInfo.annotations.push({
            type: 'cleanup-error',
            description: cleanupFailureMessage(cleanupError),
        });
    }
}

async function cleanupListedProcessRelationships<TLink>(
    options: RelationshipCleanupOptions<TLink>,
): Promise<void> {
    const {
        relationshipName,
        listUrl,
        removalUrl,
        linkId,
        headers,
        processId,
    } = options;
    const response = await fetch(listUrl, { headers });
    if (!response.ok) {
        throw new Error(
            `Failed to list ${relationshipName} links for Process ${processId}: ${response.status}`,
        );
    }
    const links = await response.json() as TLink[];
    for (const link of links) {
        const removed = await fetch(removalUrl(link), {
            method: 'DELETE',
            headers,
            body: JSON.stringify({}),
        });
        if (!removed.ok && removed.status !== 404) {
            throw new Error(
                `Failed to remove ${relationshipName} link ${linkId(link)}: ${removed.status}`,
            );
        }
    }
}

/**
 * Remove a unique governed-Process E2E fixture without leaving global policy,
 * approvals, links, or a seeded Asset's primary designation changed.
 */
export async function cleanupGovernedProcessFixture(
    options: GovernedProcessCleanupOptions,
): Promise<void> {
    const { processName, assetPrimaryBaseline } = options;
    const failures: unknown[] = [];
    const attempt = async (operation: () => Promise<void>): Promise<void> => {
        try {
            await operation();
        } catch (error) {
            failures.push(error);
        }
    };

    await attempt(() => cancelPendingApprovalsForMarker(processName));

    let scenario: ApprovalScenarioSnapshot | null = null;
    try {
        scenario = await getProtectedProcessScenario();
        if (scenario.requires_approval) {
            await updateProtectedProcessScenario({
                requires_approval: false,
                approver_roles: scenario.approver_roles,
            });
        }

        const process = await getProcessByL1(processName);
        if (process) {
            const apiBase = getApiBaseUrl();
            const headers = await riskManagerHeaders();

            await attempt(() => cleanupListedProcessRelationships<ProcessRiskLinkCleanup>({
                relationshipName: 'Risk',
                listUrl: `${apiBase}/api/v1/processes/${process.id}/risk-links`,
                removalUrl: (link) => `${apiBase}/api/v1/risks/${link.risk_id}/process-links/${link.id}`,
                linkId: (link) => link.id,
                headers,
                processId: process.id,
            }));

            await attempt(() => cleanupListedProcessRelationships<ProcessAssetLinkLookup>({
                relationshipName: 'Asset',
                listUrl: `${apiBase}/api/v1/processes/${process.id}/asset-links`,
                removalUrl: (link) => (
                    `${apiBase}/api/v1/assets/${link.asset_id}/process-links/${process.id}`
                ),
                linkId: (link) => link.id,
                headers,
                processId: process.id,
            }));

            await attempt(() => cleanupListedProcessRelationships<ProcessVendorLinkCleanup>({
                relationshipName: 'Vendor',
                listUrl: `${apiBase}/api/v1/processes/${process.id}/vendor-links`,
                removalUrl: (link) => `${apiBase}/api/v1/processes/${process.id}/vendor-links/${link.id}`,
                linkId: (link) => link.id,
                headers,
                processId: process.id,
            }));

            if (assetPrimaryBaseline?.processId != null) {
                await attempt(() => ensureAssetPrimaryProcess(
                    assetPrimaryBaseline.assetId,
                    assetPrimaryBaseline.processId!,
                ));
            }

            await attempt(async () => {
                const current = await getProcessByL1(processName);
                if (!current || current.is_archived === true) {
                    return;
                }
                const archived = await fetch(`${apiBase}/api/v1/processes/${current.id}`, {
                    method: 'DELETE',
                    headers,
                    body: JSON.stringify({}),
                });
                if (!archived.ok) {
                    throw new Error(
                        `Failed to archive governed Process fixture ${current.id}: ${archived.status} - ${await archived.text()}`,
                    );
                }
            });
        }
    } catch (error) {
        failures.push(error);
    } finally {
        if (scenario?.requires_approval) {
            await attempt(() => updateProtectedProcessScenario(scenario!));
        }
    }

    if (failures.length > 0) {
        throw new Error(
            `Governed Process cleanup failed: ${failures.map(cleanupFailureMessage).join('; ')}`,
        );
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

// ---------------------------------------------------------------------------
// Vendor-domain register helpers (Contracts #44, Sub-outsourcing chains #45).
// All lookups run include_archived so natural-key resolution never misses a
// row a previous UI test archived.
// ---------------------------------------------------------------------------

export interface VendorContractLookup {
    id: number;
    vendor_id: number;
    contract_reference: string | null;
    main_contract: string | null;
    is_archived: boolean;
}

export interface VendorSubOutsourcingLookup {
    id: number;
    vendor_id: number;
    contract_id: number;
    predecessor_id: number | null;
    sub_provider_name: string | null;
    ict_service_code: string | null;
    is_archived: boolean;
}

export async function listVendorContracts(vendorId: number): Promise<VendorContractLookup[]> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(
        `${apiBase}/api/v1/vendors/${vendorId}/contracts?include_archived=true`,
        { headers },
    );
    if (!response.ok) {
        throw new Error(`Failed to list contracts for vendor ${vendorId}: ${response.status}`);
    }
    return await response.json() as VendorContractLookup[];
}

export async function getContractByReference(
    vendorId: number,
    contractReference: string,
): Promise<VendorContractLookup | null> {
    const contracts = await listVendorContracts(vendorId);
    return contracts.find((contract) => contract.contract_reference === contractReference) ?? null;
}

export async function createVendorContractViaApi(
    vendorId: number,
    payload: Record<string, string | number | null>,
): Promise<VendorContractLookup> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/contracts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(`Failed to create contract on vendor ${vendorId}: ${response.status} - ${await response.text()}`);
    }
    return await response.json() as VendorContractLookup;
}

/** Force the seeded contract's archive state (idempotent test baseline). */
export async function ensureContractArchived(
    vendorId: number,
    contractReference: string,
    archived: boolean,
): Promise<number> {
    const contract = await getContractByReference(vendorId, contractReference);
    if (!contract) {
        throw new Error(`Contract '${contractReference}' not found — run the deterministic E2E seed first.`);
    }
    if (contract.is_archived === archived) {
        return contract.id;
    }
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    if (archived) {
        const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/contracts/${contract.id}`, {
            method: 'DELETE',
            headers,
        });
        if (!response.ok && response.status !== 204) {
            throw new Error(`Failed to archive contract ${contract.id}: ${response.status}`);
        }
    } else {
        const response = await fetch(
            `${apiBase}/api/v1/vendors/${vendorId}/contracts/${contract.id}/restore`,
            { method: 'POST', headers, body: JSON.stringify({}) },
        );
        if (!response.ok) {
            throw new Error(`Failed to restore contract ${contract.id}: ${response.status}`);
        }
    }
    return contract.id;
}

export async function listVendorSubOutsourcing(vendorId: number): Promise<VendorSubOutsourcingLookup[]> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(
        `${apiBase}/api/v1/vendors/${vendorId}/sub-outsourcing?include_archived=true`,
        { headers },
    );
    if (!response.ok) {
        throw new Error(`Failed to list sub-outsourcing for vendor ${vendorId}: ${response.status}`);
    }
    return await response.json() as VendorSubOutsourcingLookup[];
}

export async function getSubOutsourcingByName(
    vendorId: number,
    subProviderName: string,
): Promise<VendorSubOutsourcingLookup | null> {
    const entries = await listVendorSubOutsourcing(vendorId);
    return entries.find((entry) => entry.sub_provider_name === subProviderName) ?? null;
}

export async function createSubOutsourcingViaApi(
    vendorId: number,
    payload: Record<string, string | number | null>,
): Promise<VendorSubOutsourcingLookup> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}/sub-outsourcing`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(
            `Failed to create sub-outsourcing on vendor ${vendorId}: ${response.status} - ${await response.text()}`,
        );
    }
    return await response.json() as VendorSubOutsourcingLookup;
}

// ---------------------------------------------------------------------------
// Link-relation helpers (issue #46): Asset<->Vendor and Process<->Vendor.
// Cleanup helpers remove ONLY the given tuple so parallel tests on the same
// register rows never clobber each other's in-flight fixtures.
// ---------------------------------------------------------------------------

export interface AssetVendorLinkLookup {
    id: number;
    asset_id: number;
    vendor_id: number;
    ict_service_code: string;
    vendor_role: string | null;
    contract_reference: string | null;
    reliance: string | null;
}

export interface ProcessVendorLinkLookup {
    id: number;
    process_id: number;
    vendor_id: number;
    direct_service_description: string | null;
}

export async function listAssetVendorLinks(assetId: number): Promise<AssetVendorLinkLookup[]> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/assets/${assetId}/vendor-links`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to list vendor links for asset ${assetId}: ${response.status}`);
    }
    return await response.json() as AssetVendorLinkLookup[];
}

/** Remove the (asset, vendor, S-code) link if it exists (idempotent baseline). */
export async function removeAssetVendorLinkTuple(
    assetId: number,
    vendorId: number,
    ictServiceCode: string,
): Promise<void> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const links = await listAssetVendorLinks(assetId);
    for (const link of links) {
        if (link.vendor_id !== vendorId || link.ict_service_code !== ictServiceCode) {
            continue;
        }
        const response = await fetch(`${apiBase}/api/v1/assets/${assetId}/vendor-links/${link.id}`, {
            method: 'DELETE',
            headers,
        });
        if (!response.ok && response.status !== 204 && response.status !== 404) {
            throw new Error(`Failed to remove vendor link ${link.id} on asset ${assetId}: ${response.status}`);
        }
    }
}

export async function createAssetVendorLinkViaApi(
    assetId: number,
    payload: Record<string, string | number | null>,
): Promise<AssetVendorLinkLookup> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/assets/${assetId}/vendor-links`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(
            `Failed to create vendor link on asset ${assetId}: ${response.status} - ${await response.text()}`,
        );
    }
    return await response.json() as AssetVendorLinkLookup;
}

export async function listProcessVendorLinks(processId: number): Promise<ProcessVendorLinkLookup[]> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/processes/${processId}/vendor-links`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to list vendor links for process ${processId}: ${response.status}`);
    }
    return await response.json() as ProcessVendorLinkLookup[];
}

/** Remove the (process, vendor) §1 pair if it exists (idempotent baseline). */
export async function removeProcessVendorLinkPair(processId: number, vendorId: number): Promise<void> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const links = await listProcessVendorLinks(processId);
    for (const link of links) {
        if (link.vendor_id !== vendorId) {
            continue;
        }
        const response = await fetch(`${apiBase}/api/v1/processes/${processId}/vendor-links/${link.id}`, {
            method: 'DELETE',
            headers,
        });
        if (!response.ok && response.status !== 204 && response.status !== 404) {
            throw new Error(`Failed to remove vendor link ${link.id} on process ${processId}: ${response.status}`);
        }
    }
}

/**
 * Force the vendor's entered Substituce value (idempotent test baseline —
 * the committed register-extension round-trip test leaves it mutated).
 */
export async function ensureVendorReplaceability(vendorId: number, replaceability: string): Promise<void> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/vendors/${vendorId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ replaceability }),
    });
    if (!response.ok) {
        throw new Error(`Failed to set replaceability on vendor ${vendorId}: ${response.status} - ${await response.text()}`);
    }
}

// ---------------------------------------------------------------------------
// Threat + risk-integration helpers (issue #47).
// ---------------------------------------------------------------------------

export interface ThreatLookup {
    id: number;
    name: string;
    category: string | null;
    is_archived: boolean;
}

export interface ThreatRiskLinkLookup {
    id: number;
    threat_id: number;
    risk_id: number;
}

export async function getThreatByName(name: string): Promise<ThreatLookup | null> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const params = new URLSearchParams({ search: name, include_archived: 'true', limit: '100' });
    const response = await fetch(`${apiBase}/api/v1/threats?${params.toString()}`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to load threats for '${name}': ${response.status}`);
    }
    const body = await response.json() as {
        items: Array<{ id: number; name: string; category: string | null; is_archived: boolean }>;
    };
    const threat = body.items.find((item) => item.name === name);
    return threat
        ? { id: threat.id, name: threat.name, category: threat.category, is_archived: threat.is_archived }
        : null;
}

export async function createThreatViaApi(
    payload: Record<string, string | number | null>,
): Promise<ThreatLookup> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const stewardResponse = await fetch(`${apiBase}/api/v1/users/lookup/threat-stewards?limit=1`, { headers });
    if (!stewardResponse.ok) {
        throw new Error(`Failed to resolve the CISO Threat Steward: ${stewardResponse.status}`);
    }
    const stewards = await stewardResponse.json() as Array<{ id: number }>;
    if (!stewards[0]) {
        throw new Error('No active CISO Threat Steward is available in the E2E seed.');
    }
    const response = await fetch(`${apiBase}/api/v1/threats`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, threat_steward_user_id: stewards[0].id }),
    });
    if (!response.ok) {
        throw new Error(`Failed to create threat: ${response.status} - ${await response.text()}`);
    }
    const body = await response.json() as { id: number; name: string; category: string | null; is_archived: boolean };
    return { id: body.id, name: body.name, category: body.category, is_archived: body.is_archived };
}

export async function getRiskByCode(riskIdCode: string): Promise<{ id: number; name: string } | null> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const params = new URLSearchParams({ search: riskIdCode, include_archived: 'true', limit: '100' });
    const response = await fetch(`${apiBase}/api/v1/risks?${params.toString()}`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to load risks for '${riskIdCode}': ${response.status}`);
    }
    const body = await response.json() as {
        items: Array<{ id: number; name: string; risk_id_code?: string }>;
    };
    const risk = body.items.find((item) => item.risk_id_code === riskIdCode);
    return risk ? { id: risk.id, name: risk.name } : null;
}

export async function listThreatRiskLinks(threatId: number): Promise<ThreatRiskLinkLookup[]> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/threats/${threatId}/risk-links`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to list risk links for threat ${threatId}: ${response.status}`);
    }
    return await response.json() as ThreatRiskLinkLookup[];
}

/** Fetch one risk as the risk manager (used to verify acceptance-field persistence). */
export async function getRiskViaApi(riskId: number): Promise<Record<string, unknown>> {
    const apiBase = getApiBaseUrl();
    const headers = await riskManagerHeaders();
    const response = await fetch(`${apiBase}/api/v1/risks/${riskId}`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to load risk ${riskId}: ${response.status}`);
    }
    return await response.json() as Record<string, unknown>;
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
