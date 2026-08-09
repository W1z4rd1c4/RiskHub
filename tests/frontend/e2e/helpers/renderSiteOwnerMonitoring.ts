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
