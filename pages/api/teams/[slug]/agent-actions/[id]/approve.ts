import { z } from 'zod';

import { approveAgentAction } from 'models/agentAction';
import { validateWithSchema } from '@/lib/zod';
import { agentActionEndpoint } from '@/lib/agentActionEndpoint';

// POST { edits?: { quantity: 40 } } or { args: {...} }: apply a proposed change,
// with any numbers the reviewer changed.
const bodySchema = z.object({
  edits: z.record(z.number()).optional(),
  args: z.record(z.unknown()).optional(),
});

export default agentActionEndpoint('approve', (member, id, body) =>
  approveAgentAction(member.teamId, id, { userId: member.userId, role: member.role }, validateWithSchema(bodySchema, body))
);
