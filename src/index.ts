#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { build, listTests, runTests } from "./xcodebuild.ts";

const server = new McpServer({
  name: "xcodebuild-mini-mcp",
  version: "1.0.0",
});

server.tool(
  "build",
  "Build the project, not including test targets",
  {
    scheme: z.string(),
    warn: z.boolean().optional(),
    src: z.string().optional(),
  },
  async ({ scheme, warn, src }) => {
    const result = await build({ scheme, warn: warn || false, src });

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }
);

server.tool(
  "build_tests",
  "Build the project, including test targets",
  {
    scheme: z.string(),
    warn: z.boolean().optional(),
    src: z.string().optional(),
  },
  async ({ scheme, warn, src }) => {
    const result = await build({
      scheme,
      forTesting: true,
      warn: warn || false,
      src,
    });

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }
);

server.tool(
  "list_tests",
  "List all tests for the project",
  {
    scheme: z.string(),
    src: z.string().optional(),
  },
  async ({ scheme, src }) => {
    const result = await listTests(scheme, src);

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }
);

server.tool(
  "run_tests",
  "Runs the project's tests",
  {
    scheme: z.string(),
    only: z.string().optional(),
    src: z.string().optional(),
  },
  async ({ scheme, only, src }) => {
    const result = await runTests(scheme, only, src);

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("xcodebuild-mini-mcp running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
