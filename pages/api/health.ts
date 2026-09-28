import type { NextApiRequest, NextApiResponse } from 'next';

import { prisma } from '@/lib/prisma';

// Liveness and readiness for container health checks and load balancers.
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
}
