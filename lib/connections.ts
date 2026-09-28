import type { ConnectionKind, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/secrets';

// The other Humlens apps a team is connected to. INVENTORY / PROCUREMENT
// connections are entered by an admin (the other app's address and an API
// key created there); a COMMERCE connection is registered by the store
// itself through /api/v1/webhook so it gets notified of changes here.

export const APP_NAMES: Record<ConnectionKind, string> = {
  INVENTORY: 'Humlens Inventory',
  PROCUREMENT: 'Humlens Procurement',
  COMMERCE: 'your store',
  ACCOUNTING: 'your accounting system',
  SUPPLIER: 'the supplier',
};

export type ConnectionOptions = {
  /** Inventory → Procurement: raise low-stock purchase requests in Procurement instead of drafting POs here. */
  routeReorders?: boolean;
  /** Inventory → Procurement: submit raised requests for approval straight away. */
  submitForApproval?: boolean;
  /** Procurement → Inventory: add received goods to Inventory stock. */
  pushReceipts?: boolean;
  /** Procurement → Inventory: update item costs from approved, matched invoices. */
  pushCosts?: boolean;
  /** Procurement → Inventory: warehouse that receives goods (Inventory's default when unset). */
  warehouseId?: string;
};

export type ResolvedConnection = {
  id: string;
  kind: ConnectionKind;
  url: string;
  secret: string;
  options: ConnectionOptions;
};

export const normaliseAppUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
};

export async function getConnection(teamId: string, kind: ConnectionKind): Promise<ResolvedConnection | null> {
  const row = await prisma.connection.findUnique({ where: { teamId_kind: { teamId, kind } } });
  if (!row) return null;
  try {
    return { id: row.id, kind: row.kind, url: row.url, secret: decryptSecret(row.secret), options: (row.options ?? {}) as ConnectionOptions };
  } catch {
    // The encryption key changed: treat as not connected until it's re-entered.
    return null;
  }
}

export async function saveConnection(params: {
  teamId: string;
  kind: ConnectionKind;
  url: string;
  secret?: string;
  options?: ConnectionOptions;
  createdById?: string;
}) {
  const existing = await prisma.connection.findUnique({ where: { teamId_kind: { teamId: params.teamId, kind: params.kind } } });
  const secret = params.secret ? encryptSecret(params.secret) : existing?.secret;
  if (!secret) throw new Error('A key is required.');
  const data = {
    url: params.url,
    secret,
    options: (params.options ?? existing?.options ?? {}) as Prisma.InputJsonValue,
    lastError: null,
  };
  return prisma.connection.upsert({
    where: { teamId_kind: { teamId: params.teamId, kind: params.kind } },
    create: { teamId: params.teamId, kind: params.kind, createdById: params.createdById, ...data },
    update: data,
  });
}

export const deleteConnection = (teamId: string, kind: ConnectionKind) =>
  prisma.connection.deleteMany({ where: { teamId, kind } });

export async function listConnections(teamId: string) {
  const rows = await prisma.connection.findMany({ where: { teamId }, orderBy: { kind: 'asc' } });
  return rows.map((row) => {
    let hint = '';
    try {
      hint = maskSecret(decryptSecret(row.secret));
    } catch {
      hint = 'unreadable — enter it again';
    }
    return {
      kind: row.kind,
      url: row.url,
      secretHint: hint,
      options: row.options as ConnectionOptions,
      lastSuccessAt: row.lastSuccessAt,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
    };
  });
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public status?: number
  ) {
    super(message);
  }
}

// Calls another Humlens app's /api/v1 with its API key. 4xx answers other
// than 408/429 are not retried: the request itself is wrong.
export async function callConnectedApp<T>(
  connection: ResolvedConnection,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}
): Promise<T> {
  const name = APP_NAMES[connection.kind];
  const url = new URL(`${connection.url}/api/v1${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) if (value !== undefined) url.searchParams.set(key, value);

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${connection.secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new ConnectionError(`Couldn't reach ${name} (${error instanceof Error ? error.message : 'network error'}).`, true);
  }

  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    const message = body?.error?.message || `${name} answered ${res.status}.`;
    const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
    throw new ConnectionError(res.status === 401 ? `${name} rejected the API key. Check it in Settings → Integrations.` : message, retryable, res.status);
  }
  return body as T;
}

export async function markConnection(id: string, error: string | null) {
  await prisma.connection
    .update({ where: { id }, data: error ? { lastError: error.slice(0, 500) } : { lastError: null, lastSuccessAt: new Date() } })
    .catch(() => undefined);
}
