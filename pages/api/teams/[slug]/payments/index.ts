import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listPayments, schedulePayment } from 'models/payment';
import { validateWithSchema, createPaymentSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'payment', 'read');
      res.status(200).json({ data: await listPayments(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'payment', 'create');
      const params = validateWithSchema(createPaymentSchema, req.body);
      const payment = await schedulePayment({
        teamId: teamMember.teamId,
        vendorId: params.vendorId,
        invoiceId: params.invoiceId,
        amount: params.amount,
        currency: params.currency,
        method: params.method,
        scheduledFor: params.scheduledFor ? new Date(params.scheduledFor) : undefined,
        reference: params.reference,
      });
      res.status(201).json({ data: payment });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
