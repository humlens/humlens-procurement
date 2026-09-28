import type { CartItem } from './cxml';

// SAP OCI (Open Catalog Interface) 4.0/5.0: the catalog is opened with a
// plain URL carrying the login and our HOOK_URL, and the cart comes back as
// NEW_ITEM-<FIELD>[n] form fields posted to that hook.

export function startUrl(params: { setupUrl: string; username?: string | null; password?: string | null; hookUrl: string }) {
  const url = new URL(params.setupUrl);
  if (params.username) url.searchParams.set('USERNAME', params.username);
  if (params.password) url.searchParams.set('PASSWORD', params.password);
  url.searchParams.set('HOOK_URL', params.hookUrl);
  url.searchParams.set('~OkCode', 'ADDI');
  url.searchParams.set('~TARGET', '_top');
  url.searchParams.set('~CALLER', 'CTLG');
  url.searchParams.set('returntarget', '_top');
  return url.toString();
}

/** True when a posted form looks like an OCI cart. */
export const isOciForm = (fields: URLSearchParams) => [...fields.keys()].some((key) => key.toUpperCase().startsWith('NEW_ITEM-'));

export function parseOciForm(fields: URLSearchParams): CartItem[] {
  // Keys look like NEW_ITEM-DESCRIPTION[1]; group them by the index.
  const rows = new Map<string, Record<string, string>>();
  for (const [key, value] of fields) {
    const match = /^NEW_ITEM-([A-Z_]+)\[(\d+)\]$/i.exec(key);
    if (!match) continue;
    const [, field, index] = match;
    const row = rows.get(index) ?? {};
    row[field.toUpperCase()] = value;
    rows.set(index, row);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, row]) => {
      // PRICE is per PRICEUNIT units (e.g. 12.00 per 100).
      const priceUnit = Number(row.PRICEUNIT || 1) || 1;
      return {
        supplierPartId: row.VENDORMAT || row.MANUFACTMAT || row.EXT_PRODUCT_ID || null,
        description: row.DESCRIPTION || row.LONGTEXT?.slice(0, 200) || row.VENDORMAT || 'Catalog item',
        quantity: Number(row.QUANTITY || 1) || 1,
        unitPrice: (Number(row.PRICE || 0) || 0) / priceUnit,
        currency: row.CURRENCY || null,
        unit: row.UNIT || null,
      };
    })
    .filter((item) => item.quantity > 0);
}
