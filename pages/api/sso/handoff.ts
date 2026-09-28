import type { NextApiRequest, NextApiResponse } from 'next';

import { getSession } from '@/lib/session';
import { APP_LABELS, THIS_APP, handoffUrl, safeNext, type HumlensApp } from '@/lib/sso';

// GET /api/sso/handoff?to=procurement&next=/path — open another Humlens app
// signed in as the same person.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const to = req.query.to as HumlensApp;
  if (!(to in APP_LABELS) || to === THIS_APP) return res.status(400).json({ error: { message: 'Unknown app.' } });

  const session = await getSession(req, res);
  if (!session?.user?.email) return res.redirect(302, '/auth/login');

  try {
    res.redirect(302, handoffUrl({ email: session.user.email, name: session.user.name }, to, safeNext(req.query.next)));
  } catch (error) {
    res.status(503).json({ error: { message: error instanceof Error ? error.message : 'Not available.' } });
  }
}
