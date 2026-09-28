import crypto from 'crypto';

// Encrypts secrets stored in the database (other apps' API keys, webhook
// signing keys) with AES-256-GCM. The key comes from CONNECTIONS_SECRET,
// falling back to NEXTAUTH_SECRET so development works without extra setup.
// Changing it makes stored secrets unreadable: connections must be re-entered.

const keyMaterial = () => {
  const secret = process.env.CONNECTIONS_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Set CONNECTIONS_SECRET (or NEXTAUTH_SECRET) to store connection secrets.');
  return crypto.createHash('sha256').update(secret).digest();
};

export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(stored: string) {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable stored secret.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// Shown in settings so a saved key can be recognised without revealing it.
export const maskSecret = (plain: string) => (plain.length <= 8 ? '••••' : `${plain.slice(0, 5)}••••${plain.slice(-4)}`);

// Signs notifications to a store: `sha256=<hex>` over "<timestamp>.<body>".
export const signPayload = (secret: string, timestamp: string, body: string) =>
  `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
