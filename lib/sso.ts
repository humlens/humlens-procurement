import crypto from 'crypto';

// Moving between Humlens apps without signing in again. The app you're in
// signs a short-lived ticket naming you and the app you're going to; that
// app checks it and signs in *its own* account with the same email. No
// accounts are created this way — each app still decides who has access.
//
// Needs HUMLENS_SSO_SECRET (the same value in every app) and the apps'
// addresses in NEXT_PUBLIC_HUMLENS_{INVENTORY,PROCUREMENT,COMMERCE}_URL.

export type HumlensApp = 'inventory' | 'procurement' | 'commerce';

export const THIS_APP: HumlensApp = 'procurement';

export const APP_LABELS: Record<HumlensApp, string> = {
  inventory: 'Inventory',
  procurement: 'Procurement',
  commerce: 'Store admin',
};

export const appUrls: Record<HumlensApp, string | undefined> = {
  inventory: process.env.NEXT_PUBLIC_HUMLENS_INVENTORY_URL,
  procurement: process.env.NEXT_PUBLIC_HUMLENS_PROCUREMENT_URL,
  commerce: process.env.NEXT_PUBLIC_HUMLENS_COMMERCE_URL,
};

// Where each app accepts a ticket.
const RECEIVE_PATH: Record<HumlensApp, string> = {
  inventory: '/api/auth/sso',
  procurement: '/api/auth/sso',
  commerce: '/api/sso/receive',
};

const TICKET_SECONDS = 60;

type Ticket = { email: string; name?: string | null; aud: HumlensApp; iss: HumlensApp; exp: number; nonce: string; next?: string };

const secret = () => {
  const value = process.env.HUMLENS_SSO_SECRET;
  if (!value || value.length < 32) throw new Error('Set HUMLENS_SSO_SECRET (32+ characters, the same in every Humlens app).');
  return value;
};

const sign = (body: string) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export const ssoConfigured = () => Boolean(process.env.HUMLENS_SSO_SECRET);

// Only paths inside the receiving app — never another site.
export const safeNext = (next: unknown) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next.slice(0, 500) : undefined);

export function handoffUrl(user: { email: string; name?: string | null }, to: HumlensApp, next?: string) {
  const base = appUrls[to]?.replace(/\/+$/, '');
  if (!base) throw new Error(`${APP_LABELS[to]} isn't set up (NEXT_PUBLIC_HUMLENS_${to.toUpperCase()}_URL).`);
  const ticket: Ticket = {
    email: user.email,
    name: user.name,
    aud: to,
    iss: THIS_APP,
    exp: Math.floor(Date.now() / 1000) + TICKET_SECONDS,
    nonce: crypto.randomBytes(12).toString('base64url'),
    next: safeNext(next),
  };
  const body = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `${base}${RECEIVE_PATH[to]}?ticket=${body}.${sign(body)}`;
}

// Tickets already used, until they'd have expired anyway (per server process).
const used = new Map<string, number>();

export function verifyTicket(raw: unknown): Ticket {
  if (typeof raw !== 'string' || !raw.includes('.')) throw new Error('Missing sign-in ticket.');
  const [body, signature] = raw.split('.') as [string, string];
  const expected = sign(body);
  if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new Error('This sign-in link isn’t valid.');
  }
  const ticket = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Ticket;
  const now = Math.floor(Date.now() / 1000);
  if (ticket.aud !== THIS_APP) throw new Error('This sign-in link is for another app.');
  if (ticket.exp < now) throw new Error('This sign-in link has expired. Try again from the other app.');
  for (const [nonce, exp] of used) if (exp < now) used.delete(nonce);
  if (used.has(ticket.nonce)) throw new Error('This sign-in link was already used.');
  used.set(ticket.nonce, ticket.exp);
  return ticket;
}
