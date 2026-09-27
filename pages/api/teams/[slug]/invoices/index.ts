import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listInvoices, createInvoice, getInvoice } from 'models/invoice';
import { runInvoiceMatchAgent } from '@/lib/ai/agents/invoiceMatchAgent';
import { validateWithSchema, createInvoiceSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'invoice', 'read');
      res.status(200).json({ data: await listInvoices(teamMember.teamId, { status: req.query.status as any }) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'invoice', 'create');
      const params = validateWithSchema(createInvoiceSchema, req.body);
      const invoice = await createInvoice({
        teamId: teamMember.teamId,
        vendorId: params.vendorId,
        poId: params.poId,
        invoiceNumber: params.invoiceNumber,
        currency: params.currency,
        tax: params.tax,
        dueDate: params.dueDate ? new Date(params.dueDate) : undefined,
        issuedDate: params.issuedDate ? new Date(params.issuedDate) : undefined,
        documentUrl: params.documentUrl || undefined,
        lineItems: params.lineItems,
      });

      // If this invoice is linked to a PO, let the matching agent take a
      // first pass immediately — same reasoning as requisition submit: never
      // let an agent failure block creation of the record itself.
      if (invoice.poId) {
        try {
          await runInvoiceMatchAgent(teamMember.teamId, invoice.id);
        } catch (agentError) {
          // eslint-disable-next-line no-console
          console.error('invoice match agent failed', agentError);
        }
      }

      res.status(201).json({ data: await getInvoice(teamMember.teamId, invoice.id) });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
