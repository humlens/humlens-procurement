import { getServerSession } from 'next-auth/next';
import type { NextApiRequest, NextApiResponse } from 'next';

import { authOptions } from '@/lib/nextAuth';

export async function getSession(req: NextApiRequest, res: NextApiResponse) {
  return getServerSession(req, res, authOptions);
}
