import crypto from 'crypto';
import type { ConnectionKind, OutboundEvent, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { APP_NAMES, ConnectionError, callConnectedApp, getConnection, markConnection } from '@/lib/connections';
import { signPayload } from '@/lib/secrets';
import { AccountingError } from '@/lib/accounting/types';

// Every message to another Humlens app goes through here: it's stored first
// (so nothing is lost if the other app is down), sent straight away, and
// retried with backoff by the scheduler (lib/scheduler.ts) until it lands or
// runs out of attempts — failures then show in Settings → Integrations,
// where they can be retried by hand.

export const MAX_ATTEMPTS = 8;

/** A call to another app's /api/v1 (INVENTORY or PROCUREMENT targets). */
export type ApiCall = { method: 'POST' | 'PUT'; path: string; body?: unknown };

type Payload = { call: ApiCall } | { data: unknown };

const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002';

// Stores a message and starts delivering it. A message whose reference was
// already queued is ignored: references identify the change being reported.
export async function enqueue(params: {
  teamId: string;
  target: ConnectionKind;
  kind: string;
  reference: string;
  payload: Payload;
  deliverNow?: boolean;
}) {
  let event: OutboundEvent;
  try {
    event = await prisma.outboundEvent.create({
      data: {
        teamId: params.teamId,
        target: params.target,
        kind: params.kind,
        reference: params.reference,
        payload: params.payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
  if (params.deliverNow !== false) deliverSoon(event.id);
  return event;
}

// Tells the connected store about a change here (no-op when no store has
// registered). Stock changes still waiting to be sent are merged into one.
export async function notifyStore(teamId: string, kind: string, data: Record<string, unknown>, merge?: { key: 'skus' }) {
  const store = await prisma.connection.findUnique({ where: { teamId_kind: { teamId, kind: 'COMMERCE' } }, select: { id: true } });
  if (!store) return null;

  if (merge) {
    const pending = await prisma.outboundEvent.findFirst({
      where: { teamId, target: 'COMMERCE', kind, status: 'PENDING', attempts: 0 },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      const current = ((pending.payload as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>;
      const merged = [...new Set([...((current[merge.key] as string[]) ?? []), ...((data[merge.key] as string[]) ?? [])])];
      await prisma.outboundEvent.update({
        where: { id: pending.id },
        data: { payload: { data: { ...current, ...data, [merge.key]: merged } } as Prisma.InputJsonValue },
      });
      deliverSoon(pending.id);
      return pending;
    }
  }

  return enqueue({ teamId, target: 'COMMERCE', kind, reference: `${kind}:${crypto.randomUUID()}`, payload: { data } });
}

// Sends after the current request has finished its own work.
function deliverSoon(id: string) {
  setTimeout(() => {
    deliver(id).catch((error) => console.error('Outbox delivery failed', error));
  }, 250);
}

async function send(event: OutboundEvent) {
  // Accounting systems and PunchOut suppliers have their own senders; loaded
  // lazily because they queue through this module too.
  if (event.target === 'ACCOUNTING') {
    const { deliverAccountingEvent } = await import('@/lib/accounting/sync');
    return deliverAccountingEvent(event);
  }
  if (event.target === 'SUPPLIER') {
    const { deliverSupplierOrder } = await import('@/lib/punchout/orders');
    return deliverSupplierOrder(event);
  }

  const connection = await getConnection(event.teamId, event.target);
  if (!connection) throw new ConnectionError(`Not connected to ${APP_NAMES[event.target]}.`, false);

  const payload = event.payload as Payload;
  try {
    if ('call' in payload) {
      await callConnectedApp(connection, payload.call.path, { method: payload.call.method, body: payload.call.body });
    } else {
      const body = JSON.stringify({ event: event.kind, reference: event.reference, data: payload.data, sentAt: new Date().toISOString() });
      const timestamp = String(Math.floor(Date.now() / 1000));
      let res: Response;
      try {
        res = await fetch(connection.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Humlens-Event': event.kind,
            'X-Humlens-Timestamp': timestamp,
            'X-Humlens-Signature': signPayload(connection.secret, timestamp, body),
          },
          body,
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        throw new ConnectionError(`Couldn't reach the store (${error instanceof Error ? error.message : 'network error'}).`, true);
      }
      if (!res.ok) {
        throw new ConnectionError(`The store answered ${res.status}.`, res.status >= 500 || res.status === 408 || res.status === 429, res.status);
      }
    }
    await markConnection(connection.id, null);
  } catch (error) {
    await markConnection(connection.id, error instanceof Error ? error.message : 'Delivery failed.');
    throw error;
  }
}

export async function deliver(id: string) {
  const now = new Date();
  // Claim it for a minute so two workers can't send the same message.
  const claimed = await prisma.outboundEvent.updateMany({
    where: { id, status: 'PENDING', nextAttemptAt: { lte: now } },
    data: { nextAttemptAt: new Date(now.getTime() + 60_000) },
  });
  if (!claimed.count) return;

  const event = await prisma.outboundEvent.findUniqueOrThrow({ where: { id } });
  const attempts = event.attempts + 1;
  try {
    await send(event);
    await prisma.outboundEvent.update({
      where: { id },
      data: { status: 'DELIVERED', attempts, deliveredAt: new Date(), lastError: null },
    });
  } catch (error) {
    const retryable = error instanceof ConnectionError || error instanceof AccountingError ? error.retryable : true;
    const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
    await prisma.outboundEvent.update({
      where: { id },
      data: {
        attempts,
        status: giveUp ? 'FAILED' : 'PENDING',
        lastError: (error instanceof Error ? error.message : 'Delivery failed.').slice(0, 500),
        nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
      },
    });
  }
}

export async function deliverDue(limit = 25) {
  const due = await prisma.outboundEvent.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  for (const { id } of due) await deliver(id);
  return due.length;
}

export async function retryEvent(teamId: string, id: string) {
  const updated = await prisma.outboundEvent.updateMany({
    where: { id, teamId, status: { in: ['FAILED', 'PENDING'] } },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  if (updated.count) await deliver(id);
  return prisma.outboundEvent.findFirst({ where: { id, teamId } });
}

// Marks a failed message as dealt with (e.g. fixed by hand in the other app).
export async function dismissEvent(teamId: string, id: string) {
  await prisma.outboundEvent.updateMany({
    where: { id, teamId, status: 'FAILED' },
    data: { status: 'DELIVERED', lastError: 'Dismissed', deliveredAt: new Date() },
  });
}

export async function listOutboundEvents(teamId: string, params: { status?: 'PENDING' | 'DELIVERED' | 'FAILED'; limit?: number } = {}) {
  return prisma.outboundEvent.findMany({
    where: { teamId, ...(params.status ? { status: params.status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(params.limit ?? 50, 200),
  });
}

export async function outboxHealth(teamId: string) {
  const [failed, pending, lastDelivered] = await Promise.all([
    prisma.outboundEvent.count({ where: { teamId, status: 'FAILED' } }),
    prisma.outboundEvent.count({ where: { teamId, status: 'PENDING' } }),
    prisma.outboundEvent.findFirst({ where: { teamId, status: 'DELIVERED' }, orderBy: { deliveredAt: 'desc' }, select: { deliveredAt: true } }),
  ]);
  return { failed, pending, lastDeliveredAt: lastDelivered?.deliveredAt ?? null };
}
