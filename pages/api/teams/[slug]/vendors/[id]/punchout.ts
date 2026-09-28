import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { ApiError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/secrets';
import { returnUrl } from '@/lib/punchout/sessions';
import { validateWithSchema } from '@/lib/zod';

const httpUrl = z
  .string()
  .trim()
  .url('Enter a full address, e.g. https://supplier.example.com/punchout.')
  .max(1000)
  .refine((value) => /^https?:\/\//i.test(value), 'Use an http(s) address.');

const schema = z.object({
  protocol: z.enum(['CXML', 'OCI']),
  setupUrl: httpUrl,
  fromDomain: z.string().trim().max(100).default('NetworkID'),
  fromIdentity: z.string().trim().max(200).optional(),
  toDomain: z.string().trim().max(100).default('NetworkID'),
  toIdentity: z.string().trim().max(200).optional(),
  senderIdentity: z.string().trim().max(200).optional(),
  username: z.string().trim().max(200).optional(),
  /** Blank keeps the saved one. */
  secret: z.string().max(500).optional(),
  orderUrl: z.union([httpUrl, z.literal('')]).optional(),
  sendOrders: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

// A vendor's PunchOut catalog. GET (anyone who can see vendors), PUT to set it
// up, DELETE to remove it. The password/shared secret is never sent back.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const vendorId = req.query.id as string;

    if (req.method === 'GET') {
      const member = await guardTeamAccess(req, res, 'vendor', 'read');
      const catalog = await prisma.punchoutCatalog.findFirst({ where: { vendorId, teamId: member.teamId } });
      const lastSession = catalog
        ? await prisma.punchoutSession.findFirst({ where: { catalogId: catalog.id }, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true, itemCount: true, error: true } })
        : null;
      res.status(200).json({
        data: {
          catalog: catalog ? { ...catalog, secret: undefined, hasSecret: Boolean(catalog.secret) } : null,
          lastSession,
          // What to give the supplier: they whitelist where carts come back to.
          returnUrlExample: returnUrl('…'),
        },
      });
      return;
    }

    if (req.method === 'PUT') {
      const member = await guardTeamAccess(req, res, 'vendor', 'update');
      setAuditEvent(res, { resource: 'punchout_catalog', action: 'update' });
      const body = validateWithSchema(schema, req.body);
      const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, teamId: member.teamId }, select: { id: true } });
      if (!vendor) throw new ApiError(404, 'Vendor not found.');
      if (body.protocol === 'CXML' && (!body.fromIdentity || !body.toIdentity)) {
        throw new ApiError(422, 'cXML needs the From identity (you, as the supplier knows you) and the To identity (the supplier).');
      }
      if (body.sendOrders && (body.protocol !== 'CXML' || !body.orderUrl)) {
        throw new ApiError(422, 'Sending orders needs cXML and the supplier’s order address.');
      }

      const existing = await prisma.punchoutCatalog.findUnique({ where: { vendorId } });
      const data = {
        protocol: body.protocol,
        setupUrl: body.setupUrl,
        fromDomain: body.fromDomain || 'NetworkID',
        fromIdentity: body.fromIdentity || null,
        toDomain: body.toDomain || 'NetworkID',
        toIdentity: body.toIdentity || null,
        senderIdentity: body.senderIdentity || null,
        username: body.username || null,
        secret: body.secret ? encryptSecret(body.secret) : existing?.secret ?? null,
        orderUrl: body.orderUrl || null,
        sendOrders: body.sendOrders,
        enabled: body.enabled,
      };
      const catalog = await prisma.punchoutCatalog.upsert({
        where: { vendorId },
        create: { teamId: member.teamId, vendorId, ...data },
        update: data,
      });
      res.status(200).json({ data: { ...catalog, secret: undefined, hasSecret: Boolean(catalog.secret) } });
      return;
    }

    if (req.method === 'DELETE') {
      const member = await guardTeamAccess(req, res, 'vendor', 'update');
      setAuditEvent(res, { resource: 'punchout_catalog', action: 'delete' });
      await prisma.punchoutCatalog.deleteMany({ where: { vendorId, teamId: member.teamId } });
      res.status(204).end();
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
