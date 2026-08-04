import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(
  process.cwd(),
  '../tests/frontend/e2e/approval-workflows/governed-notification-preferences.spec.ts',
), 'utf8');

describe('governed notification preference evidence ordering', () => {
  it('shows the resolver action before approval and only the requester update after approval', () => {
    const title = "test('enabled delivery reaches the resolver inbox before approval and requester inbox after approval'";
    const enabledFlow = source.slice(source.indexOf(title));
    const actionObservation = enabledFlow.indexOf(
      "waitForNotificationByAccountName(\n                'Anna Kowalski'",
    );
    const approval = enabledFlow.indexOf('approveByReason(croPage, enabledReason)');
    const requesterObservation = enabledFlow.indexOf(
      "waitForNotificationByAccountName(\n                'Petra Svobodová'",
    );
    const resolverInbox = enabledFlow.indexOf('openNotificationInbox(croPage)');
    const requesterInbox = enabledFlow.indexOf('openNotificationInbox(riskManagerPage)');

    expect(actionObservation).toBeGreaterThanOrEqual(0);
    expect(resolverInbox).toBeGreaterThan(actionObservation);
    expect(approval).toBeGreaterThan(resolverInbox);
    expect(requesterObservation).toBeGreaterThan(approval);
    expect(requesterInbox).toBeGreaterThan(requesterObservation);
    expect(enabledFlow.slice(approval, requesterInbox)).not.toContain('openNotificationInbox(croPage)');
  });
});
