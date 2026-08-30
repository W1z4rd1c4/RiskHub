import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const cwd = process.cwd();
const repoRoot = path.basename(cwd) === 'frontend' ? path.resolve(cwd, '..') : cwd;

type RegisterContract = {
    currentExportMarker: string;
    listBuilder: string;
    name: string;
    pagePath: string;
    prefix: string;
    statePath: string;
};

const REGISTERS: readonly RegisterContract[] = [
    { currentExportMarker: 'downloadExport', listBuilder: 'buildProcessRegisterListParams', name: 'Process', pagePath: 'src/pages/ProcessesPage.tsx', prefix: 'processes', statePath: 'src/pages/processes/useProcessesPageState.ts' },
    { currentExportMarker: 'downloadExport', listBuilder: 'buildAssetRegisterListParams', name: 'Asset', pagePath: 'src/pages/AssetsPage.tsx', prefix: 'assets', statePath: 'src/pages/assets/useAssetsPageState.ts' },
    { currentExportMarker: 'downloadExport', listBuilder: 'buildThreatRegisterListParams', name: 'Threat', pagePath: 'src/pages/ThreatsPage.tsx', prefix: 'threats', statePath: 'src/pages/threats/useThreatsPageState.ts' },
    { currentExportMarker: 'downloadExport', listBuilder: 'buildVendorRegisterListParams', name: 'Vendor', pagePath: 'src/pages/VendorsPage.tsx', prefix: 'vendors', statePath: 'src/pages/vendors/useVendorsPageState.ts' },
    { currentExportMarker: 'exportCurrentRisks', listBuilder: 'buildRiskRegisterListParams', name: 'Risk', pagePath: 'src/pages/RisksPage.tsx', prefix: 'risks', statePath: 'src/pages/risks/useRisksPageState.ts' },
    { currentExportMarker: 'exportCurrentControls', listBuilder: 'buildControlRegisterListParams', name: 'Control', pagePath: 'src/pages/ControlsPage.tsx', prefix: 'controls', statePath: 'src/pages/controls/useControlsPageState.ts' },
    { currentExportMarker: 'exportCurrentKris', listBuilder: 'buildKriRegisterListParams', name: 'KRI', pagePath: 'src/pages/KRIsPage.tsx', prefix: 'kris', statePath: 'src/pages/kris/useKrisPageState.ts' },
    { currentExportMarker: 'exportCurrentIssues', listBuilder: 'buildIssueRegisterListParams', name: 'Issue', pagePath: 'src/pages/IssuesPage.tsx', prefix: 'issues', statePath: 'src/pages/issues/useIssuesPageState.ts' },
] as const;

function readFrontendSource(relativePath: string): string {
    return readFileSync(path.join(repoRoot, 'frontend', relativePath), 'utf8');
}

describe('ICT-GOV #83 eight-register frontend contract', () => {
    it.each(REGISTERS)('$name uses the shared shell, URL vocabulary, normalized list builder, and current export', (contract) => {
        const pageSource = readFrontendSource(contract.pagePath);
        const stateSource = readFrontendSource(contract.statePath);

        expect(pageSource).toContain('RegisterListShell');
        expect(pageSource).toContain(`testIdPrefix="${contract.prefix}"`);
        expect(pageSource).toContain('canCreate={resolveCapabilityFlag');
        expect(pageSource).toContain('canExport={resolveCapabilityFlag');
        expect(pageSource).toContain('isAccessDenied={state.isAccessDenied}');
        expect(pageSource).toContain('isError={Boolean(state.errorKey)}');
        expect(pageSource).toContain('isLoading={state.isLoading}');
        expect(pageSource).toContain('state.hasLoadedOnce');
        expect(stateSource).toContain('parseRegisterUrlState');
        expect(stateSource).toContain('buildRegisterUrlParams');
        expect(stateSource).toContain('useCollectionDataState');
        expect(stateSource).toContain('useLatestRequestGuard');
        expect(stateSource).toContain(contract.listBuilder);
        expect(stateSource).toContain(contract.currentExportMarker);
        expect(stateSource).not.toContain('useRegisterPageController');
        expect(stateSource).not.toContain('useRegisterPageWorkflow');
    });

    it.each([
        ['Risk', 'src/pages/RisksPage.tsx', 'exportRiskSnapshot'],
        ['Control', 'src/pages/ControlsPage.tsx', 'exportControlSnapshot'],
        ['KRI', 'src/pages/KRIsPage.tsx', 'exportKriSnapshot'],
        ['Issue', 'src/pages/IssuesPage.tsx', 'exportIssueSnapshot'],
    ])('%s keeps current-view export distinct from historical evidence export', (_name, pagePath, historicalMarker) => {
        const source = readFrontendSource(pagePath);

        expect(source).toContain('onCurrentViewSubmit');
        expect(source).toContain('onSubmit');
        expect(source).toContain(historicalMarker);
    });

    it.each([
        ['Risk', 'src/pages/RisksPage.tsx'],
        ['Control', 'src/pages/ControlsPage.tsx'],
    ])('%s retains the pending-approval row projection', (_name, pagePath) => {
        const source = readFrontendSource(pagePath);

        expect(source).toContain('usePendingApprovalIds');
        expect(source).toContain('pendingApprovalIds');
    });
});
