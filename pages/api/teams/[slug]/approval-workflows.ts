import type { NextApiRequest, NextApiResponse } from 'next';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { listApprovalWorkflows, createApprovalWorkflow } from 'models/approvalWorkflow';
import { validateWithSchema, createApprovalWorkflowSchema } from '@/lib/zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const teamMember = await guardTeamAccess(req, res, 'approval_workflow', 'read');
      res.status(200).json({ data: await listApprovalWorkflows(teamMember.teamId) });
      return;
    }

    if (req.method === 'POST') {
      const teamMember = await guardTeamAccess(req, res, 'approval_workflow', 'configure');
      const params = validateWithSchema(createApprovalWorkflowSchema, req.body);
      const workflow = await createApprovalWorkflow({ teamId: teamMember.teamId, ...params });
      res.status(201).json({ data: workflow });
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
