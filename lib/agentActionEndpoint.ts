import type { NextApiRequest, NextApiResponse } from 'next';

import { auditOnSuccess } from '@/lib/audit';
import { handleApiError } from '@/lib/apiGuard';
import { throwIfNoTeamAccess } from 'models/team';

type Member = Awaited<ReturnType<typeof throwIfNoTeamAccess>>;

// Shared shell for the approve / reject / undo / seen endpoints. Permission
// checks live in models/agentAction.ts, because they depend on the action
// itself (and people may apply their own plain-English drafts), so this only
// resolves the member, records the audit entry on success and maps errors.
export function agentActionEndpoint(
  auditAction: string,
  run: (member: Member, id: string, body: Record<string, unknown>) => Promise<unknown>
) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
      if (req.method !== 'POST') {
        res.status(405).end();
        return;
      }
      const member = await throwIfNoTeamAccess(req, res);
      auditOnSuccess(req, res, { teamId: member.teamId, actor: member.user, resource: 'agent_action', action: auditAction });
      const data = await run(member, req.query.id as string, (req.body ?? {}) as Record<string, unknown>);
      res.status(200).json({ data });
    } catch (error) {
      handleApiError(res, error);
    }
  };
}
