import type { NextApiRequest, NextApiResponse } from 'next';

import { ApiError } from '@/lib/errors';
import { escapeXml } from '@/lib/punchout/cxml';
import { completePunchout } from '@/lib/punchout/sessions';

// The supplier's site posts the cart here when the requester checks out
// (cXML PunchOutOrderMessage or OCI fields). No sign-in: the one-time token
// in the address is the proof. Then the requester's browser lands on the
// requisition with the items added.

export const config = { api: { bodyParser: false } };

const MAX_BODY = 5 * 1024 * 1024;

async function readBody(req: NextApiRequest) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new ApiError(413, 'The cart is too large.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const page = (title: string, message: string, href?: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(title)}</title>` +
  `<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem}main{max-width:28rem;background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem}a{color:#4f46e5}</style></head>` +
  `<body><main><h1 style="font-size:1.25rem">${escapeXml(title)}</h1><p>${escapeXml(message)}</p>${href ? `<p><a href="${escapeXml(href)}">Back to Humlens Procurement</a></p>` : ''}</main></body></html>`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();
  try {
    // OCI catalogs may send the cart as a GET query string.
    const body = req.method === 'GET' ? new URL(req.url ?? '', 'http://x').searchParams.toString() : await readBody(req);
    const contentType = req.method === 'GET' ? 'application/x-www-form-urlencoded' : req.headers['content-type'] ?? '';
    const result = await completePunchout(req.query.token as string, body, contentType);
    const target = result.requisitionId
      ? `/teams/${result.slug}/requisitions/${result.requisitionId}?punchout=${result.added}`
      : `/teams/${result.slug}/requisitions?punchout=0`;
    res.redirect(303, target);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'The cart couldn’t be added.';
    res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('The cart couldn’t be added', message, '/'));
  }
}
