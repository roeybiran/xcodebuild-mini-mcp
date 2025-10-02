#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { build, listTests, runTests } from './xcodebuild.js';

const server = new McpServer(
  {
    name: 'xcodebuild-mini-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.tool("build", 
 "Build an Xcode project",
 {
  scheme: z.string(),
  warn: z.boolean().optional(),
 },
 async ({ scheme, warn }) => {
  const result = await build({ scheme, warn: warn || false });
  
  return {
    content: [
      {
        type: "text",
        text: result,
      },
    ],
  }
 }
);

server.tool("build_tests", 
 "Build tests for an Xcode scheme",
 {
  scheme: z.string(),
 },
 async ({ scheme }) => {
  const result = await build({ scheme, forTesting: true });
  
  return {
    content: [
      {
        type: "text",
        text: result,
      },
    ],
  }
 }
);

server.tool("list_tests", 
 "List all tests for an Xcode scheme",
 {
  scheme: z.string(),
 },
 async ({ scheme }) => {
  const result = await listTests(scheme);
  
  return {
    content: [
      {
        type: "text",
        text: result,
      },
    ],
  }
 }
);

server.tool("build_tests", 
 "Build tests for an Xcode scheme",
 {
  scheme: z.string(),
 },
 async ({ scheme }) => {
  const result = await build({ scheme, forTesting: true });
  
  return {
    content: [
      {
        type: "text",
        text: result,
      },
    ],
  }
 }
);

server.tool("run_tests", 
 "Run tests for an Xcode scheme",
 {
  scheme: z.string(),
  only: z.string().optional(),
 },
 async ({ scheme, only }) => {
  const result = await runTests(scheme, only);
  
  return {
    content: [
      {
        type: "text",
        text: result,
      },
    ],
  }
 }
);


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('XcodeBuild MCP server running on stdio');
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});