import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createProcurementMcpServer } from './server';

// Local/stdio entry point for MCP clients that spawn a subprocess (Claude
// Desktop, etc.) instead of talking HTTP. Run with `npm run mcp`.
async function main() {
  const server = createProcurementMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('procurement MCP server failed to start:', err);
  process.exit(1);
});
