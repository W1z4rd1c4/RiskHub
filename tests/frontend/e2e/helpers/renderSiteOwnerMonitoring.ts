interface FailedRequestEvent {
  method: string;
  url: string;
  failureText: string;
}

interface ResponseEvent {
  method: string;
  url: string;
  status: number;
}

export function createOwnedAbortAccounting<RequestIdentity>() {
  const inFlightRequests = new Set<RequestIdentity>();
  const expectedAbortRequests = new Set<RequestIdentity>();

  return {
    requestStarted(request: RequestIdentity): void {
      inFlightRequests.add(request);
    },
    markCurrentRequestsAsExpectedAborts(): void {
      inFlightRequests.forEach((request) => expectedAbortRequests.add(request));
    },
    requestFinished(request: RequestIdentity): void {
      inFlightRequests.delete(request);
      expectedAbortRequests.delete(request);
    },
    consumeExpectedAbort(request: RequestIdentity, failureText: string): boolean {
      inFlightRequests.delete(request);
      const expectedAbort = expectedAbortRequests.delete(request);
      return expectedAbort && failureText === 'net::ERR_ABORTED';
    },
  };
}

const dashboardOverviewHandoffFailure = 'GET /api/v1/dashboard/overview net::ERR_ABORTED';

function pathname(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

export function describeLiveNetworkFailure(
  event: FailedRequestEvent,
  allowedFailures: readonly string[] = [],
): string | null {
  const requestKey = `${event.method} ${pathname(event.url)} ${event.failureText}`;
  if (
    requestKey === dashboardOverviewHandoffFailure
    || allowedFailures.includes(requestKey)
  ) return null;
  return `requestfailed: ${event.method} ${pathname(event.url)} (${event.failureText})`;
}

export function describeLiveNetworkResponse(
  event: ResponseEvent,
  allowedErrors: readonly string[] = [],
): string | null {
  if (event.status < 400) return null;
  const requestKey = `${event.method} ${pathname(event.url)} ${event.status}`;
  if (allowedErrors.includes(requestKey)) return null;
  return `response: ${event.method} ${pathname(event.url)} (${event.status})`;
}
