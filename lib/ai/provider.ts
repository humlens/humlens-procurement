// Routed through the Vercel AI Gateway rather than a provider-specific SDK —
// the `ai` package resolves this string against the gateway's model catalog,
// so switching model/provider later is a one-line change. Requires either
// AI_GATEWAY_API_KEY (local dev) or the automatic Vercel OIDC token when
// deployed on Vercel. Fast, cheap model for structured extraction/drafting
// tasks (matching, drafting); swap per-agent if a task needs more depth.
export const agentModel = 'anthropic/claude-sonnet-4-5';
