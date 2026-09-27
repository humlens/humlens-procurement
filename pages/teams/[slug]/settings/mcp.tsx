import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';

import SettingsLayout from '@/components/settings/SettingsLayout';
import { settingsTabs } from '@/components/settings/tabs';
import { requireTeamPage } from '@/lib/pageAuth';

export const getServerSideProps: GetServerSideProps = requireTeamPage;

export default function McpSettings({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const slug = router.query.slug as string;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4100';

  const config = JSON.stringify(
    {
      mcpServers: {
        procurement: {
          url: `${appUrl}/api/mcp`,
          headers: { Authorization: 'Bearer <MCP_SERVER_TOKEN>' },
        },
      },
    },
    null,
    2
  );

  return (
    <SettingsLayout
      tabs={settingsTabs}
      active="mcp"
      description="Let Claude or any MCP-compatible agent create requisitions, approve purchases, check budgets, and more — on your behalf, subject to your role's permissions."
    >
      <div className="card max-w-2xl space-y-4">
        <div>
          <p className="label">Endpoint</p>
          <code className="block rounded-md bg-gray-100 px-3 py-2 text-sm">{appUrl}/api/mcp</code>
        </div>
        <div>
          <p className="label">Authentication</p>
          <p className="text-sm text-gray-600">
            Bearer token — set <code className="rounded bg-gray-100 px-1">MCP_SERVER_TOKEN</code> in your deployment
            environment, and tool calls take your team slug (<code className="rounded bg-gray-100 px-1">{slug}</code>)
            plus <code className="rounded bg-gray-100 px-1">actingUserEmail</code> (
            <code className="rounded bg-gray-100 px-1">{userEmail}</code>) so every action is attributed to a real
            team member and checked against their role.
          </p>
        </div>
        <div>
          <p className="label">Example client config</p>
          <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100">{config}</pre>
        </div>
      </div>
    </SettingsLayout>
  );
}
