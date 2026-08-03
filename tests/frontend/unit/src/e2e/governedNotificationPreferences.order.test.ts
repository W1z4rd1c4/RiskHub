import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(
  process.cwd(),
  '../tests/frontend/e2e/approval-workflows/governed-notification-preferences.spec.ts',
), 'utf8');

describe('governed notification preference evidence ordering', () => {
  it('observes the resolver action notification before approval and the requester update after approval', () => {
    const title = "test('enabled delivery reaches the actionable resolver before approval and both inboxes after approval'";
    const enabledFlow = source.slice(source.indexOf(title));
    const actionObservation = enabledFlow.indexOf(
      "waitForNotificationByAccountName(\n                'Anna Kowalski'",
    );
    const approval = enabledFlow.indexOf('approveByReason(croPage, enabledReason)');
    const requesterObservation = enabledFlow.indexOf(
      "waitForNotificationByAccountName(\n                'Petra Svobodová'",
    );

    expect(actionObservation).toBeGreaterThanOrEqual(0);
    expect(approval).toBeGreaterThan(actionObservation);
    expect(requesterObservation).toBeGreaterThan(approval);
  });
});
