import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { guardMcpAction, resolveMcpActor } from './context';
import { listRequisitions, getRequisition, createRequisition, submitRequisition, decideRequisitionStep } from 'models/requisition';
import { draftRequisitionFromPrompt } from '@/lib/ai/agents/requisitionDraftAgent';
import { listVendors, createVendor } from 'models/vendor';
import { listPurchaseOrders, createPurchaseOrder, issuePurchaseOrder } from 'models/purchaseOrder';
import { listBudgets } from 'models/budget';
import { listInvoices } from 'models/invoice';
import { runInvoiceMatchAgent } from '@/lib/ai/agents/invoiceMatchAgent';
import { listAgentActions } from 'models/agentAction';

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
});

// A single MCP server instance exposing the same procurement operations the
// web UI and REST API offer, as tools an external agent (Claude, or any MCP
// client) can call directly — this is the "autonomous agent" surface the
// product is built around, not a bolted-on extra. Every write tool re-uses
// the exact models/*.ts functions the API routes call, so there's one
// source of truth for business rules regardless of entry point.
export function createProcurementMcpServer() {
  const server = new McpServer({ name: 'procurement-app', version: '0.1.0' });

  server.registerTool(
    'list_requisitions',
    {
      title: 'List purchase requisitions',
      description: 'List purchase requisitions for a team, optionally filtered by status.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        status: z.enum(['DRAFT', 'SUBMITTED', 'IN_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED_TO_PO', 'CANCELLED']).optional(),
      },
    },
    async ({ teamSlug, actingUserEmail, status }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'requisition', 'read');
      const requisitions = await listRequisitions(actor.team.id, { status });
      return json(requisitions);
    }
  );

  server.registerTool(
    'get_requisition',
    {
      title: 'Get a purchase requisition',
      description: 'Get full detail for one purchase requisition, including line items and approval steps.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), requisitionId: z.string() },
    },
    async ({ teamSlug, actingUserEmail, requisitionId }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'requisition', 'read');
      return json(await getRequisition(actor.team.id, requisitionId));
    }
  );

  server.registerTool(
    'create_requisition',
    {
      title: 'Create a purchase requisition (draft)',
      description: 'Create a new draft purchase requisition with structured line items. Does not submit it for approval.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        title: z.string(),
        justification: z.string().optional(),
        departmentId: z.string().optional(),
        budgetId: z.string().optional(),
        currency: z.string().default('USD'),
        lineItems: z
          .array(
            z.object({
              description: z.string(),
              quantity: z.number().positive(),
              unit: z.string().optional(),
              estimatedPrice: z.number().nonnegative(),
            })
          )
          .min(1),
      },
    },
    async ({ teamSlug, actingUserEmail, ...params }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'requisition', 'create');
      const requisition = await createRequisition({
        teamId: actor.team.id,
        requesterId: actor.user.id,
        ...params,
      });
      return json(requisition);
    }
  );

  server.registerTool(
    'draft_requisition_from_prompt',
    {
      title: 'Draft a requisition from natural language',
      description:
        'Given a plain-language purchase request (e.g. "20 standing desks for the NYC office, ~$8k budget"), have the AI extract a structured draft requisition with line items and estimated prices. Produces a DRAFT only — still requires a human to submit it.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        prompt: z.string(),
        departmentId: z.string().optional(),
        budgetId: z.string().optional(),
      },
    },
    async ({ teamSlug, actingUserEmail, prompt, departmentId, budgetId }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'requisition', 'create');
      const requisition = await draftRequisitionFromPrompt({
        teamId: actor.team.id,
        requesterId: actor.user.id,
        departmentId,
        budgetId,
        prompt,
      });
      return json(requisition);
    }
  );

  server.registerTool(
    'submit_requisition',
    {
      title: 'Submit a requisition for approval',
      description: 'Submits a draft requisition, generating its approval step sequence from the team policy and committing its amount against its budget.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), requisitionId: z.string() },
    },
    async ({ teamSlug, actingUserEmail, requisitionId }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'requisition', 'submit');
      return json(await submitRequisition(actor.team.id, requisitionId));
    }
  );

  server.registerTool(
    'decide_requisition',
    {
      title: 'Approve or reject a requisition',
      description: "Approve or reject the requisition's current pending approval step, on behalf of the acting user.",
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        requisitionId: z.string(),
        decision: z.enum(['APPROVED', 'REJECTED']),
        comment: z.string().optional(),
      },
    },
    async ({ teamSlug, actingUserEmail, requisitionId, decision, comment }) => {
      const action = decision === 'APPROVED' ? 'approve' : 'reject';
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'requisition', action);
      return json(
        await decideRequisitionStep({
          teamId: actor.team.id,
          requisitionId,
          actorId: actor.user.id,
          actorRole: actor.teamMember.role,
          decision,
          comment,
        })
      );
    }
  );

  server.registerTool(
    'list_vendors',
    {
      title: 'List vendors',
      description: 'List vendors/suppliers for a team, optionally filtered by status or name search.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
        search: z.string().optional(),
      },
    },
    async ({ teamSlug, actingUserEmail, status, search }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'vendor', 'read');
      return json(await listVendors(actor.team.id, { status, search }));
    }
  );

  server.registerTool(
    'create_vendor',
    {
      title: 'Create a vendor',
      description: 'Onboard a new vendor/supplier record for the team.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        name: z.string(),
        legalName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        paymentTerms: z.string().optional(),
        preferredCurrency: z.string().default('USD'),
      },
    },
    async ({ teamSlug, actingUserEmail, ...params }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'vendor', 'create');
      return json(await createVendor({ teamId: actor.team.id, createdById: actor.user.id, ...params }));
    }
  );

  server.registerTool(
    'list_purchase_orders',
    {
      title: 'List purchase orders',
      description: 'List purchase orders for a team, optionally filtered by status.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        status: z
          .enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'])
          .optional(),
      },
    },
    async ({ teamSlug, actingUserEmail, status }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'purchase_order', 'read');
      return json(await listPurchaseOrders(actor.team.id, { status }));
    }
  );

  server.registerTool(
    'create_purchase_order',
    {
      title: 'Create a purchase order',
      description: 'Create a purchase order for a vendor, optionally converting an approved requisition.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        vendorId: z.string(),
        requisitionId: z.string().optional(),
        currency: z.string().default('USD'),
        tax: z.number().nonnegative().default(0),
        shipping: z.number().nonnegative().default(0),
        lineItems: z
          .array(
            z.object({
              description: z.string(),
              quantity: z.number().positive(),
              unit: z.string().optional(),
              unitPrice: z.number().nonnegative(),
            })
          )
          .min(1),
      },
    },
    async ({ teamSlug, actingUserEmail, ...params }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'purchase_order', 'create');
      return json(await createPurchaseOrder({ teamId: actor.team.id, createdById: actor.user.id, ...params }));
    }
  );

  server.registerTool(
    'issue_purchase_order',
    {
      title: 'Issue a purchase order',
      description: 'Issues an approved purchase order to the vendor and commits its amount against the linked budget.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), poId: z.string() },
    },
    async ({ teamSlug, actingUserEmail, poId }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'purchase_order', 'issue');
      return json(await issuePurchaseOrder(actor.team.id, poId));
    }
  );

  server.registerTool(
    'get_budget_status',
    {
      title: 'Get budget status',
      description: 'List budgets with allocated, committed, spent, and available amounts.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email() },
    },
    async ({ teamSlug, actingUserEmail }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'budget', 'read');
      const budgets = await listBudgets(actor.team.id);
      return json(
        budgets.map((b) => ({
          ...b,
          availableAmount: Number(b.allocatedAmount) - Number(b.committedAmount) - Number(b.spentAmount),
        }))
      );
    }
  );

  server.registerTool(
    'list_invoices',
    {
      title: 'List invoices',
      description: 'List vendor invoices for a team, optionally filtered by status.',
      inputSchema: {
        teamSlug: z.string(),
        actingUserEmail: z.string().email(),
        status: z.enum(['RECEIVED', 'UNDER_REVIEW', 'MATCHED', 'MISMATCHED', 'APPROVED', 'DISPUTED', 'PAID', 'CANCELLED']).optional(),
      },
    },
    async ({ teamSlug, actingUserEmail, status }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'invoice', 'read');
      return json(await listInvoices(actor.team.id, { status }));
    }
  );

  server.registerTool(
    'run_invoice_match',
    {
      title: 'Run 3-way invoice match',
      description: 'Runs the PO x goods-receipt x invoice 3-way match for one invoice and updates its status.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), invoiceId: z.string() },
    },
    async ({ teamSlug, actingUserEmail, invoiceId }) => {
      const actor = await guardMcpAction(teamSlug, actingUserEmail, 'invoice', 'match');
      return json(await runInvoiceMatchAgent(actor.team.id, invoiceId));
    }
  );

  server.registerTool(
    'list_agent_actions',
    {
      title: 'List autonomous agent actions',
      description: 'List the audit log of autonomous actions the procurement agents have taken or proposed for this team.',
      inputSchema: { teamSlug: z.string(), actingUserEmail: z.string().email(), limit: z.number().int().positive().max(200).default(50) },
    },
    async ({ teamSlug, actingUserEmail, limit }) => {
      const actor = await resolveMcpActor(teamSlug, actingUserEmail);
      return json(await listAgentActions(actor.team.id, limit));
    }
  );

  return server;
}
