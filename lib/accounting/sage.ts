import type { AdapterContext } from './context';
import { requireOption } from './context';
import { isoDate, round2 } from './http';
import type { AccountingAdapter, Line } from './types';

// Sage Accounting (Business Cloud) API v3.1. It has no purchase orders in its
// API, so only vendors, bills (purchase invoices) and payments sync.
// https://developer.sage.com/accounting/reference/purchases/

const BASE = 'https://api.accounting.sage.com/v3.1';

type Page<T> = { $items: T[] };
type Item = { id: string; displayed_as: string; nominal_code?: number | string };

export function sage(ctx: AdapterContext): AccountingAdapter {
  const headers: Record<string, string> = ctx.credentials.companyId ? { 'X-Business': ctx.credentials.companyId } : {};
  const get = <T>(path: string) => ctx.request<T>(`${BASE}${path}`, { headers }).then((r) => r.data);
  const post = <T>(path: string, body: unknown) => ctx.request<T>(`${BASE}${path}`, { method: 'POST', headers, body }).then((r) => r.data);
  const invoiceLines = (lines: Line[], ledgerAccountId: string, taxRateId?: string) =>
    lines.map((line) => ({
      description: line.description.slice(0, 200),
      ledger_account_id: ledgerAccountId,
      quantity: line.quantity,
      unit_price: round2(line.unitPrice),
      ...(taxRateId ? { tax_rate_id: taxRateId } : {}),
    }));

  return {
    async companyName() {
      const data = await get<{ name: string }>(ctx.credentials.companyId ? `/businesses/${ctx.credentials.companyId}` : '/business');
      return data.name;
    },
    async expenseAccounts() {
      const data = await get<Page<Item>>('/ledger_accounts?visible_in=purchasing&items_per_page=200');
      return data.$items.map((a) => ({ id: a.id, name: a.displayed_as, code: a.nominal_code ? String(a.nominal_code) : undefined }));
    },
    async bankAccounts() {
      const data = await get<Page<Item>>('/bank_accounts?items_per_page=200');
      return data.$items.map((a) => ({ id: a.id, name: a.displayed_as }));
    },

    async createVendor(vendor) {
      const found = await get<Page<{ id: string; name?: string; displayed_as: string }>>(
        `/contacts?contact_type_id=VENDOR&search=${encodeURIComponent(vendor.name)}&attributes=name`
      );
      const match = found.$items.find((c) => (c.name ?? c.displayed_as).toLowerCase() === vendor.name.toLowerCase());
      if (match) return { id: match.id };
      const data = await post<{ id: string }>('/contacts', {
        contact: {
          name: vendor.name.slice(0, 100),
          contact_type_ids: ['VENDOR'],
          ...(vendor.email ? { email: vendor.email } : {}),
          ...(vendor.taxId ? { tax_number: vendor.taxId } : {}),
          ...(vendor.addressLine1
            ? { main_address: { address_line_1: vendor.addressLine1, city: vendor.city, region: vendor.state, postal_code: vendor.postalCode } }
            : {}),
        },
      });
      return { id: data.id };
    },

    createPurchaseOrder: null,

    async createBill(bill, options) {
      const account = requireOption(options, 'expenseAccountId', 'a ledger account');
      const data = await post<{ id: string; displayed_as?: string }>('/purchase_invoices', {
        purchase_invoice: {
          contact_id: bill.vendorExternalId,
          date: isoDate(bill.date),
          due_date: isoDate(bill.dueDate ?? bill.date),
          vendor_reference: bill.number.slice(0, 25),
          ...(bill.poNumber ? { reference: bill.poNumber.slice(0, 25) } : {}),
          invoice_lines: invoiceLines(bill.lines, account, options.taxRateId),
        },
      });
      return { id: data.id, number: data.displayed_as };
    },

    async createPayment(payment, options) {
      const bank = requireOption(options, 'paymentAccountId', 'the bank account payments come from');
      const data = await post<{ id: string }>('/contact_payments', {
        contact_payment: {
          transaction_type_id: 'VENDOR_PAYMENT',
          contact_id: payment.vendorExternalId,
          bank_account_id: bank,
          date: isoDate(payment.date),
          total_amount: round2(payment.amount),
          ...(payment.reference ? { reference: payment.reference.slice(0, 25) } : {}),
          allocated_artefacts: [{ artefact_id: payment.billExternalId, amount: round2(payment.amount) }],
        },
      });
      return { id: data.id };
    },

    async billStatus(id) {
      const data = await get<{ outstanding_amount: string | number; status?: { id: string } }>(`/purchase_invoices/${id}`);
      const due = Number(data.outstanding_amount);
      return { paid: data.status?.id === 'PAID' || due <= 0, amountDue: due };
    },
  };
}
