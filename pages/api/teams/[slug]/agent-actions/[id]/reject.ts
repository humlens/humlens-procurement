import { rejectAgentAction } from 'models/agentAction';
import { agentActionEndpoint } from '@/lib/agentActionEndpoint';

// POST: dismiss a proposed change without applying it.
export default agentActionEndpoint('reject', (member, id) => rejectAgentAction(member.teamId, id, { userId: member.userId, role: member.role }));
