import { z, ZodType } from 'zod';
import { ApiError } from '@/lib/errors';

// Constrained to ZodType<T, any, any> (not the ZodSchema alias, which pins
// Input = Output) so a schema with .default()/.optional() fields — where
// Input and Output legitimately differ — still infers T as the Output type.
// Otherwise TS ends up inferring the wider Input type, and every defaulted
// field looks `| undefined` to callers even though safeParse always fills it.
export function validateWithSchema<T>(schema: ZodType<T, any, any>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(422, result.error.issues.map((i) => i.message).join(', '));
  }
  return result.data;
}

// A list page's route pattern (e.g. "/teams/[slug]/items"), used to key
// table preferences and saved filters.
export const tableKeySchema = z.string().regex(/^\/[\w\-/[\]]{1,200}$/, 'Invalid table key.');

export const teamSlugSchema = z.object({
  slug: z.string().min(1),
});

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currency: z.string().min(1).max(10).optional(),
});

export const createApprovalWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().positive().optional(),
  approverRoles: z.array(z.enum(['OWNER', 'ADMIN', 'APPROVER', 'FINANCE', 'REQUESTER', 'AUDITOR'])).min(1),
  isDefault: z.boolean().default(false),
});

export const requisitionLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  estimatedPrice: z.number().nonnegative(),
  categoryId: z.string().optional(),
  suggestedVendorId: z.string().optional(),
});

export const createRequisitionSchema = z.object({
  title: z.string().min(1).max(200),
  justification: z.string().optional(),
  departmentId: z.string().optional(),
  budgetId: z.string().optional(),
  neededBy: z.string().datetime().optional(),
  currency: z.string().default('USD'),
  lineItems: z.array(requisitionLineItemSchema).min(1),
});

export const decisionSchema = z.object({
  comment: z.string().optional(),
});

export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  legalName: z.string().optional(),
  categoryId: z.string().optional(),
  taxId: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  paymentTerms: z.string().optional(),
  preferredCurrency: z.string().default('USD'),
  // Create the vendor already approved, e.g. when adding one while raising a
  // purchase order. Only honoured for members who can approve vendors.
  activate: z.boolean().optional(),
});

export const createBudgetSchema = z.object({
  name: z.string().min(1).max(200),
  departmentId: z.string().optional(),
  period: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).default('ANNUAL'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allocatedAmount: z.number().nonnegative(),
  currency: z.string().default('USD'),
});

// A calendar date, "2026-10-15" (a full ISO timestamp is accepted and its
// date part kept). Stored as that date at 00:00 UTC.
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'Use a date like 2026-10-15.')
  .transform((value) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), 'Use a date like 2026-10-15.');

export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().min(1),
  requisitionId: z.string().optional(),
  contractId: z.string().optional(),
  budgetId: z.string().optional(),
  currency: z.string().default('USD'),
  shippingAddress: z.string().optional(),
  billingAddress: z.string().optional(),
  notes: z.string().optional(),
  // When the vendor promised to deliver; drives the scorecard's on-time rate.
  expectedDeliveryDate: calendarDateSchema.optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().optional(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
  tax: z.number().nonnegative().default(0),
  shipping: z.number().nonnegative().default(0),
});

// The promised date can be set or cleared (null) until the PO is closed.
export const updatePurchaseOrderSchema = z.object({
  expectedDeliveryDate: calendarDateSchema.nullable(),
});

export const vendorReturnActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('credit'), amount: z.number().nonnegative(), reference: z.string().max(100).optional() }),
]);

export const createRfqSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  vendorIds: z.array(z.string()).min(1),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().optional(),
      })
    )
    .min(1),
});

export const createQuoteSchema = z.object({
  vendorId: z.string().min(1),
  totalAmount: z.number().nonnegative(),
  currency: z.string().default('USD'),
  leadTimeDays: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
});

export const createContractSchema = z.object({
  vendorId: z.string().min(1),
  rfqId: z.string().optional(),
  title: z.string().min(1).max(200),
  value: z.number().nonnegative().optional(),
  currency: z.string().default('USD'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  autoRenew: z.boolean().default(false),
  documentUrl: z.string().url().optional().or(z.literal('')),
});

export const createGoodsReceiptSchema = z.object({
  poId: z.string().min(1),
  notes: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        poLineItemId: z.string().min(1),
        quantityReceived: z.number().positive(),
        condition: z.string().optional(),
      })
    )
    .min(1),
});

export const createInvoiceSchema = z.object({
  vendorId: z.string().min(1),
  poId: z.string().optional(),
  invoiceNumber: z.string().min(1),
  currency: z.string().default('USD'),
  tax: z.number().nonnegative().default(0),
  dueDate: z.string().datetime().optional(),
  issuedDate: z.string().datetime().optional(),
  documentUrl: z.string().url().optional().or(z.literal('')),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        poLineItemId: z.string().optional(),
      })
    )
    .min(1),
});

export const createPaymentSchema = z.object({
  vendorId: z.string().min(1),
  invoiceId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  method: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
  reference: z.string().optional(),
});

export const updateAgentPolicySchema = z.object({
  autoApproveEnabled: z.boolean().optional(),
  autoApproveMaxAmount: z.number().nonnegative().optional(),
  autoApproveCategories: z.array(z.string()).optional(),
  autoMatchInvoices: z.boolean().optional(),
  autoMatchTolerancePct: z.number().min(0).max(100).optional(),
  autoDraftRfqOutreach: z.boolean().optional(),
  spendAnomalyThresholdPct: z.number().min(0).max(100).optional(),
});
