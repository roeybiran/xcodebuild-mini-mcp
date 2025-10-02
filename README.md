# XcodeBuild Mini MCP Server

An MCP (Model Context Protocol) server that provides Xcode build operations through the MCP interface, following the [official MCP Node.js guide](https://modelcontextprotocol.io/docs/develop/build-server#node).

## Features

This MCP server provides the following tools:

- **build** - Build an Xcode scheme
- **list_tests** - List all tests for an Xcode scheme
- **build_tests** - Build tests for an Xcode scheme
- **run_tests** - Run tests for an Xcode scheme (with optional test filtering)
- **list_packages** - List all packages in the Xcode project

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

## Usage

### Running the MCP Server

```bash
npm start
```

Or for development:
```bash
npm run dev
```

### MCP Client Configuration

To use this MCP server with an MCP client, add it to your client configuration:

```json
{
  "mcpServers": {
    "xcodebuild-mini": {
      "command": "node",
      "args": ["/path/to/xcodebuild-mini-mcp/dist/index.js"],
      "cwd": "/path/to/xcodebuild-mini-mcp"
    }
  }
}
```

### Available Tools

#### build
Build an Xcode scheme.

**Parameters:**
- `scheme` (required): The Xcode scheme to build
- `warn` (optional): Show warnings in output (default: false)

**Example:**
```json
{
  "name": "build",
  "arguments": {
    "scheme": "MyApp",
    "warn": true
  }
}
```

#### list_tests
List all tests for an Xcode scheme.

**Parameters:**
- `scheme` (required): The Xcode scheme to list tests for

**Example:**
```json
{
  "name": "list_tests",
  "arguments": {
    "scheme": "MyApp"
  }
}
```

#### build_tests
Build tests for an Xcode scheme.

**Parameters:**
- `scheme` (required): The Xcode scheme to build tests for

**Example:**
```json
{
  "name": "build_tests",
  "arguments": {
    "scheme": "MyApp"
  }
}
```

#### run_tests
Run tests for an Xcode scheme.

**Parameters:**
- `scheme` (required): The Xcode scheme to run tests for
- `only` (optional): Run only specific test

**Example:**
```json
{
  "name": "run_tests",
  "arguments": {
    "scheme": "MyApp",
    "only": "MyAppTests/testExample"
  }
}
```

#### list_packages
List all packages in the Xcode project.

**Parameters:**
None

**Example:**
```json
{
  "name": "list_packages",
  "arguments": {}
}
```

## Requirements

- Node.js 18+
- Xcode command line tools
- The `xcodebuild` command must be available in PATH

## Development

### Project Structure

```
xcodebuild-mini-mcp/
├── src/
│   ├── index.ts          # Main MCP server implementation (following MCP guide patterns)
│   └── xcodebuild.ts     # TypeScript implementation of Xcode build operations
├── dist/                 # Compiled JavaScript output
├── package.json          # Node.js dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

### Implementation Details

This server follows the [official MCP Node.js guide](https://modelcontextprotocol.io/docs/develop/build-server#node) patterns:

- **Server Initialization**: Uses the recommended `Server` class from `@modelcontextprotocol/sdk`
- **Transport**: Uses `StdioServerTransport` for stdio-based communication
- **Tool Handlers**: Implements `ListToolsRequestSchema` and `CallToolRequestSchema` handlers
- **Error Handling**: Proper error handling with structured responses
- **Logging**: Uses `console.error` for logging (stdout is reserved for JSON-RPC messages)

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## Error Handling

The MCP server handles errors gracefully and returns structured error responses. Common error scenarios include:

- Invalid scheme names
- Build failures
- Test execution failures
- Missing dependencies

All errors are returned with descriptive messages and proper error flags.

## License

MIT
