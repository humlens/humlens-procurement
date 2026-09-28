import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { apiFetch, apiPost, apiPut } from '@/lib/fetcher';

type ProviderInfo = { id: 'anthropic' | 'openai' | 'mistral' | 'local'; label: string; defaultModel: string; examples: string[]; deploymentKey: boolean; local: boolean };
type AiModelSettings = {
  provider: ProviderInfo['id'] | null;
  model: string | null;
  keyHint: string | null;
  baseUrl: string | null;
  localDefaultUrl: string;
  defaultModel: string;
  providers: ProviderInfo[];
  gateway: boolean;
};

/** Settings → Agent policy: which model the team's agents run on, with the team's own key. */
export default function AiModelCard({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['ai-model', slug],
    queryFn: () => apiFetch<AiModelSettings>(`/api/teams/${slug}/ai-model`),
    enabled: !!slug,
  });
  const [provider, setProvider] = useState<ProviderInfo['id'] | ''>('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setProvider(data.provider ?? '');
    setModel(data.model ?? '');
    setBaseUrl(data.baseUrl ?? '');
  }, [data]);

  if (!data) return null;
  const current = data.providers.find((p) => p.id === provider);

  const save = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    setResult(null);
    try {
      const next = await apiPut<AiModelSettings>(`/api/teams/${slug}/ai-model`, body);
      queryClient.setQueryData(['ai-model', slug], next);
      setApiKey('');
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await apiPost<{ ok: boolean; model: string; source: string; reply?: string; error?: string }>(`/api/teams/${slug}/ai-model`);
      setResult(r.ok ? { ok: true, text: `${r.model} answered “${r.reply}” (${r.source}).` } : { ok: false, text: `${r.model}: ${r.error}` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'The test failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card max-w-xl space-y-5">
      <div>
        <p className="font-medium">AI model</p>
        <p className="text-xs text-gray-500">
          The model your agents use to draft, summarise and match. Calls go straight to the provider on your key, so usage is billed by them with no markup, or to a
          model you run yourself, so nothing leaves your network.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setProvider('')}
          className={`rounded-lg border px-3 py-2 text-left text-sm ${provider === '' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200'}`}
        >
          Default
          <span className="block text-[11px] text-gray-500">{data.defaultModel}</span>
        </button>
        {data.providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setProvider(p.id);
              if (!model || !p.examples.includes(model)) setModel(p.defaultModel);
            }}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${provider === p.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200'}`}
          >
            {p.label}
            <span className="block text-[11px] text-gray-500">
              {p.local ? (p.deploymentKey ? 'server set up' : 'Ollama, LM Studio, vLLM') : p.deploymentKey ? 'key on the server' : 'bring your key'}
            </span>
          </button>
        ))}
      </div>

      {current && (
        <>
          <div>
            <label className="label">Model</label>
            <input className="input" list={`models-${current.id}`} value={model} onChange={(e) => setModel(e.target.value)} placeholder={current.defaultModel} />
            <datalist id={`models-${current.id}`}>
              {current.examples.map((example) => (
                <option key={example} value={example} />
              ))}
            </datalist>
          </div>
          {current.local && (
            <div>
              <label className="label">Server address</label>
              <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={data.localDefaultUrl} />
              <p className="mt-1 text-xs text-gray-500">
                Its OpenAI-compatible address. Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1. Leave empty to use the server’s default.
                Pull the model first, e.g. <code className="rounded bg-gray-100 px-1">ollama pull {model || current.defaultModel}</code>.
              </p>
            </div>
          )}
          <div>
            <label className="label">{current.local ? 'API key (only if your server needs one)' : `${current.label} API key`}</label>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={data.provider === current.id && data.keyHint ? `Saved: ${data.keyHint}` : current.local ? 'Not needed for Ollama or LM Studio' : current.deploymentKey ? 'Optional: the server has a key' : 'Paste your key'}
            />
            <p className="mt-1 text-xs text-gray-500">Stored encrypted and never shown again. Leave empty to keep the saved key.</p>
          </div>
        </>
      )}

      {result && (
        <p className={`rounded-md px-3 py-2 text-xs ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{result.text}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() =>
            save(
              provider
                ? { provider, model: model || undefined, ...(apiKey ? { apiKey } : {}), ...(provider === 'local' ? { baseUrl } : {}) }
                : { provider: null },
              provider ? `Agents now use ${model || current?.defaultModel}.` : 'Agents use the default model.'
            )
          }
        >
          {busy ? 'Saving…' : 'Save model'}
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={test}>
          Test connection
        </button>
        {data.provider && data.keyHint && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => save({ provider: data.provider, model: data.model ?? undefined, apiKey: null }, 'Removed the saved key.')}>
            Remove saved key
          </button>
        )}
      </div>
    </div>
  );
}
