import { markAgentActionSeen } from 'models/agentAction';
import { ApiError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { agentActionEndpoint } from '@/lib/agentActionEndpoint';

// POST: mark a finding as read so it leaves the inbox.
export default agentActionEndpoint('seen', (member, id) => {
  if (!can(member.role, 'agent_action', 'read')) throw new ApiError(403, 'You do not have permission to read agent actions.');
  return markAgentActionSeen(member.teamId, id, member.userId);
});
