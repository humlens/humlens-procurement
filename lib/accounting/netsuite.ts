import crypto from 'crypto';

import type { AdapterContext } from './context';
import { requireOption } from './context';
import { isoDate, round2 } from './http';
import type { AccountingAdapter, Credentials, Line } from './types';

// NetSuite REST web services with token-based authentication (OAuth 1.0a,
// HMAC-SHA256). Records post to the expense sublist, so no items are needed.
// https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_1540391670.html

/** "1234567_SB1" → host "1234567-sb1", realm "1234567_SB1". */
export const netsuiteHost = (accountId: string) => `https://${accountId.trim().toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com`;
const realm = (accountId: string) => accountId.trim().toUpperCase().replace(/-/g, '_');

const enc = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The OAuth 1.0a Authorization header for one request. Exported for tests. */
export function oauthHeader(credentials: Credentials, method: string, url: string, nonce = crypto.randomBytes(16).toString('hex'), timestamp = String(Math.floor(Date.now() / 1000))) {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey ?? '',
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_token: credentials.tokenId ?? '',
    oauth_version: '1.0',
  };
  const params = [...u.searchParams.entries(), ...Object.entries(oauth)]
    .map(([k, v]) => [enc(k), enc(v)])
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(params)].join('&');
  const key = `${enc(credentials.consumerSecret ?? '')}&${enc(credentials.tokenSecret ?? '')}`;
  const signature = crypto.createHmac('sha256', key).update(base).digest('base64');
  const fields = { realm: realm(credentials.companyId ?? ''), ...oauth, oauth_signature: signature };
  return `OAuth ${Object.entries(fields)
    .map(([k, v]) => `${k}="${enc(v)}"`)
    .join(', ')}`;
}

const quote = (value: string) => value.replace(/'/g, "''");

export function netsuite(ctx: AdapterContext): AccountingAdapter {
  const host = netsuiteHost(ctx.credentials.companyId ?? '');
  const call = <T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => {
    const url = `${host}/services/rest${path}`;
    return ctx.request<T>(url, { method, body, headers: { Authorization: oauthHeader(ctx.credentials, method, url), ...extra } });
  };
  const suiteql = async <T>(q: string) => {
    const { data } = await call<{ items: T[] }>('POST', '/query/v1/suiteql?limit=1000', { q }, { Prefer: 'transient' });
    return data.items ?? [];
  };
  // Creating a record answers 204 with the new record's address in Location.
  const create = async (record: string, body: unknown) => {
    const { headers } = await call('POST', `/record/v1/${record}`, body);
    const id = headers.get('location')?.split('/').pop();
    if (!id) throw new Error(`NetSuite didn't return the new ${record}'s ID.`);
    return id;
  };
  const expense = (lines: Line[], accountId: string) => ({
    items: lines.map((line) => ({ account: { id: accountId }, amount: round2(line.amount), memo: line.description.slice(0, 999) })),
  });
  const accounts = async (types: string) => {
    const rows = await suiteql<{ id: string; acctnumber?: string; fullname: string }>(
      `SELECT id, acctnumber, fullname FROM account WHERE accttype IN (${types}) AND isinactive = 'F'`
    );
    return rows.map((row) => ({ id: String(row.id), code: row.acctnumber ?? undefined, name: row.fullname }));
  };

  return {
    async companyName() {
      await suiteql('SELECT id FROM account WHERE ROWNUM <= 1');
      return `NetSuite account ${realm(ctx.credentials.companyId ?? '')}`;
    },
    expenseAccounts: () => accounts("'Expense', 'COGS', 'OthExpense'"),
    bankAccounts: () => accounts("'Bank', 'CredCard'"),

    async createVendor(vendor) {
      const [existing] = await suiteql<{ id: string }>(`SELECT id FROM vendor WHERE companyname = '${quote(vendor.name)}'`);
      if (existing) return { id: String(existing.id) };
      const id = await create('vendor', {
        companyName: vendor.name.slice(0, 83),
        isPerson: false,
        ...(vendor.email ? { email: vendor.email } : {}),
        ...(vendor.phone ? { phone: vendor.phone } : {}),
        ...(vendor.taxId ? { defaultTaxReg: vendor.taxId } : {}),
        ...(ctx.options?.subsidiaryId ? { subsidiary: { id: ctx.options.subsidiaryId } } : {}),
      });
      return { id };
    },

    async createPurchaseOrder(po, options) {
      const account = requireOption(options, 'expenseAccountId', 'an expense account');
      const id = await create('purchaseOrder', {
        entity: { id: po.vendorExternalId },
        tranDate: isoDate(po.date),
        memo: `Humlens Procurement ${po.number}`.slice(0, 999),
        expense: expense(po.lines, account),
      });
      return { id, number: po.number };
    },

    async createBill(bill, options) {
      const account = requireOption(options, 'expenseAccountId', 'an expense account');
      const id = await create('vendorBill', {
        entity: { id: bill.vendorExternalId },
        tranId: bill.number.slice(0, 45),
        tranDate: isoDate(bill.date),
        ...(bill.dueDate ? { dueDate: isoDate(bill.dueDate) } : {}),
        ...(bill.poNumber ? { memo: `PO ${bill.poNumber}` } : {}),
        expense: expense(bill.lines, account),
      });
      return { id, number: bill.number };
    },

    async createPayment(payment, options) {
      const bank = requireOption(options, 'paymentAccountId', 'the account payments come from');
      // Transforming the bill fills in the vendor and applies the payment to it.
      const { headers } = await call('POST', `/record/v1/vendorBill/${payment.billExternalId}/!transform/vendorPayment`, {
        account: { id: bank },
        tranDate: isoDate(payment.date),
        ...(payment.reference ? { memo: payment.reference.slice(0, 999) } : {}),
        apply: { items: [{ doc: { id: payment.billExternalId }, apply: true, amount: round2(payment.amount) }] },
      });
      const id = headers.get('location')?.split('/').pop();
      if (!id) throw new Error("NetSuite didn't return the payment's ID.");
      return { id };
    },

    async billStatus(id) {
      const [row] = await suiteql<{ foreignamountunpaid: string | number | null }>(
        `SELECT foreignamountunpaid FROM transaction WHERE id = ${Number(id)}`
      );
      const due = Number(row?.foreignamountunpaid ?? 0);
      return { paid: due <= 0, amountDue: due };
    },
  };
}
