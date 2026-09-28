import type { AdapterContext } from './context';
import { requireOption } from './context';
import { isoDate, round2 } from './http';
import type { Account, AccountingAdapter, Line } from './types';

// QuickBooks Online Accounting API v3. Lines post to one expense account
// (AccountBasedExpenseLineDetail), so no QuickBooks items are needed.
// https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill

const MINOR_VERSION = '75';
const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function quickbooks(ctx: AdapterContext): AccountingAdapter {
  const realm = ctx.credentials.companyId;
  const host = ctx.credentials.sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
  const url = (path: string, query: Record<string, string> = {}) => {
    const u = new URL(`${host}/v3/company/${realm}/${path}`);
    u.searchParams.set('minorversion', MINOR_VERSION);
    for (const [key, value] of Object.entries(query)) u.searchParams.set(key, value);
    return u.toString();
  };
  const query = async <T>(entity: string, sql: string) => {
    const { data } = await ctx.request<{ QueryResponse: Record<string, T[] | undefined> }>(url('query', { query: sql }));
    return data.QueryResponse[entity] ?? [];
  };
  const accounts = async (types: string) => {
    const rows = await query<{ Id: string; Name: string; AcctNum?: string }>(
      'Account',
      `select Id, Name, AcctNum from Account where AccountType in (${types}) and Active = true maxresults 1000`
    );
    return rows.map<Account>((row) => ({ id: row.Id, name: row.Name, code: row.AcctNum }));
  };
  const lines = (items: Line[], accountId: string) =>
    items.map((line) => ({
      Amount: round2(line.amount),
      Description: line.description.slice(0, 4000),
      DetailType: 'AccountBasedExpenseLineDetail',
      AccountBasedExpenseLineDetail: { AccountRef: { value: accountId } },
    }));
  // DocNumber holds at most 21 characters.
  const docNumber = (value: string) => value.slice(0, 21);

  return {
    async companyName() {
      const { data } = await ctx.request<{ CompanyInfo: { CompanyName: string } }>(url(`companyinfo/${realm}`));
      return data.CompanyInfo.CompanyName;
    },
    expenseAccounts: () => accounts("'Expense', 'Cost of Goods Sold', 'Other Expense'"),
    bankAccounts: () => accounts("'Bank', 'Credit Card'"),

    async createVendor(vendor) {
      const name = vendor.name.slice(0, 500);
      const [existing] = await query<{ Id: string }>('Vendor', `select Id from Vendor where DisplayName = '${quote(name)}'`);
      if (existing) return { id: existing.Id };
      const { data } = await ctx.request<{ Vendor: { Id: string } }>(url('vendor'), {
        method: 'POST',
        body: {
          DisplayName: name,
          CompanyName: vendor.legalName || vendor.name,
          ...(vendor.email ? { PrimaryEmailAddr: { Address: vendor.email } } : {}),
          ...(vendor.phone ? { PrimaryPhone: { FreeFormNumber: vendor.phone } } : {}),
          ...(vendor.addressLine1
            ? {
                BillAddr: {
                  Line1: vendor.addressLine1,
                  City: vendor.city ?? undefined,
                  CountrySubDivisionCode: vendor.state ?? undefined,
                  PostalCode: vendor.postalCode ?? undefined,
                  Country: vendor.country ?? undefined,
                },
              }
            : {}),
        },
      });
      return { id: data.Vendor.Id };
    },

    async createPurchaseOrder(po, options) {
      const account = requireOption(options, 'expenseAccountId', 'an expense account');
      const { data } = await ctx.request<{ PurchaseOrder: { Id: string; DocNumber?: string } }>(url('purchaseorder'), {
        method: 'POST',
        body: {
          VendorRef: { value: po.vendorExternalId },
          TxnDate: isoDate(po.date),
          DocNumber: docNumber(po.number),
          PrivateNote: po.memo?.slice(0, 4000) || `Humlens Procurement ${po.number}`,
          Line: lines(po.lines, account),
        },
      });
      return { id: data.PurchaseOrder.Id, number: data.PurchaseOrder.DocNumber };
    },

    async createBill(bill, options) {
      const account = requireOption(options, 'expenseAccountId', 'an expense account');
      const { data } = await ctx.request<{ Bill: { Id: string; DocNumber?: string } }>(url('bill'), {
        method: 'POST',
        body: {
          VendorRef: { value: bill.vendorExternalId },
          TxnDate: isoDate(bill.date),
          ...(bill.dueDate ? { DueDate: isoDate(bill.dueDate) } : {}),
          DocNumber: docNumber(bill.number),
          PrivateNote: bill.poNumber ? `PO ${bill.poNumber}` : undefined,
          Line: lines(bill.lines, account),
        },
      });
      return { id: data.Bill.Id, number: data.Bill.DocNumber };
    },

    async createPayment(payment, options) {
      const bank = requireOption(options, 'paymentAccountId', 'the account payments come from');
      const { data } = await ctx.request<{ BillPayment: { Id: string } }>(url('billpayment'), {
        method: 'POST',
        body: {
          VendorRef: { value: payment.vendorExternalId },
          PayType: 'Check',
          CheckPayment: { BankAccountRef: { value: bank } },
          TotalAmt: round2(payment.amount),
          TxnDate: isoDate(payment.date),
          ...(payment.reference ? { PrivateNote: payment.reference } : {}),
          Line: [{ Amount: round2(payment.amount), LinkedTxn: [{ TxnId: payment.billExternalId, TxnType: 'Bill' }] }],
        },
      });
      return { id: data.BillPayment.Id };
    },

    async billStatus(id) {
      const { data } = await ctx.request<{ Bill: { Balance: number } }>(url(`bill/${id}`));
      return { paid: Number(data.Bill.Balance) <= 0, amountDue: Number(data.Bill.Balance) };
    },
  };
}
