export class FetchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new FetchError(res.status, body?.error?.message || 'Request failed');
  }

  return body.data as T;
}

export const apiPost = <T = unknown>(url: string, data?: unknown) =>
  apiFetch<T>(url, { method: 'POST', body: JSON.stringify(data ?? {}) });

export const apiPut = <T = unknown>(url: string, data?: unknown) =>
  apiFetch<T>(url, { method: 'PUT', body: JSON.stringify(data ?? {}) });
