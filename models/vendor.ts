import { prisma } from '@/lib/prisma';
import { isGoodCondition } from '@/lib/receiving';
import { VendorStatus } from '@prisma/client';

export const listVendors = async (teamId: string, params?: { status?: VendorStatus; search?: string }) => {
  return prisma.vendor.findMany({
    where: {
      teamId,
      status: params?.status,
      name: params?.search ? { contains: params.search, mode: 'insensitive' } : undefined,
    },
    include: { category: true, _count: { select: { purchaseOrders: true, contracts: true } } },
    orderBy: { name: 'asc' },
  });
};

export const getVendor = async (teamId: string, id: string) => {
  return prisma.vendor.findFirstOrThrow({
    where: { id, teamId },
    include: {
      category: true,
      contacts: true,
      performanceReviews: { orderBy: { createdAt: 'desc' }, take: 10 },
      contracts: { orderBy: { createdAt: 'desc' } },
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
};

export const createVendor = async (params: {
  teamId: string;
  createdById: string;
  name: string;
  legalName?: string;
  categoryId?: string;
  taxId?: string;
  website?: string;
  email?: string;
  phone?: string;
  paymentTerms?: string;
  preferredCurrency?: string;
  status?: VendorStatus;
}) => {
  return prisma.vendor.create({ data: params });
};

export const updateVendor = async (teamId: string, id: string, data: Record<string, unknown>) => {
  await prisma.vendor.findFirstOrThrow({ where: { id, teamId } });
  return prisma.vendor.update({ where: { id }, data });
};

export const setVendorStatus = async (teamId: string, id: string, status: VendorStatus) => {
  await prisma.vendor.findFirstOrThrow({ where: { id, teamId } });
  return prisma.vendor.update({ where: { id }, data: { status } });
};

export const addVendorPerformanceReview = async (params: {
  teamId: string;
  vendorId: string;
  score: number;
  onTimeRate?: number;
  qualityRate?: number;
  comment?: string;
}) => {
  const review = await prisma.vendorPerformanceReview.create({ data: params });
  await refreshVendorRating(params.vendorId);
  return review;
};

const refreshVendorRating = async (vendorId: string) => {
  const reviews = await prisma.vendorPerformanceReview.findMany({ where: { vendorId }, select: { score: true } });
  if (!reviews.length) return;
  const avg = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;
  await prisma.vendor.update({ where: { id: vendorId }, data: { rating: avg } });
};

// Automatic reviews start with this, so each month's is updated in place rather than added again.
export const AUTOMATIC_REVIEW = 'Automatic scorecard';
const SCORECARD_DAYS = 180;

// The vendor's record from what actually happened over the last 180 days of
// orders: how much of what was ordered arrived, how much of it arrived in good
// condition, how much came on time, and how many invoices passed the
// three-way match. Kept as one automatic review per vendor per month, next to
// the reviews people write, and counted in the vendor's rating.
//
// On time: of the POs with a promised delivery date, the share whose receipt
// that completed the order (every line received in full) was on or before
// the end of that day (UTC). An order still not complete counts as late once
// the day has passed, and isn't counted before. No promised dates, no rate.
export const refreshVendorScorecard = async (teamId: string, vendorId: string) => {
  const since = new Date(Date.now() - SCORECARD_DAYS * 86_400_000);
  const orders = await prisma.purchaseOrder.findMany({
    where: { teamId, vendorId, issuedAt: { gte: since }, status: { in: ['ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'] } },
    select: {
      status: true,
      issuedAt: true,
      expectedDeliveryDate: true,
      lineItems: { select: { id: true, quantity: true, receivedQty: true } },
      goodsReceipts: {
        select: { receivedAt: true, lineItems: { select: { poLineItemId: true, quantityReceived: true, condition: true } } },
        orderBy: { receivedAt: 'asc' },
      },
      invoices: { where: { matchStatus: { not: null } }, select: { matchStatus: true } },
    },
  });
  // Issued orders with nothing received yet only count towards on-time.
  const delivering = orders.filter((order) => order.status !== 'ISSUED');
  if (!delivering.length) return null;

  let ordered = 0;
  let delivered = 0;
  let received = 0;
  let good = 0;
  let invoices = 0;
  let matched = 0;
  const leadDays: number[] = [];
  for (const order of delivering) {
    for (const line of order.lineItems) {
      ordered += Number(line.quantity);
      delivered += Math.min(Number(line.receivedQty), Number(line.quantity));
    }
    for (const receipt of order.goodsReceipts) {
      for (const line of receipt.lineItems) {
        const quantity = Number(line.quantityReceived);
        received += quantity;
        if (isGoodCondition(line.condition)) good += quantity;
      }
    }
    const first = order.goodsReceipts[0];
    if (first && order.issuedAt) leadDays.push((first.receivedAt.getTime() - order.issuedAt.getTime()) / 86_400_000);
    invoices += order.invoices.length;
    matched += order.invoices.filter((invoice) => invoice.matchStatus === '3-way match passed').length;
  }

  let dated = 0;
  let onTime = 0;
  for (const order of orders) {
    if (!order.expectedDeliveryDate) continue;
    const deadline = order.expectedDeliveryDate.getTime() + 86_400_000;
    const completedAt = orderCompletedAt(order);
    if (!completedAt && Date.now() < deadline) continue;
    dated += 1;
    if (completedAt && completedAt.getTime() < deadline) onTime += 1;
  }

  const fillRate = ordered ? delivered / ordered : null;
  const qualityRate = received ? good / received : null;
  const onTimeRate = dated ? onTime / dated : null;
  const matchRate = invoices ? matched / invoices : null;
  const parts = [
    [fillRate, 0.3],
    [qualityRate, 0.3],
    [onTimeRate, 0.25],
    [matchRate, 0.15],
  ].filter((part): part is [number, number] => part[0] !== null);
  if (!parts.length) return null;
  const weight = parts.reduce((sum, [, w]) => sum + w, 0);
  const score = Math.round((5 * parts.reduce((sum, [rate, w]) => sum + rate * w, 0)) / weight * 10) / 10;

  const percent = (rate: number | null) => (rate === null ? 'n/a' : `${Math.round(rate * 100)}%`);
  const averageLead = leadDays.length ? Math.round(leadDays.reduce((sum, days) => sum + days, 0) / leadDays.length) : null;
  const measures = [
    `${percent(fillRate)} of ordered units delivered`,
    `${percent(qualityRate)} in good condition`,
    dated ? `${onTime} of ${dated} order${dated === 1 ? '' : 's'} with a promised date delivered on time` : null,
    invoices ? `${matched} of ${invoices} invoices matched the PO and delivery` : 'no invoices matched yet',
  ];
  const extras = [
    averageLead === null ? null : `${averageLead} day${averageLead === 1 ? '' : 's'} on average from PO to first delivery`,
    await returnsSummary(teamId, vendorId, since),
  ];
  const comment =
    `${AUTOMATIC_REVIEW} from ${delivering.length} order${delivering.length === 1 ? '' : 's'} in the last ${SCORECARD_DAYS} days: ` +
    measures.filter(Boolean).join(', ') +
    extras
      .filter(Boolean)
      .map((extra) => `; ${extra}`)
      .join('') +
    '.';

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const existing = await prisma.vendorPerformanceReview.findFirst({
    where: { teamId, vendorId, createdAt: { gte: monthStart }, comment: { startsWith: AUTOMATIC_REVIEW } },
  });
  const data = { score, qualityRate, onTimeRate, comment };
  const review = existing
    ? await prisma.vendorPerformanceReview.update({ where: { id: existing.id }, data })
    : await prisma.vendorPerformanceReview.create({ data: { teamId, vendorId, ...data } });
  await refreshVendorRating(vendorId);
  return review;
};

// When the order was complete: the receipt that brought every line up to its
// ordered quantity (damaged units included, as for the PO's own status).
const orderCompletedAt = (order: {
  lineItems: { id: string; quantity: unknown }[];
  goodsReceipts: { receivedAt: Date; lineItems: { poLineItemId: string; quantityReceived: unknown }[] }[];
}) => {
  const got = new Map<string, number>();
  for (const receipt of order.goodsReceipts) {
    for (const line of receipt.lineItems) got.set(line.poLineItemId, (got.get(line.poLineItemId) ?? 0) + Number(line.quantityReceived));
    if (order.lineItems.every((line) => (got.get(line.id) ?? 0) >= Number(line.quantity))) return receipt.receivedAt;
  }
  return null;
};

// Returns to vendor raised in the window, for the scorecard's comment: how
// many, what was credited, and how many are still open.
const returnsSummary = async (teamId: string, vendorId: string, since: Date) => {
  const returns = await prisma.vendorReturn.findMany({
    where: { teamId, vendorId, createdAt: { gte: since }, status: { not: 'CANCELLED' } },
    select: { status: true, currency: true, creditAmount: true },
  });
  if (!returns.length) return null;
  const credited = new Map<string, number>();
  for (const item of returns) {
    if (item.status === 'CREDITED') credited.set(item.currency, (credited.get(item.currency) ?? 0) + Number(item.creditAmount ?? 0));
  }
  const open = returns.filter((item) => item.status !== 'CREDITED').length;
  const details = [
    ...[...credited].map(([currency, amount]) => `${currency} ${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} credited`),
    open ? `${open} awaiting credit` : null,
  ].filter(Boolean);
  return `${returns.length} return${returns.length === 1 ? '' : 's'} to vendor (${details.join(', ')})`;
};
