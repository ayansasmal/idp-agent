# NX Build Issues and Fixes (2025-11-16)

This document summarizes the build issues identified and resolved in the AI-IDP project.

## Issues Fixed

### 1. Web App Next.js Configuration Errors

#### 1.1. `eslint` Property Error in `next.config.ts`

**Problem**: The `eslint` property in `next.config.ts` is not part of the NextConfig type definition in Next.js 16.

**Solution**: Updated the next.config.ts to use the "satisfies" TypeScript operator to fix type checking:

```typescript
// Before
const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

// After
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
} satisfies NextConfig;
```

#### 1.2. Syntax Error in `next.config.js`

**Problem**: Missing semicolon and closing brace in exportPathMap function.

**Solution**: Fixed syntax and properly closed the function. Later, exportPathMap was removed entirely as it's not compatible with the app directory in Next.js 16.

#### 1.3. HTML Import Error

**Problem**: When building the web app, encountered error: `<Html> should not be imported outside of pages/_document.`

**Notes**: The error occurs during static page generation for the 404 error page. This is likely related to how Next.js 16 handles the app router vs. pages router. Further investigation needed to determine which page is incorrectly importing the Html component.

### 2. MCP Protocol Type Issues

#### 2.1. MetaAgent MCP Client Imports

**Problem**: The MetaAgent was using outdated MCP client imports directly from the ModelContextProtocol SDK.

**Solution**: Updated imports to use the `AgentCommunicationClient` from the internal `@ai-idp/agent-communication` package.

```typescript
// Before
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// After
import { AgentCommunicationClient } from '@ai-idp/agent-communication';
```

#### 2.2. Client Initialization Updates

**Problem**: MetaAgent's `initializeMCPClients` method was using outdated transport and client initialization.

**Solution**: Updated to use the new `AgentCommunicationClient` API:

```typescript
// Before
const infraTransport = new StreamableHTTPClientTransport(
  new URL(this.config.agents.infrastructure.url)
);
const infraClient = new Client(
  {
    name: 'meta-agent-infrastructure-client',
    version: '1.0.0'
  }
);
await infraClient.connect(infraTransport);
this.mcpClients.set('infrastructure', infraClient);

// After
const infraClient = new AgentCommunicationClient({
  clientTimeout: this.config.agents.infrastructure.timeout || 30000,
  clientName: 'meta-agent-infrastructure-client',
  clientVersion: '1.0.0'
});
await infraClient.connect('infrastructure', this.config.agents.infrastructure.url);
this.mcpClients.set('infrastructure', infraClient);
```

### 3. Agent HTTP MCP Server Type Errors

#### 3.1 Observability Agent HTTPMCPServer

**Problem**: Type errors in tool handler return types.

**Solution**: Used const assertions on the "text" property types and updated annotations to _meta:

```typescript
// Before
return {
  content: [{
    type: "text",
    text: JSON.stringify(result, null, 2)
  }]
};

// After
return {
  content: [{
    type: "text" as const,
    text: JSON.stringify(result, null, 2)
  }]
};
```

#### 3.2 Infrastructure Agent HTTPMCPServer

**Problem**: Similar type errors as the Observability Agent, plus `annotations` property needed to be renamed to `_meta`.

**Solution**: Applied const assertions and renamed annotations:

```typescript
// Before
return {
  content: [{
    type: "text",
    text: result.success
      ? `✅ ${result.message}`
      : `❌ ${result.message}`,
    annotations: {
      audience: ['user', 'assistant'],
      priority: result.success ? 0.8 : 0.9,
      executionTime: result.metadata?.executionTime || 0
    }
  }]
};

// After
return {
  content: [{
    type: "text" as const,
    text: result.success
      ? `✅ ${result.message}`
      : `❌ ${result.message}`,
    _meta: {
      audience: ['user', 'assistant'],
      priority: result.success ? 0.8 : 0.9,
      executionTime: result.metadata?.executionTime || 0
    }
  }]
};
```

### 4. Build Process Issues

The full NX build process runs out of memory when trying to build all packages together. The solution is to build packages individually:

```bash
# These builds succeed
npm run build:meta-agent
npm run build:shared # (if needed)

# Web app still has HTML import issue
npm run build:web
```

## Recommendations

1. **Update Next.js Configuration**: The web app should be migrated to properly support Next.js 16's app directory structure, removing any pages-specific imports in the app directory.

2. **Use TypeScript Const Assertions**: When working with string literal types in the MCP protocol, always use `as const` to ensure proper type inference.

3. **Individual Builds**: Continue using individual package builds rather than the full NX build until memory usage is optimized.

4. **Update Zod Version**: The error about "npm:zod@4.1.3" not being mapped in the lockfile suggests an issue with the Zod dependency version. Consider updating or pinning this dependency properly.

## Next Steps

1. Investigate the HTML import issue in the web app
2. Optimize memory usage for full NX builds
3. Add proper error handling for cases where `node --max-old-space-size` needs to be increased
4. Update Zod dependency to a properly mapped version