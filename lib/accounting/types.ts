// What every accounting system adapter (QuickBooks, Xero, Sage, NetSuite)
// can do. Records go out as they're approved here; paid status comes back.

export const PROVIDERS = ['QUICKBOOKS', 'XERO', 'SAGE', 'NETSUITE'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_NAMES: Record<Provider, string> = {
  QUICKBOOKS: 'QuickBooks Online',
  XERO: 'Xero',
  SAGE: 'Sage Accounting',
  NETSUITE: 'NetSuite',
};

/** Stored encrypted in Connection.secret. OAuth fields for QuickBooks/Xero/Sage, token-based auth for NetSuite. */
export type Credentials = {
  provider: Provider;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt?: number;
  /** QuickBooks company (realmId), Xero tenant, Sage business, or NetSuite account ID. */
  companyId?: string;
  companyName?: string;
  sandbox?: boolean;
  // NetSuite token-based authentication.
  consumerKey?: string;
  consumerSecret?: string;
  tokenId?: string;
  tokenSecret?: string;
};

/** Stored in Connection.options: what to sync and where it lands. */
export type AccountingOptions = {
  provider: Provider;
  /** Expense (ledger) account every bill and PO line posts to. */
  expenseAccountId?: string;
  expenseAccountName?: string;
  /** Bank account payments come out of. */
  paymentAccountId?: string;
  paymentAccountName?: string;
  /** NetSuite OneWorld subsidiary for new vendors. */
  subsidiaryId?: string;
  /** Sage: tax rate for purchase lines, where the region requires one. */
  taxRateId?: string;
  syncPurchaseOrders?: boolean;
  syncBills?: boolean;
  syncPayments?: boolean;
  /** Mark invoices paid here when their bill is paid in the accounting system. */
  pullPayments?: boolean;
  /** OAuth in progress: the state value the callback must return. */
  oauthState?: string;
};

export type Account = { id: string; name: string; code?: string };

export type VendorRecord = {
  id: string;
  name: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  currency: string;
};

export type Line = { description: string; quantity: number; unitPrice: number; amount: number };

export type PurchaseOrderRecord = {
  id: string;
  number: string;
  date: Date;
  currency: string;
  vendorExternalId: string;
  lines: Line[];
  memo?: string | null;
  // The promised delivery date, for systems with a field for it (Xero).
  deliveryDate?: Date | null;
};

export type BillRecord = {
  id: string;
  number: string;
  date: Date;
  dueDate?: Date | null;
  currency: string;
  vendorExternalId: string;
  lines: Line[];
  total: number;
  poNumber?: string | null;
};

export type PaymentRecord = {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  vendorExternalId: string;
  billExternalId: string;
  reference?: string | null;
};

export type Created = { id: string; number?: string };
export type BillStatus = { paid: boolean; amountDue: number };

export interface AccountingAdapter {
  /** Name of the connected company, to prove the connection works. */
  companyName(): Promise<string>;
  expenseAccounts(): Promise<Account[]>;
  bankAccounts(): Promise<Account[]>;
  createVendor(vendor: VendorRecord): Promise<Created>;
  /** Null when this system has no purchase orders in its API (Sage). */
  createPurchaseOrder: ((po: PurchaseOrderRecord, options: AccountingOptions) => Promise<Created>) | null;
  createBill(bill: BillRecord, options: AccountingOptions): Promise<Created>;
  createPayment(payment: PaymentRecord, options: AccountingOptions): Promise<Created>;
  billStatus(externalId: string): Promise<BillStatus>;
}

export class AccountingError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
    public status?: number
  ) {
    super(message);
  }
}

/** A setting the admin still has to choose before this record can sync. */
export class AccountingSetupError extends AccountingError {
  constructor(message: string) {
    super(message, false);
  }
}
