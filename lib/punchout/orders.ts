import type { OutboundEvent } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ConnectionError } from '@/lib/connections';
import { enqueue } from '@/lib/outbox';

import { orderRequest, parseXml, responseStatus } from './cxml';
import { cxmlCredentials } from './sessions';

// Issued POs to vendors whose PunchOut catalog has "send orders" on go to the
// supplier as a cXML OrderRequest, through the outbox so they're retried.

export async function queueSupplierOrder(teamId: string, poId: string) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, teamId },
    select: { id: true, vendor: { select: { punchoutCatalog: { select: { protocol: true, orderUrl: true, sendOrders: true, enabled: true } } } } },
  });
  const catalog = po?.vendor.punchoutCatalog;
  if (!po || !catalog?.enabled || !catalog.sendOrders || catalog.protocol !== 'CXML' || !catalog.orderUrl) return null;
  return enqueue({ teamId, target: 'SUPPLIER', kind: 'supplier.order', reference: `supplier:order:${po.id}`, payload: { data: { poId: po.id } } });
}

export async function deliverSupplierOrder(event: OutboundEvent) {
  const { poId } = (event.payload as { data: { poId: string } }).data;
  const po = await prisma.purchaseOrder.findFirstOrThrow({
    where: { id: poId, teamId: event.teamId },
    include: { lineItems: true, team: { select: { name: true } }, vendor: { include: { punchoutCatalog: true } } },
  });
  const catalog = po.vendor.punchoutCatalog;
  if (!catalog?.orderUrl) throw new ConnectionError(`${po.vendor.name} has no PunchOut order address any more.`, false);

  const body = orderRequest({
    credentials: cxmlCredentials(catalog),
    orderId: po.poNumber,
    orderDate: po.issuedAt ?? new Date(),
    currency: po.currency,
    total: Number(po.totalAmount),
    billToName: po.team.name,
    shipTo: po.shippingAddress,
    comments: po.notes,
    deliveryDate: po.expectedDeliveryDate,
    lines: po.lineItems.map((line, index) => ({
      lineNumber: index + 1,
      supplierPartId: line.sku,
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      unit: line.unit,
    })),
  });

  let res: Response;
  try {
    res = await fetch(catalog.orderUrl, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new ConnectionError(`Couldn’t reach ${po.vendor.name} (${error instanceof Error ? error.message : 'network error'}).`, true);
  }
  const answer = await res.text();
  let status: { ok: boolean; code: number; message: string };
  try {
    status = responseStatus(parseXml(answer));
  } catch {
    status = { ok: false, code: res.status, message: 'unreadable answer' };
  }
  if (!res.ok || !status.ok) {
    const message = `${po.vendor.name} refused the order (${status.code || res.status}${status.message ? `: ${status.message}` : ''}).`;
    await prisma.punchoutCatalog.update({ where: { id: catalog.id }, data: { lastError: message.slice(0, 500) } });
    throw new ConnectionError(message, res.status >= 500 || status.code >= 500, res.status);
  }
  await prisma.punchoutCatalog.update({ where: { id: catalog.id }, data: { lastError: null } });
}
