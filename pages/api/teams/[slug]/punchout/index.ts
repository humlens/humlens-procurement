import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { prisma } from '@/lib/prisma';

// GET: the supplier catalogs requesters can shop, for the "Shop a catalog" menu.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).end();
    const member = await guardTeamAccess(req, res, 'requisition', 'create');
    const catalogs = await prisma.punchoutCatalog.findMany({
      where: { teamId: member.teamId, enabled: true, vendor: { status: { not: 'BLOCKED' } } },
      select: { id: true, protocol: true, vendor: { select: { id: true, name: true } } },
      orderBy: { vendor: { name: 'asc' } },
    });
    res.status(200).json({ data: catalogs.map((c) => ({ id: c.id, protocol: c.protocol, vendorId: c.vendor.id, vendorName: c.vendor.name })) });
  } catch (error) {
    handleApiError(res, error);
  }
}
