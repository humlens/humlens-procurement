import type { Role } from '@prisma/client';
import type { z } from 'zod';

import type { Action, Resource } from '@/lib/permissions';

// Who is making a change. Agents act as the team's owner (so records always
// have a real person on them) but are recorded as the agent in AgentAction.
// `role` is the acting person's team role; it's absent when an agent acts.
export type ActionContext = {
  teamId: string;
  userId: string;
  source: 'agent' | 'user' | 'mcp';
  role?: Role;
  /** The AgentAction row this change belongs to, when there is one. */
  agentActionId?: string;
};

/** A number a reviewer may change before approving, e.g. a quantity. */
export type EditableField = { key: string; label: string; value: number; min: number };

// One change the app can make. Agents, the inbox, the REST API and the MCP
// server all go through these, so a change is validated, permission-checked
// and undone the same way wherever it comes from.
export type ActionDefinition<Input, Result> = {
  name: string;
  /** Short verb phrase for buttons and logs, e.g. "Move stock". */
  label: string;
  resource: Resource;
  permission: Action;
  input: z.ZodType<Input, z.ZodTypeDef, unknown>;
  /** One line for the inbox, e.g. "Approve “Standing desks” (USD 8,000) at the ADMIN step". */
  describe(teamId: string, input: Input): Promise<string>;
  apply(ctx: ActionContext, input: Input): Promise<Result>;
  /** Puts things back as they were. Throws an ApiError when that's no longer safe. */
  revert?(ctx: ActionContext, result: Result, input: Input): Promise<void>;
  editable?(input: Input): EditableField[];
  withEdits?(input: Input, values: Record<string, number>): Input;
  /**
   * False once the proposal has been dealt with elsewhere (e.g. someone
   * approved the requisition on its own page), so the inbox can close it.
   */
  stillNeeded?(teamId: string, input: Input): Promise<boolean>;
  /** Team-relative page for the thing this action touches, e.g. `requisitions/<id>`. */
  link?(input: Input, result?: Result): string | null;
};

export type AnyActionDefinition = ActionDefinition<any, any>;

export const defineAction = <Input, Result>(definition: ActionDefinition<Input, Result>) => definition;
