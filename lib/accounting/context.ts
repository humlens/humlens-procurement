import type { requestJson } from './http';
import { AccountingSetupError, type AccountingOptions, type Credentials, type Line } from './types';

// What an adapter gets: the stored credentials and settings, and a request
// function that already signs each call (refreshing an expired OAuth token first).
export type AdapterContext = {
  credentials: Credentials;
  options?: AccountingOptions;
  request: <T>(url: string, init?: Parameters<typeof requestJson>[2]) => Promise<{ data: T; headers: Headers }>;
};

/** Tax and shipping become their own lines so the total matches this app's record exactly. */
export const withExtras = (lines: Line[], extras: { tax?: number; shipping?: number }) => {
  const out = [...lines];
  if (extras.shipping && extras.shipping > 0) out.push({ description: 'Shipping', quantity: 1, unitPrice: extras.shipping, amount: extras.shipping });
  if (extras.tax && extras.tax > 0) out.push({ description: 'Tax', quantity: 1, unitPrice: extras.tax, amount: extras.tax });
  return out;
};

export const requireOption = <K extends keyof AccountingOptions>(options: AccountingOptions, key: K, label: string): NonNullable<AccountingOptions[K]> => {
  const value = options[key];
  if (!value) throw new AccountingSetupError(`Choose ${label} in Settings → Integrations → Accounting, then retry.`);
  return value as NonNullable<AccountingOptions[K]>;
};
