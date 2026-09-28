import { createAnthropic } from '@ai-sdk/anthropic';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { decryptSecret } from '@/lib/secrets';

// Which model the team's agents run on. Each team can pick Claude, OpenAI or
// Mistral in Settings → Agent policy, with its own API key (stored
// encrypted); otherwise the deployment's default applies. Keys go straight to
// the provider, so usage is billed by the provider with no markup. "Local"
// runs on a model server you host (Ollama, LM Studio, vLLM) through its
// OpenAI-compatible API, so nothing leaves your network.

export const aiProviders = {
  anthropic: { label: 'Claude (Anthropic)', envKey: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-5', examples: ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5'] },
  openai: { label: 'OpenAI', envKey: 'OPENAI_API_KEY', defaultModel: 'gpt-5-mini', examples: ['gpt-5-mini', 'gpt-5', 'gpt-4.1'] },
  mistral: { label: 'Mistral', envKey: 'MISTRAL_API_KEY', defaultModel: 'mistral-medium-latest', examples: ['mistral-medium-latest', 'mistral-large-latest', 'mistral-small-latest'] },
  // envKey is the server address here; LOCAL_AI_API_KEY is only for servers that require one (e.g. vLLM with --api-key).
  local: { label: 'Local model', envKey: 'LOCAL_AI_URL', defaultModel: 'gemma4', examples: ['gemma4', 'qwen3:8b', 'llama3.1:8b', 'mistral-small3.2'] },
} as const;

export type AiProvider = keyof typeof aiProviders;
export const isAiProvider = (value: unknown): value is AiProvider => typeof value === 'string' && value in aiProviders;

/** The deployment's default, as `provider/model`. Override with AGENT_MODEL. */
export const defaultAgentModel = () => process.env.AGENT_MODEL?.trim() || 'anthropic/claude-sonnet-5';

const hasGateway = () => Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

export type ResolvedModel = { model: LanguageModel; id: string; source: 'team key' | 'deployment key' | 'AI Gateway' | 'team server' | 'deployment server' };

/** Ollama's default address; LM Studio uses http://localhost:1234/v1. */
export const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';

/** The local model server's address: the team's, else LOCAL_AI_URL. */
export const localServerUrl = (baseUrl?: string | null) => (baseUrl || process.env.LOCAL_AI_URL || '').trim().replace(/\/+$/, '');

/** Builds a model for a provider, using a direct key when there is one and the AI Gateway otherwise. */
export function modelFor(provider: AiProvider, modelId: string, apiKey?: string | null, baseUrl?: string | null): ResolvedModel {
  const id = `${provider}/${modelId}`;
  if (provider === 'local') {
    const url = localServerUrl(baseUrl);
    if (!url) throw new ApiError(400, `No local model server is set. Add its address in Settings → Agent policy (Ollama: ${DEFAULT_LOCAL_URL}), or set LOCAL_AI_URL.`);
    // Chat Completions is the part of OpenAI's API that local servers implement.
    const local = createOpenAI({ baseURL: url, apiKey: apiKey || process.env.LOCAL_AI_API_KEY || 'local', name: 'local' });
    return { model: local.chat(modelId), id, source: baseUrl ? 'team server' : 'deployment server' };
  }
  const key = apiKey || process.env[aiProviders[provider].envKey];
  if (key) {
    const source = apiKey ? 'team key' : 'deployment key';
    if (provider === 'anthropic') return { model: createAnthropic({ apiKey: key })(modelId), id, source };
    if (provider === 'openai') return { model: createOpenAI({ apiKey: key })(modelId), id, source };
    return { model: createMistral({ apiKey: key })(modelId), id, source };
  }
  if (hasGateway()) return { model: id, id, source: 'AI Gateway' };
  throw new ApiError(400, `No ${aiProviders[provider].label} API key is set. Add one in Settings → Agent policy, or set ${aiProviders[provider].envKey}.`);
}

/** The model this team's agents should use right now. */
export async function getAgentModel(teamId: string): Promise<ResolvedModel> {
  const policy = await prisma.agentPolicy.findUnique({ where: { teamId }, select: { aiProvider: true, aiModel: true, aiApiKey: true, aiBaseUrl: true } });
  if (policy && isAiProvider(policy.aiProvider)) {
    const apiKey = policy.aiApiKey ? decryptSecret(policy.aiApiKey) : null;
    return modelFor(policy.aiProvider, policy.aiModel?.trim() || aiProviders[policy.aiProvider].defaultModel, apiKey, policy.aiBaseUrl);
  }
  const [provider, ...rest] = defaultAgentModel().split('/');
  return isAiProvider(provider) ? modelFor(provider, rest.join('/') || aiProviders[provider].defaultModel) : { model: defaultAgentModel(), id: defaultAgentModel(), source: 'AI Gateway' };
}
