import type { AccountingRecordKind, OutboundEvent } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { markConnection } from '@/lib/connections';
import { enqueue } from '@/lib/outbox';
import { recordPayment } from 'models/payment';

import { withExtras } from './context';
import { getAccountingAdapter, getAccountingConnection, isSignedIn } from './index';
import { AccountingError, PROVIDER_NAMES, type AccountingAdapter, type AccountingOptions, type Line } from './types';

// Purchase orders, bills and payments go to the accounting system as they're
// issued, approved and paid here — through the outbox, so an outage or an
// expired sign-in only delays them. Every record created there is linked
// (AccountingLink), so a retry never creates it twice. Vendors are created
// on first use. Bills paid there come back as payments here.

type SyncRecord = { record: AccountingRecordKind; id: string };

const toggles: Partial<{ [K in AccountingRecordKind]: keyof AccountingOptions }> = {
  PURCHASE_ORDER: 'syncPurchaseOrders',
  BILL: 'syncBills',
  PAYMENT: 'syncPayments',
};

const eventKinds: { [K in AccountingRecordKind]: string } = {
  VENDOR: 'accounting.vendor',
  PURCHASE_ORDER: 'accounting.purchase-order',
  BILL: 'accounting.bill',
  PAYMENT: 'accounting.payment',
};

/** Queues a record for the accounting system when one is connected and that kind of record is switched on. */
export async function queueAccountingSync(teamId: string, record: AccountingRecordKind, id: string, opts: { force?: boolean } = {}) {
  const connection = await getAccountingConnection(teamId);
  if (!connection || !isSignedIn(connection.credentials)) return null;
  // Sage's API has no purchase orders.
  if (record === 'PURCHASE_ORDER' && connection.credentials.provider === 'SAGE') return null;
  const toggle = toggles[record];
  if (!opts.force && toggle && !connection.options[toggle]) return null;
  if (await linkFor(teamId, record, id)) return null;
  return enqueue({
    teamId,
    target: 'ACCOUNTING',
    kind: eventKinds[record],
    reference: `accounting:${record.toLowerCase()}:${id}`,
    payload: { data: { record, id } satisfies SyncRecord },
  });
}

const linkFor = (teamId: string, kind: AccountingRecordKind, localId: string) =>
  prisma.accountingLink.findUnique({ where: { teamId_kind_localId: { teamId, kind, localId } } });

async function link(teamId: string, provider: string, kind: AccountingRecordKind, localId: string, created: { id: string; number?: string }) {
  return prisma.accountingLink.upsert({
    where: { teamId_kind_localId: { teamId, kind, localId } },
    create: { teamId, provider, kind, localId, externalId: created.id, externalNumber: created.number ?? null },
    update: { provider, externalId: created.id, externalNumber: created.number ?? null, syncedAt: new Date() },
  });
}

const num = (value: unknown) => Number(value ?? 0);

// One sync at a time per team: a payment makes sure its bill exists first,
// so a bill and its payment syncing at once could otherwise both create the
// bill (and both create the vendor). The link check inside keeps it idempotent.
const running = new Map<string, Promise<void>>();

async function oneAtATime<T>(teamId: string, work: () => Promise<T>): Promise<T> {
  const previous = running.get(teamId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => mine);
  running.set(teamId, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (running.get(teamId) === tail) running.delete(teamId);
  }
}

/** Delivers one queued record. Called by the outbox; throws to retry. */
export const deliverAccountingEvent = (event: OutboundEvent) => oneAtATime(event.teamId, () => deliverOne(event));

async function deliverOne(event: OutboundEvent) {
  const found = await getAccountingAdapter(event.teamId);
  if (!found) throw new AccountingError('No accounting system is connected. Connect one in Settings → Integrations.', false);
  const { connection, adapter } = found;
  const { record, id } = (event.payload as { data: SyncRecord }).data;
  try {
    await syncRecord(event.teamId, adapter, connection.options, connection.credentials.provider, record, id);
    await markConnection(connection.id, null);
  } catch (error) {
    await markConnection(connection.id, error instanceof Error ? error.message : 'Sync failed.');
    throw error;
  }
}

async function syncRecord(teamId: string, adapter: AccountingAdapter, options: AccountingOptions, provider: string, record: AccountingRecordKind, id: string): Promise<string> {
  const existing = await linkFor(teamId, record, id);
  if (existing) return existing.externalId;

  switch (record) {
    case 'VENDOR': {
      const vendor = await prisma.vendor.findFirstOrThrow({ where: { id, teamId } });
      const created = await adapter.createVendor({ ...vendor, currency: vendor.preferredCurrency });
      return (await link(teamId, provider, 'VENDOR', id, created)).externalId;
    }

    case 'PURCHASE_ORDER': {
      if (!adapter.createPurchaseOrder) return 'unsupported';
      const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id, teamId }, include: { lineItems: true } });
      const vendorExternalId = await syncRecord(teamId, adapter, options, provider, 'VENDOR', po.vendorId);
      const lines: Line[] = po.lineItems.map((line) => ({
        description: line.description,
        quantity: num(line.quantity),
        unitPrice: num(line.unitPrice),
        amount: num(line.quantity) * num(line.unitPrice),
      }));
      const created = await adapter.createPurchaseOrder(
        {
          id: po.id,
          number: po.poNumber,
          date: po.issuedAt ?? po.approvedAt ?? po.createdAt,
          currency: po.currency,
          vendorExternalId,
          memo: po.notes,
          deliveryDate: po.expectedDeliveryDate,
          lines: withExtras(lines, { tax: num(po.tax), shipping: num(po.shipping) }),
        },
        options
      );
      return (await link(teamId, provider, 'PURCHASE_ORDER', id, created)).externalId;
    }

    case 'BILL': {
      const invoice = await prisma.invoice.findFirstOrThrow({
        where: { id, teamId },
        include: { lineItems: true, purchaseOrder: { select: { poNumber: true } } },
      });
      const vendorExternalId = await syncRecord(teamId, adapter, options, provider, 'VENDOR', invoice.vendorId);
      const lines: Line[] = invoice.lineItems.map((line) => ({
        description: line.description,
        quantity: num(line.quantity),
        unitPrice: num(line.unitPrice),
        amount: num(line.amount),
      }));
      // An invoice entered as a total only still needs one line.
      const billLines = lines.length ? lines : [{ description: `Invoice ${invoice.invoiceNumber}`, quantity: 1, unitPrice: num(invoice.subtotal), amount: num(invoice.subtotal) }];
      const created = await adapter.createBill(
        {
          id: invoice.id,
          number: invoice.invoiceNumber,
          date: invoice.issuedDate ?? invoice.createdAt,
          dueDate: invoice.dueDate,
          currency: invoice.currency,
          vendorExternalId,
          lines: withExtras(billLines, { tax: num(invoice.tax) }),
          total: num(invoice.totalAmount),
          poNumber: invoice.purchaseOrder?.poNumber,
        },
        options
      );
      return (await link(teamId, provider, 'BILL', id, created)).externalId;
    }

    case 'PAYMENT': {
      const payment = await prisma.payment.findFirstOrThrow({ where: { id, teamId } });
      if (!payment.invoiceId) throw new AccountingError('Only payments against an invoice can be sent to the accounting system.', false);
      const vendorExternalId = await syncRecord(teamId, adapter, options, provider, 'VENDOR', payment.vendorId);
      const billExternalId = await syncRecord(teamId, adapter, options, provider, 'BILL', payment.invoiceId);
      const created = await adapter.createPayment(
        {
          id: payment.id,
          date: payment.paidAt ?? new Date(),
          amount: num(payment.amount),
          currency: payment.currency,
          vendorExternalId,
          billExternalId,
          reference: payment.reference,
        },
        options
      );
      return (await link(teamId, provider, 'PAYMENT', id, created)).externalId;
    }
  }
}

/** Queues everything already approved that isn't in the accounting system yet (for the first sync). */
export async function queueBackfill(teamId: string) {
  const connection = await getAccountingConnection(teamId);
  if (!connection || !isSignedIn(connection.credentials)) throw new AccountingError('Connect an accounting system first.', false);
  const linked = async (kind: AccountingRecordKind) =>
    new Set((await prisma.accountingLink.findMany({ where: { teamId, kind }, select: { localId: true } })).map((row) => row.localId));

  const [pos, invoices, payments, poLinks, billLinks, paymentLinks] = await Promise.all([
    connection.options.syncPurchaseOrders
      ? prisma.purchaseOrder.findMany({ where: { teamId, status: { in: ['ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED'] } }, select: { id: true }, take: 500 })
      : [],
    connection.options.syncBills
      ? prisma.invoice.findMany({ where: { teamId, status: { in: ['APPROVED', 'PAID'] } }, select: { id: true }, take: 500 })
      : [],
    connection.options.syncPayments
      ? prisma.payment.findMany({ where: { teamId, status: 'PAID', invoiceId: { not: null } }, select: { id: true }, take: 500 })
      : [],
    linked('PURCHASE_ORDER'),
    linked('BILL'),
    linked('PAYMENT'),
  ]);

  let queued = 0;
  const queue = async (record: AccountingRecordKind, ids: { id: string }[], done: Set<string>) => {
    for (const { id } of ids) if (!done.has(id) && (await queueAccountingSync(teamId, record, id))) queued += 1;
  };
  await queue('PURCHASE_ORDER', pos, poLinks);
  await queue('BILL', invoices, billLinks);
  await queue('PAYMENT', payments, paymentLinks);
  return queued;
}

/**
 * Bills paid in the accounting system become paid invoices here (with a
 * payment recorded against them), for teams that switched it on.
 */
export async function pullPaidBills(limitPerTeam = 50) {
  const connections = await prisma.connection.findMany({ where: { kind: 'ACCOUNTING' }, select: { teamId: true } });
  let marked = 0;
  for (const { teamId } of connections) {
    const found = await getAccountingAdapter(teamId);
    if (!found?.connection.options.pullPayments) continue;
    const { connection, adapter } = found;

    const bills = await prisma.accountingLink.findMany({ where: { teamId, kind: 'BILL' }, orderBy: { syncedAt: 'asc' } });
    const open = await prisma.invoice.findMany({
      where: { teamId, id: { in: bills.map((b) => b.localId) }, status: { in: ['APPROVED', 'MATCHED'] } },
      select: { id: true, vendorId: true, totalAmount: true, currency: true },
      take: limitPerTeam,
    });
    const externalIds = new Map(bills.map((b) => [b.localId, b.externalId]));

    for (const invoice of open) {
      try {
        const status = await adapter.billStatus(externalIds.get(invoice.id)!);
        if (!status.paid) continue;
        const payment = await recordPayment({
          teamId,
          vendorId: invoice.vendorId,
          invoiceId: invoice.id,
          amount: Number(invoice.totalAmount),
          currency: invoice.currency,
          method: `Paid in ${PROVIDER_NAMES[connection.credentials.provider]}`,
        });
        // It came from there: never send it back.
        await link(teamId, connection.credentials.provider, 'PAYMENT', payment.id, { id: `from:${externalIds.get(invoice.id)}` });
        marked += 1;
      } catch (error) {
        await markConnection(connection.id, error instanceof Error ? error.message : 'Checking paid bills failed.');
        break;
      }
    }
  }
  return marked;
}
