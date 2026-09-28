import { AccountingError } from './types';

// One place that turns an accounting API's answer into data or a clear,
// correctly-retryable error. 4xx other than 408/429 are the request's fault
// and aren't retried; the provider's own message is kept for Settings.

export async function requestJson<T>(
  system: string,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown; form?: Record<string, string> } = {}
): Promise<{ data: T; headers: Headers }> {
  const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };
  let body: string | undefined;
  if (init.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.form).toString();
  } else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  let res: Response;
  try {
    res = await fetch(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new AccountingError(`Couldn't reach ${system} (${error instanceof Error ? error.message : 'network error'}).`, true);
  }

  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 300) };
  }

  if (!res.ok) {
    const detail = providerMessage(data);
    const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
    const message =
      res.status === 401
        ? `${system} rejected the sign-in. Reconnect it in Settings → Integrations.`
        : `${system} answered ${res.status}${detail ? `: ${detail}` : '.'}`;
    throw new AccountingError(message.slice(0, 480), retryable, res.status);
  }
  return { data: data as T, headers: res.headers };
}

// Each system words its errors differently; pull out the human part.
function providerMessage(data: unknown): string {
  const d = data as Record<string, any>;
  const candidates = [
    d?.Fault?.Error?.[0]?.Detail, // QuickBooks
    d?.Fault?.Error?.[0]?.Message,
    d?.Elements?.[0]?.ValidationErrors?.[0]?.Message, // Xero
    d?.Message,
    d?.[0]?.$message, // Sage
    d?.['o:errorDetails']?.[0]?.detail, // NetSuite
    d?.error_description,
    d?.error?.message,
    d?.title,
    typeof d?.error === 'string' ? d.error : undefined,
    d?.raw,
  ];
  return String(candidates.find((value) => typeof value === 'string' && value.trim()) ?? '').trim();
}

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const round2 = (value: number) => Math.round(value * 100) / 100;
