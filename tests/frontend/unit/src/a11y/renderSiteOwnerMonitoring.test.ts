import { describe, expect, it } from 'vitest';

import {
  createOwnedAbortAccounting,
  describeLiveNetworkFailure,
  describeLiveNetworkResponse,
} from '../../../e2e/helpers/renderSiteOwnerMonitoring';

describe('live dialog render-site owner monitoring', () => {
  it('fails closed for request failures after owner monitoring starts', () => {
    expect(describeLiveNetworkFailure({
      method: 'GET',
      url: 'http://127.0.0.1:5174/api/v1/risks',
      failureText: 'net::ERR_CONNECTION_RESET',
    })).toBe('requestfailed: GET /api/v1/risks (net::ERR_CONNECTION_RESET)');
  });

  it('accepts only requests already in flight when owner replacement begins', () => {
    const accounting = createOwnedAbortAccounting<object>();
    const previousOwnerRequest = {};
    const finalOwnerRequest = {};
    const nonAbortFailure = {};
    const finishedRequest = {};

    accounting.requestStarted(previousOwnerRequest, 'GET http://localhost/api/previous-owner');
    accounting.requestStarted(nonAbortFailure, 'GET http://localhost/api/non-abort');
    accounting.requestStarted(finishedRequest, 'GET http://localhost/api/finished');
    accounting.markCurrentRequestsAsExpectedAborts();
    accounting.requestFinished(finishedRequest);
    accounting.requestStarted(finalOwnerRequest, 'GET http://localhost/api/final-owner');

    expect(accounting.consumeExpectedAbort(previousOwnerRequest, 'net::ERR_ABORTED')).toBe(true);
    expect(accounting.consumeExpectedAbort(finalOwnerRequest, 'net::ERR_ABORTED')).toBe(false);
    expect(accounting.consumeExpectedAbort(nonAbortFailure, 'net::ERR_CONNECTION_RESET')).toBe(false);
    expect(accounting.consumeExpectedAbort(finishedRequest, 'net::ERR_ABORTED')).toBe(false);
  });

  it('accepts only the older request superseded by an exact in-flight duplicate', () => {
    const accounting = createOwnedAbortAccounting<object>();
    const firstRequest = {};
    const replacementRequest = {};
    const differentRequest = {};
    const differentMethodRequest = {};

    accounting.requestStarted(firstRequest, 'GET http://localhost/api/v1/kris/12?include_archived=true');
    accounting.requestStarted(differentRequest, 'GET http://localhost/api/v1/kris/13?include_archived=true');
    accounting.requestStarted(differentMethodRequest, 'POST http://localhost/api/v1/kris/12?include_archived=true');
    accounting.requestStarted(replacementRequest, 'GET http://localhost/api/v1/kris/12?include_archived=true');

    expect(accounting.consumeExpectedAbort(firstRequest, 'net::ERR_ABORTED')).toBe(true);
    expect(accounting.consumeExpectedAbort(replacementRequest, 'net::ERR_ABORTED')).toBe(false);
    expect(accounting.consumeExpectedAbort(differentRequest, 'net::ERR_ABORTED')).toBe(false);
    expect(accounting.consumeExpectedAbort(differentMethodRequest, 'net::ERR_ABORTED')).toBe(false);
  });

  it('does not mark a completed request when the same operation is retried', () => {
    const accounting = createOwnedAbortAccounting<object>();
    const completedRequest = {};
    const retryRequest = {};
    const key = 'GET http://localhost/api/v1/controls/21';

    accounting.requestStarted(completedRequest, key);
    accounting.requestFinished(completedRequest);
    accounting.requestStarted(retryRequest, key);

    expect(accounting.consumeExpectedAbort(completedRequest, 'net::ERR_ABORTED')).toBe(false);
    expect(accounting.consumeExpectedAbort(retryRequest, 'net::ERR_ABORTED')).toBe(false);
  });

  it('does not share supersession state between test attempts', () => {
    const firstAttempt = createOwnedAbortAccounting<object>();
    const secondAttempt = createOwnedAbortAccounting<object>();
    const firstRequest = {};
    const replacementRequest = {};
    const key = 'GET http://localhost/api/v1/risks/23';

    firstAttempt.requestStarted(firstRequest, key);
    firstAttempt.requestStarted(replacementRequest, key);

    expect(firstAttempt.consumeExpectedAbort(firstRequest, 'net::ERR_ABORTED')).toBe(true);
    expect(secondAttempt.consumeExpectedAbort(firstRequest, 'net::ERR_ABORTED')).toBe(false);
  });

  it('allows only the exact aborted login-shell handoff request', () => {
    const event = {
      method: 'GET',
      url: 'http://127.0.0.1:5174/api/v1/users/me/shell-summary',
      failureText: 'net::ERR_ABORTED',
    };

    expect(describeLiveNetworkFailure(
      event,
      ['GET /api/v1/users/me/shell-summary net::ERR_ABORTED'],
    )).toBeNull();
    expect(describeLiveNetworkFailure(
      { ...event, failureText: 'net::ERR_CONNECTION_RESET' },
      ['GET /api/v1/users/me/shell-summary net::ERR_ABORTED'],
    )).toBe('requestfailed: GET /api/v1/users/me/shell-summary (net::ERR_CONNECTION_RESET)');
  });

  it('allows only the exact dashboard route-transition cancellation for every live driver', () => {
    const event = {
      method: 'GET',
      url: 'http://127.0.0.1:5174/api/v1/dashboard/overview',
      failureText: 'net::ERR_ABORTED',
    };

    expect(describeLiveNetworkFailure(event)).toBeNull();
    expect(describeLiveNetworkFailure({ ...event, method: 'POST' }))
      .toBe('requestfailed: POST /api/v1/dashboard/overview (net::ERR_ABORTED)');
    expect(describeLiveNetworkFailure({ ...event, url: `${event.url}/recent` }))
      .toBe('requestfailed: GET /api/v1/dashboard/overview/recent (net::ERR_ABORTED)');
    expect(describeLiveNetworkFailure({ ...event, failureText: 'net::ERR_CONNECTION_RESET' }))
      .toBe('requestfailed: GET /api/v1/dashboard/overview (net::ERR_CONNECTION_RESET)');
  });

  it('records application error responses and ignores successful responses', () => {
    expect(describeLiveNetworkResponse({
      method: 'GET',
      url: 'http://127.0.0.1:5174/api/v1/risks',
      status: 503,
    })).toBe('response: GET /api/v1/risks (503)');
    expect(describeLiveNetworkResponse({
      method: 'GET',
      url: 'http://127.0.0.1:5174/api/v1/risks',
      status: 200,
    })).toBeNull();
  });

  it('allows only an exact site-specific response entry', () => {
    const event = {
      method: 'GET',
      url: 'http://127.0.0.1:5174/api/v1/optional',
      status: 404,
    };

    expect(describeLiveNetworkResponse(event, ['GET /api/v1/optional 404'])).toBeNull();
    expect(describeLiveNetworkResponse(event, ['GET /api/v1/optional 500']))
      .toBe('response: GET /api/v1/optional (404)');
  });
});
