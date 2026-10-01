import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bot, CheckCircle2, Eye, Inbox as InboxIcon, Lightbulb, RotateCcw, Sparkles } from 'lucide-react';

import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import EmptyState from '@/components/EmptyState';
import IntegrationAlert from '@/components/IntegrationAlert';
import { apiFetch, apiPost } from '@/lib/fetcher';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

type Entry = {
  id: string;
  status: string;
  agent: string | null;
  title: string;
  reasoning: string | null;
  evidence: { label: string; value: string | number }[];
  confidence: number | null;
  error: string | null;
  actionLabel: string | null;
  link: string | null;
  editable: { key: string; label: string; value: number; min: number }[];
  canApprove: boolean;
  canUndo: boolean;
  appliedBy: string | null;
  revertedBy: string | null;
  appliedAt: string | null;
  createdAt: string;
};

type Inbox = {
  needsYou: Entry[];
  done: Entry[];
  findings: Entry[];
  counts: { needsYou: number; doneByAgents: number; findings: number };
  doneDays: number;
};

const agentNames: Record<string, string> = {
  approval: 'Approval agent',
  'invoice-match': 'Invoice matching agent',
  'nl-requisition': 'Plain-English request',
  sourcing: 'Sourcing agent',
  'spend-anomaly': 'Spend agent',
  'vendor-return': 'Return-to-vendor agent',
};

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString();
}

function AgentChip({ agent }: { agent: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-500/10">
      <Bot size={11} />
      {agentNames[agent ?? ''] ?? 'Agent'}
    </span>
  );
}

function Evidence({ items }: { items: Entry['evidence'] }) {
  if (!items.length) return null;
  return (
    <dl className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-md bg-gray-50 px-2 py-1 text-xs ring-1 ring-gray-200">
          <dt className="inline text-gray-500">{item.label}: </dt>
          <dd className="inline font-medium text-gray-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AgentInbox() {
  const router = useRouter();
  const slug = router.query.slug as string;
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Record<string, number>>>({});
  const [checking, setChecking] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-inbox', slug],
    queryFn: () => apiFetch<Inbox>(`/api/teams/${slug}/agent-inbox`),
    enabled: !!slug,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['agent-inbox', slug] });
  const href = (link: string | null) => (link ? `/teams/${slug}/${link}` : null);

  const act = async (entry: Entry, verb: 'approve' | 'reject' | 'undo' | 'seen', success: string, body?: unknown) => {
    setBusyId(entry.id);
    try {
      await apiPost(`/api/teams/${slug}/agent-actions/${entry.id}/${verb}`, body);
      toast.success(success);
      setEditing(({ [entry.id]: _, ...rest }) => rest);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      await apiPost(`/api/teams/${slug}/agent-actions`);
      toast.success('Agents checked spend just now.');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setChecking(false);
    }
  };

  const startEdit = (entry: Entry) =>
    setEditing((current) => ({ ...current, [entry.id]: Object.fromEntries(entry.editable.map((field) => [field.key, field.value])) }));

  return (
    <Layout title="Inbox" icon={InboxIcon} iconTone="brand">
      <IntegrationAlert slug={slug} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">What your agents did, and what they need from you.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={checkNow} disabled={checking}>
            {checking ? 'Checking…' : 'Check spend now'}
          </button>
          <Link href={`/teams/${slug}/settings/agent-policy`} className="btn-ghost">
            Agent settings
          </Link>
        </div>
      </div>

      {error ? (
        <div className="card">
          <EmptyState icon={InboxIcon} title="The inbox isn't available for your role" description="Ask an owner or admin if you should be reviewing agent work." />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Needs you" value={String(data?.counts.needsYou ?? 0)} icon={InboxIcon} tone="amber" />
            <StatCard
              label="Done by agents"
              value={String(data?.counts.doneByAgents ?? 0)}
              sub={`last ${data?.doneDays ?? 14} days`}
              icon={Sparkles}
              tone="violet"
            />
            <StatCard label="New findings" value={String(data?.counts.findings ?? 0)} icon={Lightbulb} tone="emerald" />
          </div>

          {/* Needs you */}
          <section className="mt-8" aria-labelledby="needs-you">
            <h2 id="needs-you" className="section-title mb-3">
              Needs you
            </h2>
            {isLoading ? (
              <div className="card text-sm text-gray-500">Loading…</div>
            ) : data?.needsYou.length ? (
              <ul className="space-y-3">
                {data.needsYou.map((entry) => {
                  const edits = editing[entry.id];
                  const link = href(entry.link);
                  return (
                    <li key={entry.id} className="card">
                      <div className="flex flex-wrap items-center gap-2">
                        <AgentChip agent={entry.agent} />
                        {entry.confidence !== null && (
                          <span className="text-[11px] text-gray-400">{Math.round(entry.confidence * 100)}% confident</span>
                        )}
                        <span className="ml-auto text-[11px] text-gray-400">{timeAgo(entry.createdAt)}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-gray-900">{entry.title}</h3>
                      {entry.reasoning && <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{entry.reasoning}</p>}
                      <Evidence items={entry.evidence} />
                      {entry.error && (
                        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                          Last attempt failed: {entry.error}
                        </p>
                      )}

                      {edits && (
                        <div className="mt-4 flex flex-wrap gap-3">
                          {entry.editable.map((field) => (
                            <label key={field.key} className="text-xs text-gray-600">
                              {field.label}
                              <input
                                type="number"
                                min={field.min}
                                className="input mt-1 w-32"
                                value={edits[field.key] ?? field.value}
                                onChange={(e) =>
                                  setEditing((current) => ({ ...current, [entry.id]: { ...current[entry.id], [field.key]: Number(e.target.value) } }))
                                }
                              />
                            </label>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {entry.canApprove && (
                          <button
                            type="button"
                            className="btn-primary px-3 py-1.5 text-xs"
                            disabled={busyId === entry.id}
                            onClick={() => act(entry, 'approve', 'Approved and applied.', edits ? { edits } : undefined)}
                          >
                            {edits ? 'Approve with changes' : entry.error ? 'Try again' : 'Approve'}
                          </button>
                        )}
                        {entry.canApprove && entry.editable.length > 0 && !edits && (
                          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => startEdit(entry)}>
                            Edit
                          </button>
                        )}
                        {entry.canApprove && (
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1.5 text-xs"
                            disabled={busyId === entry.id}
                            onClick={() => act(entry, 'reject', 'Dismissed.')}
                          >
                            Dismiss
                          </button>
                        )}
                        {!entry.canApprove && <span className="text-xs text-gray-400">Waiting for someone who can approve this.</span>}
                        {link && (
                          <Link href={link} className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700">
                            Open
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="card">
                <EmptyState icon={CheckCircle2} tone="emerald" title="Nothing needs you" description="Agents will ask here when an approval or change is outside what they may do on their own." />
              </div>
            )}
          </section>

          {/* Done automatically */}
          <section className="mt-8" aria-labelledby="done">
            <h2 id="done" className="section-title mb-3">
              Done · last {data?.doneDays ?? 14} days
            </h2>
            {data?.done.length ? (
              <ul className="card divide-y divide-gray-100 p-0">
                {data.done.map((entry) => {
                  const link = href(entry.link);
                  const undone = entry.status === 'REVERTED';
                  return (
                    <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${undone ? 'text-gray-400 line-through' : 'font-medium text-gray-900'}`}>{entry.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <AgentChip agent={entry.agent} />
                          <span>
                            {entry.appliedBy === 'Agent' ? 'Done by the agent' : `Approved by ${entry.appliedBy}`}
                            {entry.appliedAt ? ` · ${timeAgo(entry.appliedAt)}` : ''}
                          </span>
                          {undone && <span className="font-medium text-gray-600">Undone by {entry.revertedBy}</span>}
                        </div>
                      </div>
                      {link && (
                        <Link href={link} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                          Open
                        </Link>
                      )}
                      {entry.canUndo && (
                        <button
                          type="button"
                          className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1 text-xs"
                          disabled={busyId === entry.id}
                          onClick={() => act(entry, 'undo', 'Undone.')}
                        >
                          <RotateCcw size={12} /> Undo
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="card text-sm text-gray-500">Nothing applied in the last {data?.doneDays ?? 14} days.</div>
            )}
          </section>

          {/* Findings */}
          <section className="mt-8" aria-labelledby="findings">
            <h2 id="findings" className="section-title mb-3">
              For your information
            </h2>
            {data?.findings.length ? (
              <ul className="space-y-3">
                {data.findings.map((entry) => {
                  const link = href(entry.link);
                  return (
                    <li key={entry.id} className="card">
                      <div className="flex flex-wrap items-center gap-2">
                        <AgentChip agent={entry.agent} />
                        <span className="ml-auto text-[11px] text-gray-400">{timeAgo(entry.createdAt)}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-gray-900">{entry.title}</h3>
                      {entry.reasoning && <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{entry.reasoning}</p>}
                      <Evidence items={entry.evidence} />
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          className="btn-ghost inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                          disabled={busyId === entry.id}
                          onClick={() => act(entry, 'seen', 'Marked as read.')}
                        >
                          <Eye size={12} /> Mark as read
                        </button>
                        {link && (
                          <Link href={link} className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700">
                            Open
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="card text-sm text-gray-500">No new findings.</div>
            )}
          </section>

          <p className="mt-8 text-xs text-gray-400">
            Every decision, including ones agents declined to make, is in the{' '}
            <Link href={`/teams/${slug}/agent-actions`} className="font-medium text-brand-600 hover:text-brand-700">
              full agent log
            </Link>
            .
          </p>
        </>
      )}
    </Layout>
  );
}
