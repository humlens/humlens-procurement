import type { NextApiRequest, NextApiResponse } from 'next';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createProcurementMcpServer } from '@/lib/mcp/server';

// Stateless Streamable HTTP MCP endpoint: any MCP client (Claude, or another
// agent runtime) can point at POST /api/mcp with `Authorization: Bearer
// <MCP_SERVER_TOKEN>` to call the tools in lib/mcp/server.ts. A fresh
// server+transport is created per request since there's no session state to
// keep — every tool call carries its own team/user context as arguments.
export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Only POST is supported on this stateless MCP endpoint.' } });
    return;
  }

  const expectedToken = process.env.MCP_SERVER_TOKEN;
  const authHeader = req.headers.authorization;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({ error: { message: 'Missing or invalid bearer token.' } });
    return;
  }

  const server = createProcurementMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}
