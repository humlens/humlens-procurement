import { InvoiceStatus } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { applyMatchResult, runThreeWayMatch } from 'models/invoice';
import { defineAction } from './types';

const input = z.object({ invoiceId: z.string().min(1), tolerancePct: z.number().min(0).max(100) });
type Input = z.infer<typeof input>;
type Result = {
  matched: boolean;
  mismatches: number;
  setStatus: InvoiceStatus;
  previous: { status: InvoiceStatus; matchStatus: string | null; matchNotes: string | null };
};

async function findInvoice(teamId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, teamId },
    select: { id: true, invoiceNumber: true, status: true, matchStatus: true, matchNotes: true },
  });
  if (!invoice) throw new ApiError(404, 'That invoice is not in this team.');
  return invoice;
}

// Runs the three-way match (PO × goods received × invoice) and records the
// outcome on the invoice. A clean match still needs a person to approve the
// invoice for payment; this only saves them checking the numbers.
export const applyInvoiceMatch = defineAction<Input, Result>({
  name: 'invoice.applyMatch',
  label: 'Match an invoice',
  resource: 'invoice',
  permission: 'match',
  input,
  async describe(teamId, params) {
    const invoice = await findInvoice(teamId, params.invoiceId);
    return `Three-way match invoice ${invoice.invoiceNumber} (tolerance ${params.tolerancePct}%)`;
  },
  async apply(ctx, params) {
    const invoice = await findInvoice(ctx.teamId, params.invoiceId);
    const result = await runThreeWayMatch(ctx.teamId, params.invoiceId, params.tolerancePct);
    const updated = await applyMatchResult(ctx.teamId, params.invoiceId, result);
    return {
      matched: result.matched,
      mismatches: result.mismatches.length,
      setStatus: updated.status,
      previous: { status: invoice.status, matchStatus: invoice.matchStatus, matchNotes: invoice.matchNotes },
    };
  },
  // Restores the invoice's earlier status, unless someone has moved it on
  // (approved, disputed, paid) since the match.
  async revert(ctx, result, params) {
    const invoice = await findInvoice(ctx.teamId, params.invoiceId);
    if (invoice.status !== result.setStatus) {
      throw new ApiError(409, `Invoice ${invoice.invoiceNumber} is now ${invoice.status.toLowerCase()}, so the match wasn't undone.`);
    }
    await prisma.invoice.update({ where: { id: invoice.id }, data: result.previous });
  },
  link: (params) => `invoices/${params.invoiceId}`,
});
