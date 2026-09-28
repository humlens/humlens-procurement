import { undoAgentAction } from 'models/agentAction';
import { agentActionEndpoint } from '@/lib/agentActionEndpoint';

// POST: reverse an applied change through the action's own undo.
export default agentActionEndpoint('undo', (member, id) => undoAgentAction(member.teamId, id, { userId: member.userId, role: member.role }));
