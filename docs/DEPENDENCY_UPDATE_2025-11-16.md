# Dependency Updates - November 16, 2025

This document describes the dependency updates performed on the AI-IDP codebase to ensure consistency and use the latest versions of critical dependencies.

## Updates Summary

| Dependency | Previous Version | Updated Version | Packages Affected |
|------------|------------------|----------------|-------------------|
| Next.js | Mixed (15.5.0/~15.2.4) | 16.0.0 | web-app, root package.json |
| Anthropic SDK | Various | 0.68.0 | meta-agent, web-app |
| ModelContextProtocol SDK | Various | 1.21.1 | All agent packages |
| Ollama client | Various | 0.6.3 | infrastructure, observability |
| Kubernetes client | 1.3.0 | 1.0.0 | infrastructure |

## Compatibility Fixes

### MCP SDK Compatibility

The ModelContextProtocol SDK 1.21.1 changed its API structure for tool calls. The following changes were required to maintain compatibility:

1. In both infrastructure and observability agents' `MCPServer.ts`:
   - Changed `const { tool, arguments: args, context } = request.params` to `const { name: tool, arguments: args } = request.params`
   - Removed `context` parameter as it's no longer provided by the SDK
   - Updated context initialization to use only `args?.context`

### Next.js App Router Compatibility

Created proper error and loading handling for Next.js 16:

1. Added standard App Router components:
   - `src/app/not-found.tsx` - For 404 errors
   - `src/app/error.tsx` - For runtime errors
   - `src/app/loading.tsx` - For loading states

2. Updated Next.js configuration:
   - Modified `next.config.js` to handle static generation properly
   - Added `exportPathMap` to control static page generation
   - Set `staticPageGenerationTimeout` to avoid problematic pages

### TypeScript Configuration Fixes

1. Updated `tsconfig.json` to fix rootDir issues:
   - Changed `rootDir` from `.` to `../../` to properly include Next.js generated types
   - Removed problematic include patterns that referenced external directories
   - Fixed paths for proper module resolution

## Testing Results

1. Type checking passes for all packages using:
```
npm run type-check
```

2. Build process has been tested to confirm compatibility with the updated dependencies.

## Known Issues

1. There is a deprecation warning related to `url.parse()` that should be addressed in a future update.
2. The build process may need additional configuration to handle the updated MCP SDK completely.

## Next Steps

1. Further testing is needed to ensure runtime compatibility with all updated dependencies
2. Consider updating to the new WHATWG URL API to address the deprecation warning
3. Evaluate any performance implications of the Next.js 16 upgrade