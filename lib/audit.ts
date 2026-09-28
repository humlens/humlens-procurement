import type { NextApiRequest, NextApiResponse } from 'next';
import type { AuditSource } from '@prisma/client';

import { prisma } from '@/lib/prisma';

export type AuditActor = { id: string; name?: string | null; email?: string | null };

export type AuditEvent = { resource: string; action: string };

type AuditEntry = AuditEvent & {
  teamId: string;
  actor: AuditActor;
  source?: AuditSource;
  targetId?: string | null;
  targetLabel?: string | null;
  ipAddress?: string | null;
};

// Writes one audit entry. A failed write is logged, never thrown — the
// action it describes has already happened and must not be reported as failed.
export async function recordAudit(entry: AuditEntry) {
  const { actor, ...rest } = entry;
  await prisma.auditLog
    .create({
      data: {
        ...rest,
        actorId: actor.id,
        actorName: actor.name || actor.email || 'Unknown user',
      },
    })
    .catch((error) => console.error('Audit log write failed', error));
}

// Per-response label overrides, for routes whose permission check doesn't
// describe what they do (e.g. API keys are guarded by `team:update`). `null`
// skips the entry, for POSTs that don't change anything.
const eventOverrides = new WeakMap<NextApiResponse, AuditEvent | null>();

export function setAuditEvent(res: NextApiResponse, event: AuditEvent | null) {
  eventOverrides.set(res, event);
}

const LABEL_FIELDS = ['name', 'title', 'poNumber', 'invoiceNumber', 'number', 'sku', 'reference', 'email'] as const;

// Picks the affected record's id and a human label out of a `{ data }`
// response body, so entries read "Created item Blue widget" without every
// route having to say so.
function describeTarget(body: unknown): { id: string | null; label: string | null } {
  const data = (body as { data?: unknown } | undefined)?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { id: null, label: null };

  const record = data as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  const labelField = LABEL_FIELDS.find((field) => typeof record[field] === 'string' && record[field]);
  return { id, label: labelField ? (record[labelField] as string).slice(0, 200) : null };
}

export function clientIp(req: NextApiRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || null;
}

// Called by the API guards: for a mutating request, records one entry once
// the response has been sent with a success status. Reads and failed or
// denied requests are not logged.
export function auditOnSuccess(
  req: NextApiRequest,
  res: NextApiResponse,
  entry: AuditEvent & { teamId: string; actor: AuditActor; source?: AuditSource }
) {
  if (!req.method || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;

  let body: unknown;
  const json = res.json.bind(res);
  res.json = (payload: unknown) => {
    body = payload;
    return json(payload);
  };

  res.once('finish', () => {
    if (res.statusCode >= 400) return;

    const override = eventOverrides.get(res);
    if (override === null) return;

    const target = describeTarget(body);
    void recordAudit({
      ...entry,
      ...override,
      targetId: (req.query.id as string | undefined) ?? target.id,
      targetLabel: target.label,
      ipAddress: clientIp(req),
    });
  });
}
