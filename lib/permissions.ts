import { Role } from '@prisma/client';

type RoleType = (typeof Role)[keyof typeof Role];

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'issue'
  | 'receive'
  | 'match'
  | 'pay'
  | 'configure'
  | 'invite'
  | 'leave';

export type Resource =
  | 'team'
  | 'team_member'
  | 'team_invitation'
  | 'department'
  | 'vendor'
  | 'budget'
  | 'requisition'
  | 'approval_workflow'
  | 'rfq'
  | 'quote'
  | 'contract'
  | 'purchase_order'
  | 'goods_receipt'
  | 'invoice'
  | 'payment'
  | 'agent_policy'
  | 'agent_action'
  | 'audit_log';

export type Permission = {
  resource: Resource;
  actions: Action[] | '*';
};

type RolePermissions = {
  [role in RoleType]: Permission[];
};

export const availableRoles: { id: RoleType; name: string; description: string }[] = [
  { id: Role.OWNER, name: 'Owner', description: 'Full control, billing, and team management' },
  { id: Role.ADMIN, name: 'Admin', description: 'Procurement manager — configures workflows, budgets, and vendors' },
  { id: Role.APPROVER, name: 'Approver', description: 'Approves requisitions and purchase orders within their limit' },
  { id: Role.FINANCE, name: 'Finance', description: 'Manages invoices, payments, and budget reconciliation' },
  { id: Role.REQUESTER, name: 'Requester', description: 'Creates and submits purchase requisitions' },
  { id: Role.AUDITOR, name: 'Auditor', description: 'Read-only access across the tenant for compliance review' },
];

export const permissions: RolePermissions = {
  OWNER: [
    { resource: 'team', actions: '*' },
    { resource: 'team_member', actions: '*' },
    { resource: 'team_invitation', actions: '*' },
    { resource: 'department', actions: '*' },
    { resource: 'vendor', actions: '*' },
    { resource: 'budget', actions: '*' },
    { resource: 'requisition', actions: '*' },
    { resource: 'approval_workflow', actions: '*' },
    { resource: 'rfq', actions: '*' },
    { resource: 'quote', actions: '*' },
    { resource: 'contract', actions: '*' },
    { resource: 'purchase_order', actions: '*' },
    { resource: 'goods_receipt', actions: '*' },
    { resource: 'invoice', actions: '*' },
    { resource: 'payment', actions: '*' },
    { resource: 'agent_policy', actions: '*' },
    { resource: 'agent_action', actions: '*' },
    { resource: 'audit_log', actions: ['read'] },
  ],
  ADMIN: [
    { resource: 'team', actions: ['read', 'update'] },
    { resource: 'team_member', actions: '*' },
    { resource: 'team_invitation', actions: '*' },
    { resource: 'department', actions: '*' },
    { resource: 'vendor', actions: '*' },
    { resource: 'budget', actions: '*' },
    { resource: 'requisition', actions: '*' },
    { resource: 'approval_workflow', actions: '*' },
    { resource: 'rfq', actions: '*' },
    { resource: 'quote', actions: '*' },
    { resource: 'contract', actions: '*' },
    { resource: 'purchase_order', actions: '*' },
    { resource: 'goods_receipt', actions: ['read', 'create', 'update'] },
    { resource: 'invoice', actions: ['read', 'create', 'update', 'match'] },
    { resource: 'payment', actions: ['read', 'create'] },
    { resource: 'agent_policy', actions: '*' },
    { resource: 'agent_action', actions: ['read', 'approve', 'reject'] },
    { resource: 'audit_log', actions: ['read'] },
  ],
  APPROVER: [
    { resource: 'team', actions: ['read', 'leave'] },
    { resource: 'vendor', actions: ['read'] },
    { resource: 'budget', actions: ['read'] },
    { resource: 'requisition', actions: ['read', 'approve', 'reject'] },
    { resource: 'rfq', actions: ['read'] },
    { resource: 'quote', actions: ['read', 'approve'] },
    { resource: 'contract', actions: ['read'] },
    { resource: 'purchase_order', actions: ['read', 'approve', 'reject'] },
    { resource: 'goods_receipt', actions: ['read'] },
    { resource: 'invoice', actions: ['read'] },
    { resource: 'agent_action', actions: ['read', 'approve', 'reject'] },
  ],
  FINANCE: [
    { resource: 'team', actions: ['read', 'leave'] },
    { resource: 'vendor', actions: ['read', 'update'] },
    { resource: 'budget', actions: '*' },
    { resource: 'requisition', actions: ['read'] },
    { resource: 'contract', actions: ['read'] },
    { resource: 'purchase_order', actions: ['read'] },
    { resource: 'goods_receipt', actions: ['read'] },
    { resource: 'invoice', actions: '*' },
    { resource: 'payment', actions: '*' },
    { resource: 'agent_action', actions: ['read', 'approve', 'reject'] },
  ],
  REQUESTER: [
    { resource: 'team', actions: ['read', 'leave'] },
    { resource: 'vendor', actions: ['read'] },
    { resource: 'budget', actions: ['read'] },
    { resource: 'requisition', actions: ['create', 'read', 'update', 'submit'] },
    { resource: 'rfq', actions: ['read'] },
    { resource: 'purchase_order', actions: ['read'] },
    { resource: 'goods_receipt', actions: ['create', 'read'] },
    { resource: 'invoice', actions: ['read'] },
  ],
  AUDITOR: [
    { resource: 'team', actions: ['read'] },
    { resource: 'department', actions: ['read'] },
    { resource: 'vendor', actions: ['read'] },
    { resource: 'budget', actions: ['read'] },
    { resource: 'requisition', actions: ['read'] },
    { resource: 'approval_workflow', actions: ['read'] },
    { resource: 'rfq', actions: ['read'] },
    { resource: 'quote', actions: ['read'] },
    { resource: 'contract', actions: ['read'] },
    { resource: 'purchase_order', actions: ['read'] },
    { resource: 'goods_receipt', actions: ['read'] },
    { resource: 'invoice', actions: ['read'] },
    { resource: 'payment', actions: ['read'] },
    { resource: 'agent_action', actions: ['read'] },
    { resource: 'audit_log', actions: ['read'] },
  ],
};

export function can(role: RoleType, resource: Resource, action: Action): boolean {
  const rolePermissions = permissions[role] || [];
  const match = rolePermissions.find((p) => p.resource === resource);
  if (!match) return false;
  return match.actions === '*' || match.actions.includes(action);
}

export function getRoleDisplayName(role: RoleType): string {
  return availableRoles.find((r) => r.id === role)?.name || role;
}

// Approval role ordering used by lib/approvalWorkflow.ts to decide which
// role tier is "higher" when building a step sequence from an amount band.
export const approverSeniority: RoleType[] = [Role.APPROVER, Role.ADMIN, Role.OWNER];
