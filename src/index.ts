#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { build, listTests, runTests } from "./xcodebuild.js";

const schemeParam = z.string().describe("The scheme name");
const srcParam = z.string().optional().describe("The source directory path");
const warnParam = z.boolean().optional().describe("Whether to show warnings in the output");

const server = new McpServer({
  name: "xcodebuild-mini-mcp",
  version: "1.0.0",
});

server.tool(
  "build",
  "Build the project, not including test targets",
  {
    scheme: schemeParam,
    warn: warnParam,
    src: srcParam,
  },
  async ({ scheme, warn, src }) => {
    const result = await build({ scheme, warn, src });

    return {
      content: [
        {
          type: "text",
          text: result.text,
        },
      ],
    };
  }
);

server.tool(
  "build_tests",
  "Build the project, including test targets",
  {
    scheme: schemeParam,
    warn: warnParam,
    src: srcParam,
  },
  async ({ scheme, warn, src }) => {
    const result = await build({
      scheme,
      forTesting: true,
      warn,
      src,
    });

    return {
      content: [
        {
          type: "text",
          text: result.text,
        },
      ],
    };
  }
);

server.tool(
  "list_tests",
  "List all tests for the project",
  {
    scheme: schemeParam,
    src: srcParam,
  },
  async ({ scheme, src }) => {
    const result = await listTests({ scheme, src });

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
    scheme: schemeParam,
    only: z.string().optional().describe("Specific tests to run. Provide the full path to the test - TestTarget/TestSuite/TestName, including parentheses (e.g. 'MyAppTests/MyTestSuite/testExample()')"),
    src: srcParam,
    coverage: z.boolean().optional().describe("Whether to generate code coverage"),
  },
  async ({ scheme, only, src, coverage }) => {
    const result = await runTests({ scheme, only, src, coverage });

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
