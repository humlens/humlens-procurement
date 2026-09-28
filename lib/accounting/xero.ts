import type { AdapterContext } from './context';
import { requireOption } from './context';
import { isoDate, round2 } from './http';
import type { AccountingAdapter, Line } from './types';

// Xero Accounting API. Bills are ACCPAY invoices; lines are posted as
// "NoTax" with tax as its own line, so totals match this app exactly.
// https://developer.xero.com/documentation/api/accounting/invoices

const BASE = 'https://api.xero.com/api.xro/2.0';
const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function xero(ctx: AdapterContext): AccountingAdapter {
  const headers = { 'xero-tenant-id': ctx.credentials.companyId ?? '' };
  const get = <T>(path: string) => ctx.request<T>(`${BASE}${path}`, { headers }).then((r) => r.data);
  const send = <T>(method: 'POST' | 'PUT', path: string, body: unknown) => ctx.request<T>(`${BASE}${path}`, { method, headers, body }).then((r) => r.data);
  const lineItems = (lines: Line[], accountCode: string) =>
    lines.map((line) => ({ Description: line.description.slice(0, 4000), Quantity: line.quantity, UnitAmount: round2(line.unitPrice), AccountCode: accountCode }));
  type Acc = { AccountID: string; Code?: string; Name: string };

  return {
    async companyName() {
      const data = await get<{ Organisations: { Name: string }[] }>('/Organisation');
      return data.Organisations[0]?.Name ?? 'Xero organisation';
    },
    async expenseAccounts() {
      // Line items reference accounts by code, so accounts without one can't be used.
      const data = await get<{ Accounts: Acc[] }>(`/Accounts?where=${encodeURIComponent('Class=="EXPENSE" AND Status=="ACTIVE"')}`);
      return data.Accounts.filter((a) => a.Code).map((a) => ({ id: a.Code!, code: a.Code, name: a.Name }));
    },
    async bankAccounts() {
      const data = await get<{ Accounts: Acc[] }>(`/Accounts?where=${encodeURIComponent('Type=="BANK" AND Status=="ACTIVE"')}`);
      return data.Accounts.map((a) => ({ id: a.AccountID, code: a.Code, name: a.Name }));
    },

    async createVendor(vendor) {
      const found = await get<{ Contacts: { ContactID: string }[] }>(`/Contacts?where=${encodeURIComponent(`Name=="${quote(vendor.name)}"`)}`);
      if (found.Contacts[0]) return { id: found.Contacts[0].ContactID };
      const data = await send<{ Contacts: { ContactID: string }[] }>('POST', '/Contacts', {
        Contacts: [
          {
            Name: vendor.name.slice(0, 255),
            ...(vendor.email ? { EmailAddress: vendor.email } : {}),
            ...(vendor.taxId ? { TaxNumber: vendor.taxId } : {}),
            ...(vendor.phone ? { Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: vendor.phone }] } : {}),
            ...(vendor.addressLine1
              ? {
                  Addresses: [
                    {
                      AddressType: 'POBOX',
                      AddressLine1: vendor.addressLine1,
                      City: vendor.city ?? undefined,
                      Region: vendor.state ?? undefined,
                      PostalCode: vendor.postalCode ?? undefined,
                      Country: vendor.country ?? undefined,
                    },
                  ],
                }
              : {}),
          },
        ],
      });
      return { id: data.Contacts[0].ContactID };
    },

    async createPurchaseOrder(po, options) {
      const account = requireOption(options, 'expenseAccountId', 'an expense account');
      const data = await send<{ PurchaseOrders: { PurchaseOrderID: string; PurchaseOrderNumber?: string }[] }>('POST', '/PurchaseOrders', {
        PurchaseOrders: [
          {
            Contact: { ContactID: po.vendorExternalId },
            Date: isoDate(po.date),
            PurchaseOrderNumber: po.number,
            Reference: 'Humlens Procurement',
            CurrencyCode: po.currency,
            Status: 'AUTHORISED',
            LineAmountTypes: 'NoTax',
            LineItems: lineItems(po.lines, account),
          },
        ],
      });
      return { id: data.PurchaseOrders[0].PurchaseOrderID, number: data.PurchaseOrders[0].PurchaseOrderNumber };
    },

    async createBill(bill, options) {
      const account = requireOption(options, 'expenseAccountId', 'an expense account');
      const data = await send<{ Invoices: { InvoiceID: string; InvoiceNumber?: string }[] }>('POST', '/Invoices', {
        Invoices: [
          {
            Type: 'ACCPAY',
            Contact: { ContactID: bill.vendorExternalId },
            InvoiceNumber: bill.number,
            ...(bill.poNumber ? { Reference: bill.poNumber } : {}),
            Date: isoDate(bill.date),
            // Xero needs a due date to approve a bill.
            DueDate: isoDate(bill.dueDate ?? bill.date),
            CurrencyCode: bill.currency,
            Status: 'AUTHORISED',
            LineAmountTypes: 'NoTax',
            LineItems: lineItems(bill.lines, account),
          },
        ],
      });
      return { id: data.Invoices[0].InvoiceID, number: data.Invoices[0].InvoiceNumber };
    },

    async createPayment(payment, options) {
      const bank = requireOption(options, 'paymentAccountId', 'the account payments come from');
      const data = await send<{ Payments: { PaymentID: string }[] }>('PUT', '/Payments', {
        Payments: [
          {
            Invoice: { InvoiceID: payment.billExternalId },
            Account: { AccountID: bank },
            Date: isoDate(payment.date),
            Amount: round2(payment.amount),
            ...(payment.reference ? { Reference: payment.reference } : {}),
          },
        ],
      });
      return { id: data.Payments[0].PaymentID };
    },

    async billStatus(id) {
      const data = await get<{ Invoices: { Status: string; AmountDue: number }[] }>(`/Invoices/${id}`);
      const invoice = data.Invoices[0];
      return { paid: invoice.Status === 'PAID' || Number(invoice.AmountDue) <= 0, amountDue: Number(invoice.AmountDue) };
    },
  };
}
