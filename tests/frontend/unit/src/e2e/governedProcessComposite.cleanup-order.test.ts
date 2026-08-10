import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(
  process.cwd(),
  '../tests/frontend/e2e/approval-workflows/governed-process-edit.spec.ts',
), 'utf8');

describe('governed Process composite fixture cleanup', () => {
  it('cleans child relationships and the Asset before restoring their approval policies', () => {
    const cleanup = source.slice(source.indexOf("runCleanupSteps('Failed to restore composite Process fixture'"));
    const removeLink = cleanup.indexOf('removeAssetVendorLinkTuple');
    const archiveAsset = cleanup.indexOf('ensureAssetArchived');
    const restoreAssetPolicy = cleanup.indexOf(
      "updateApprovalScenario('protected_asset_edit', assetScenario)",
    );
    const restoreVendorPolicy = cleanup.indexOf(
      "updateApprovalScenario('protected_vendor_edit', vendorScenario)",
    );

    expect(removeLink).toBeGreaterThanOrEqual(0);
    expect(archiveAsset).toBeGreaterThan(removeLink);
    expect(restoreAssetPolicy).toBeGreaterThan(archiveAsset);
    expect(restoreVendorPolicy).toBeGreaterThan(archiveAsset);
  });
});
