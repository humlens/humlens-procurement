import type { NextApiRequest, NextApiResponse } from 'next';
import { encode } from 'next-auth/jwt';

import { authOptions } from '@/lib/nextAuth';
import { verifyTicket } from '@/lib/sso';
import { getUserByEmail } from 'models/user';

// GET /api/auth/sso?ticket=… — arriving from another Humlens app: sign in
// this app's account with the same email, if there is one. (Takes precedence
// over NextAuth's catch-all route.)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const fail = (message: string) => res.redirect(302, `/auth/login?sso=${encodeURIComponent(message)}`);

  let ticket;
  try {
    ticket = verifyTicket(req.query.ticket);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Sign-in link not valid.');
  }

  const user = await getUserByEmail(ticket.email);
  if (!user || user.disabled) return fail(`There’s no account for ${ticket.email} here. Ask an admin to invite you, or sign in with another account.`);

  const maxAge = authOptions.session?.maxAge ?? 30 * 24 * 60 * 60;
  const token = await encode({
    token: { sub: user.id, id: user.id, name: user.name, email: user.email, picture: user.image },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge,
  });
  const cookie = authOptions.cookies!.sessionToken!;
  const options = cookie.options as { secure?: boolean };
  res.setHeader(
    'Set-Cookie',
    `${cookie.name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${options.secure ? '; Secure' : ''}`
  );
  res.redirect(302, ticket.next ?? '/');
}
