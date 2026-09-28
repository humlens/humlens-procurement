import crypto from 'crypto';
import type { PunchoutCatalog } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { decryptSecret } from '@/lib/secrets';
import { appUrl } from '@/lib/accounting/oauth';
import { createRequisition } from 'models/requisition';

import { parseOrderMessage, parseSetupResponse, setupRequest, type CartItem, type Credentials } from './cxml';
import { isOciForm, parseOciForm, startUrl as ociStartUrl } from './oci';

// A PunchOut shopping trip: open the supplier's catalog signed in as this
// team, then turn the cart they post back into requisition lines — added to
// the draft the requester started from, or a new draft requisition.

export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const readSecret = (catalog: PunchoutCatalog) => {
  if (!catalog.secret) return '';
  try {
    return decryptSecret(catalog.secret);
  } catch {
    throw new ApiError(422, 'This catalog’s password can’t be read any more. Enter it again on the vendor’s page.');
  }
};

export function cxmlCredentials(catalog: PunchoutCatalog): Credentials {
  if (!catalog.fromIdentity || !catalog.toIdentity) throw new ApiError(422, 'Set the From and To identities for this catalog on the vendor’s page.');
  return {
    fromDomain: catalog.fromDomain,
    fromIdentity: catalog.fromIdentity,
    toDomain: catalog.toDomain,
    toIdentity: catalog.toIdentity,
    senderIdentity: catalog.senderIdentity || catalog.fromIdentity,
    sharedSecret: readSecret(catalog),
  };
}

export const returnUrl = (token: string) => `${appUrl()}/api/punchout/return/${token}`;

/** Opens a catalog: returns the address to send the requester's browser to. */
export async function startPunchout(params: { teamId: string; catalogId: string; user: { id: string; name?: string | null; email: string }; requisitionId?: string }) {
  const catalog = await prisma.punchoutCatalog.findFirst({
    where: { id: params.catalogId, teamId: params.teamId },
    include: { vendor: { select: { status: true, name: true } } },
  });
  if (!catalog || !catalog.enabled) throw new ApiError(404, 'This supplier catalog isn’t available.');
  if (catalog.vendor.status === 'BLOCKED') throw new ApiError(400, `${catalog.vendor.name} is blocked, so its catalog can’t be opened.`);

  if (params.requisitionId) {
    const requisition = await prisma.purchaseRequisition.findFirst({ where: { id: params.requisitionId, teamId: params.teamId }, select: { status: true } });
    if (requisition?.status !== 'DRAFT') throw new ApiError(400, 'Catalog items can only be added to a draft requisition.');
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const session = await prisma.punchoutSession.create({
    data: { teamId: params.teamId, catalogId: catalog.id, userId: params.user.id, token, requisitionId: params.requisitionId },
  });

  try {
    let url: string;
    if (catalog.protocol === 'OCI') {
      url = ociStartUrl({ setupUrl: catalog.setupUrl, username: catalog.username, password: readSecret(catalog), hookUrl: returnUrl(token) });
    } else {
      const body = setupRequest({ credentials: cxmlCredentials(catalog), buyerCookie: session.id, returnUrl: returnUrl(token), setupUrl: catalog.setupUrl, user: params.user });
      let res: Response;
      try {
        res = await fetch(catalog.setupUrl, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body, signal: AbortSignal.timeout(20_000) });
      } catch (error) {
        throw new ApiError(502, `Couldn’t reach the supplier (${error instanceof Error ? error.message : 'network error'}).`);
      }
      const answer = await res.text();
      try {
        url = parseSetupResponse(answer).startUrl;
      } catch (error) {
        throw new ApiError(502, error instanceof Error ? error.message : 'The supplier’s answer couldn’t be read.');
      }
    }
    await prisma.punchoutCatalog.update({ where: { id: catalog.id }, data: { lastError: null } });
    return { url, sessionId: session.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Opening the catalog failed.';
    await prisma.punchoutSession.update({ where: { id: session.id }, data: { status: 'FAILED', error: message.slice(0, 500) } });
    await prisma.punchoutCatalog.update({ where: { id: catalog.id }, data: { lastError: message.slice(0, 500) } });
    throw error;
  }
}

/** Reads the cart out of whatever the supplier posted: raw cXML, cXML in a form field, or OCI fields. */
export function parseCart(body: string, contentType: string, buyerCookie: string): CartItem[] {
  const type = contentType.toLowerCase();
  let xml: string | null = null;
  if (type.includes('xml') || body.trimStart().startsWith('<')) {
    xml = body;
  } else {
    const fields = new URLSearchParams(body);
    const encoded = fields.get('cxml-urlencoded') ?? fields.get('cXML-urlencoded');
    const base64 = fields.get('cxml-base64') ?? fields.get('cXML-base64');
    if (encoded) xml = encoded;
    else if (base64) xml = Buffer.from(base64, 'base64').toString('utf8');
    else if (isOciForm(fields)) return parseOciForm(fields);
    else throw new ApiError(400, 'The supplier sent back no cart.');
  }
  const message = parseOrderMessage(xml);
  if (message.buyerCookie && message.buyerCookie !== buyerCookie) throw new ApiError(400, 'This cart belongs to a different shopping session.');
  return message.items;
}

/** Turns a returned cart into requisition lines. Returns where to send the requester next. */
export async function completePunchout(token: string, body: string, contentType: string) {
  const session = await prisma.punchoutSession.findUnique({
    where: { token },
    include: { catalog: { include: { vendor: { select: { id: true, name: true } } } }, team: { select: { slug: true, currency: true } } },
  });
  if (!session) throw new ApiError(404, 'This shopping session doesn’t exist.');
  const back = { slug: session.team.slug, requisitionId: session.requisitionId };
  if (session.status !== 'STARTED') throw new ApiError(409, 'This cart was already brought back.');
  if (Date.now() - session.createdAt.getTime() > SESSION_TTL_MS) {
    await prisma.punchoutSession.update({ where: { id: session.id }, data: { status: 'FAILED', error: 'Expired' } });
    throw new ApiError(410, 'This shopping session expired. Open the catalog again.');
  }

  let items: CartItem[];
  try {
    items = parseCart(body, contentType, session.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The cart couldn’t be read.';
    await prisma.punchoutSession.update({ where: { id: session.id }, data: { status: 'FAILED', error: message.slice(0, 500) } });
    throw error instanceof ApiError ? error : new ApiError(400, message);
  }

  // An empty cart means they left without buying: nothing to add.
  if (!items.length) {
    await prisma.punchoutSession.update({ where: { id: session.id }, data: { status: 'RETURNED', returnedAt: new Date() } });
    return { ...back, added: 0 };
  }

  const lines = items.map((item) => ({
    sku: item.supplierPartId ?? undefined,
    description: item.description.slice(0, 500),
    quantity: item.quantity,
    unit: item.unit ?? undefined,
    estimatedPrice: Math.round(item.unitPrice * 100) / 100,
    suggestedVendorId: session.catalog.vendor.id,
  }));

  let requisitionId = session.requisitionId;
  const draft = requisitionId
    ? await prisma.purchaseRequisition.findFirst({ where: { id: requisitionId, teamId: session.teamId, status: 'DRAFT' } })
    : null;

  if (draft) {
    await prisma.$transaction(async (tx) => {
      await tx.requisitionLineItem.createMany({ data: lines.map((line) => ({ ...line, requisitionId: draft.id })) });
      const all = await tx.requisitionLineItem.findMany({ where: { requisitionId: draft.id } });
      const total = all.reduce((sum, line) => sum + Number(line.quantity) * Number(line.estimatedPrice), 0);
      await tx.purchaseRequisition.update({ where: { id: draft.id }, data: { totalAmount: total } });
    });
  } else {
    const created = await createRequisition({
      teamId: session.teamId,
      requesterId: session.userId,
      title: `${session.catalog.vendor.name} catalog order`,
      justification: `Items chosen in ${session.catalog.vendor.name}’s PunchOut catalog.`,
      currency: items.find((item) => item.currency)?.currency ?? session.team.currency,
      lineItems: lines,
    });
    requisitionId = created.id;
  }

  await prisma.punchoutSession.update({
    where: { id: session.id },
    data: { status: 'RETURNED', returnedAt: new Date(), itemCount: items.length, requisitionId },
  });
  return { slug: session.team.slug, requisitionId, added: items.length };
}
