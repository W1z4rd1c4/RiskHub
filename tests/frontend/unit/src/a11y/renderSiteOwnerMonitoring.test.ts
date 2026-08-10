import { describe, expect, it } from 'vitest';

import {
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
