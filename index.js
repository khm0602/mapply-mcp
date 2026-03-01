#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { browseTools } from './lib/tools/browse.js';
import { createTools } from './lib/tools/create.js';
import { editTools } from './lib/tools/edit.js';
import { organizeTools } from './lib/tools/organize.js';
import { exportTools } from './lib/tools/export.js';

const allTools = [...browseTools, ...createTools, ...editTools, ...organizeTools, ...exportTools];

const toolMap = new Map();
for (const tool of allTools) {
  toolMap.set(tool.name, tool);
}

const server = new Server(
  { name: 'mapply', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolMap.get(name);
  if (!tool) {
    return {
      content: [{ type: 'text', text: `알 수 없는 도구: ${name}` }],
      isError: true,
    };
  }

  try {
    return await tool.handler(args || {});
  } catch (err) {
    return {
      content: [{ type: 'text', text: `오류: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
