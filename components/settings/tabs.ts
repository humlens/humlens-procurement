import { SlidersHorizontal, Users, Workflow, Sparkles, Plug, KeyRound, ScrollText, Link2 } from 'lucide-react';

import type { SettingsTab } from './SettingsLayout';

export const settingsTabs: SettingsTab[] = [
  { key: 'general', label: 'General', icon: SlidersHorizontal, tone: 'gray' },
  { key: 'members', label: 'Members & invitations', icon: Users, tone: 'blue' },
  { key: 'approval-workflows', label: 'Approval workflows', icon: Workflow, tone: 'violet' },
  { key: 'agent-policy', label: 'AI agent policy', icon: Sparkles, tone: 'purple' },
  { key: 'api-keys', label: 'API keys', icon: KeyRound, tone: 'amber' },
  { key: 'integrations', label: 'Integrations', icon: Link2, tone: 'cyan' },
  { key: 'mcp', label: 'MCP server', icon: Plug, tone: 'teal' },
  { key: 'audit-log', label: 'Audit log', icon: ScrollText, tone: 'indigo' },
];
