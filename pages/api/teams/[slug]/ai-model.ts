import type { NextApiRequest, NextApiResponse } from 'next';
import { generateText } from 'ai';
import { z } from 'zod';

import { guardTeamAccess, handleApiError } from '@/lib/apiGuard';
import { setAuditEvent } from '@/lib/audit';
import { aiProviders, defaultAgentModel, DEFAULT_LOCAL_URL, getAgentModel, isAiProvider } from '@/lib/ai/provider';
import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/secrets';
import { validateWithSchema } from '@/lib/zod';

// The model the team's agents run on (Claude, OpenAI, Mistral or a local
// model server) and the team's own key for it. The key is stored encrypted and only ever returned
// masked. POST tests the current setting with a one-word call.

const bodySchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'mistral', 'local']).nullable(),
  // Local model server address; omit to keep the saved one, empty to use LOCAL_AI_URL.
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Enter the server address, e.g. http://localhost:11434/v1.')
    .optional(),
  model: z.string().trim().max(120).optional(),
  // Omit to keep the saved key; send an empty string or null to remove it.
  apiKey: z.string().trim().max(400).nullable().optional(),
});

async function describe(teamId: string) {
  const policy = await prisma.agentPolicy.upsert({ where: { teamId }, create: { teamId }, update: {} });
  const key = policy.aiApiKey ? decryptSecret(policy.aiApiKey) : null;
  return {
    provider: isAiProvider(policy.aiProvider) ? policy.aiProvider : null,
    model: policy.aiModel ?? null,
    keyHint: key ? maskSecret(key) : null,
    baseUrl: policy.aiBaseUrl ?? null,
    localDefaultUrl: process.env.LOCAL_AI_URL || DEFAULT_LOCAL_URL,
    defaultModel: defaultAgentModel(),
    providers: Object.entries(aiProviders).map(([id, p]) => ({
      id,
      label: p.label,
      defaultModel: p.defaultModel,
      examples: p.examples,
      deploymentKey: Boolean(process.env[p.envKey]),
      local: id === 'local',
    })),
    gateway: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const member = await guardTeamAccess(req, res, 'agent_policy', 'read');
      res.status(200).json({ data: await describe(member.teamId) });
      return;
    }

    if (req.method === 'PUT') {
      const member = await guardTeamAccess(req, res, 'agent_policy', 'configure');
      setAuditEvent(res, { resource: 'agent_policy', action: 'update_ai_model' });
      const body = validateWithSchema(bodySchema, req.body);
      const current = await prisma.agentPolicy.upsert({
        where: { teamId: member.teamId },
        create: { teamId: member.teamId },
        update: {},
      });
      // A key only works with its own provider, so changing provider without a new key clears it.
      const providerChanged = current.aiProvider !== body.provider;
      await prisma.agentPolicy.update({
        where: { teamId: member.teamId },
        data: {
          aiProvider: body.provider,
          aiModel: body.provider ? body.model || null : null,
          ...(body.provider !== 'local' ? { aiBaseUrl: null } : body.baseUrl !== undefined ? { aiBaseUrl: body.baseUrl || null } : {}),
          ...(body.provider === null || body.apiKey === null || body.apiKey === '' || (providerChanged && !body.apiKey)
            ? { aiApiKey: null }
            : body.apiKey
              ? { aiApiKey: encryptSecret(body.apiKey) }
              : {}),
        },
      });
      res.status(200).json({ data: await describe(member.teamId) });
      return;
    }

    // POST: check the saved setting works, with a tiny call to the provider.
    if (req.method === 'POST') {
      const member = await guardTeamAccess(req, res, 'agent_policy', 'configure');
      setAuditEvent(res, null);
      const ai = await getAgentModel(member.teamId);
      try {
        // Local models may need to load into memory first, and some think before answering.
        const { text } = await generateText({ model: ai.model, prompt: 'Reply with the single word OK.', maxOutputTokens: ai.id.startsWith('local/') ? 400 : 16 });
        res.status(200).json({ data: { ok: true, model: ai.id, source: ai.source, reply: text.trim().slice(0, 40) } });
      } catch (error) {
        res.status(200).json({ data: { ok: false, model: ai.id, source: ai.source, error: error instanceof Error ? error.message.slice(0, 300) : 'The call failed.' } });
      }
      return;
    }

    res.status(405).end();
  } catch (error) {
    handleApiError(res, error);
  }
}
