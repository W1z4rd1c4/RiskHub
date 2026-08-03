import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanupGovernedProcessFixture } from '../../../e2e/helpers/ict-register';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('governed Process E2E cleanup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attempts the fixture cleanup when an additional approval scenario cannot be read', async () => {
    let scenarioReads = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/config')) {
        return jsonResponse({ demo_login_enabled: true, auth_mode: 'hybrid_dev' });
      }
      if (url.includes('/api/v1/auth/demo-login') && init?.method === 'POST') {
        return jsonResponse({ access_token: 'demo-token' });
      }
      if (url.includes('/api/v1/approvals?')) {
        return jsonResponse({ items: [] });
      }
      if (url.endsWith('/api/v1/riskhub/approval-scenarios')) {
        scenarioReads += 1;
        if (scenarioReads === 2) {
          return jsonResponse({ detail: 'scenario read failed' }, 500);
        }
        return jsonResponse([{
          key: 'protected_process_edit',
          requires_approval: false,
          approver_roles: ['admin'],
        }]);
      }
      if (url.includes('/api/v1/processes?')) {
        return jsonResponse({
          items: [{
            id: 42,
            f_code: 'F-E2E-CLEANUP',
            l1_process: 'E2E cleanup Process',
            is_archived: false,
          }],
        });
      }
      if (
        url.endsWith('/api/v1/processes/42/risk-links')
        || url.endsWith('/api/v1/processes/42/asset-links')
        || url.endsWith('/api/v1/processes/42/vendor-links')
      ) {
        return jsonResponse([]);
      }
      if (url.endsWith('/api/v1/processes/42') && init?.method === 'DELETE') {
        return jsonResponse({ detail: 'archive failed' }, 500);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    await expect(cleanupGovernedProcessFixture({
      processName: 'E2E cleanup Process',
      additionalScenarioKeys: ['protected_asset_edit'],
    })).rejects.toThrow(
      /Failed to read protected Process approval scenario: 500; Failed to archive governed Process fixture 42: 500/,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/processes/42',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
