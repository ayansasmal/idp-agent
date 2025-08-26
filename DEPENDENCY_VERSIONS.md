# Dependency Version Management

This document tracks all major dependency versions across the AI-IDP monorepo and maintains them at the latest stable versions to ensure consistency, security, and optimal performance.

## 📈 Update Strategy: Always Use Latest

**Philosophy**: We maintain all dependencies at their latest stable versions to benefit from:
- Latest security patches
- Performance improvements  
- Bug fixes and stability improvements
- New features and API improvements

## 🔄 Current Update Status

Based on `npm-check-updates` analysis (as of January 26, 2025):

### 🚨 Priority Updates (Breaking Changes)
| Dependency | Current | Latest | Impact | Update Priority |
|-----------|---------|--------|--------|-----------------|
| **@anthropic-ai/sdk** | `^0.36.1` | `^0.60.0` | 🔴 Major (0.x) | HIGH - Test thoroughly |
| **openai** | `^4.69.0` | `^5.15.0` | 🔴 Major | HIGH - Breaking changes expected |
| **@modelcontextprotocol/sdk** | `^0.6.0` | `^1.17.4` | 🔴 Major | HIGH - MCP protocol changes |

### 🟡 Standard Updates (Safe)
| Dependency | Current | Latest | Impact | Update Priority |
|-----------|---------|--------|--------|-----------------|
| **Zod** | `^4.0.17` | `^4.1.3` | 🟡 Minor | IMMEDIATE |
| **@fastify/websocket** | `^11.0.1` | `^11.2.0` | 🟡 Minor | HIGH |
| **@kubernetes/client-node** | `^1.0.0` | `^1.3.0` | 🟡 Minor | HIGH |
| **@qdrant/js-client-rest** | `^1.11.0` | `^1.15.1` | 🟡 Minor | MEDIUM |
| **Next.js** | `15.4.7` | `15.5.0` | 🟡 Minor | MEDIUM |
| **@aws-sdk/client-dynamodb** | `^3.868.0` | `^3.873.0` | 🟡 Minor | MEDIUM |
| **uuid** | `^11.0.3` | `^11.1.0` | 🟡 Minor | LOW |
| **tsx** | `^4.20.4` | `^4.20.5` | 🟢 Patch | LOW |

## 🎯 Target Versions (Latest Stable)

### Core Infrastructure Dependencies
| Dependency | Target Version | Status | Notes |
|-----------|----------------|--------|--------|
| **TypeScript** | `^5.9.2` | ✅ Current | Build tooling |
| **Node.js** | `>=20.0.0` | ✅ Current | Runtime requirement |
| **Zod** | `^4.1.3` | 🟡 Update needed | Schema validation |
| **Pino** | `^9.9.0` | ✅ Current | Logging library |

### Web Framework Dependencies  
| Dependency | Target Version | Status | Notes |
|-----------|----------------|--------|--------|
| **Fastify** | `^5.5.0` | ✅ Current | HTTP framework |
| **@fastify/cors** | `^11.1.0` | ✅ Current | CORS middleware |
| **@fastify/websocket** | `^11.2.0` | 🟡 Update needed | WebSocket support |

### Frontend Dependencies
| Dependency | Target Version | Status | Notes |
|-----------|----------------|--------|--------|
| **Next.js** | `15.5.0` | 🟡 Update needed | React framework |
| **React** | `19.1.1` | ✅ Current | UI library |
| **React DOM** | `19.1.1` | ✅ Current | React renderer |

### AI/ML Dependencies
| Dependency | Target Version | Status | Notes |
|-----------|----------------|--------|--------|
| **@anthropic-ai/sdk** | `^0.60.0` | 🔴 Major update | Claude API - Test thoroughly |
| **openai** | `^5.15.0` | 🔴 Major update | OpenAI API - Breaking changes |

## 📦 Package-Specific Update Status

### @ai-idp/meta-agent (`v1.0.0`) 
```json
{
  "zod": "^4.1.3",                    // ✅ Latest
  "fastify": "^5.5.0",               // ✅ Current
  "@fastify/websocket": "^11.0.1",   // 🟡 Update to 11.2.0
  "pino": "^9.9.0",                  // ✅ Current
  "@anthropic-ai/sdk": "^0.36.1",    // 🔴 Update to 0.60.0 (Major)
  "openai": "^4.69.0",               // 🔴 Update to 5.15.0 (Major)
  "uuid": "^11.0.3"                  // 🟡 Update to 11.1.0
}
```

### @ai-idp/infrastructure-agent (`v1.0.0`)
```json
{
  "zod": "^4.1.3",                        // ✅ Latest
  "fastify": "^5.5.0",                   // ✅ Current
  "pino": "^9.9.0",                      // ✅ Current
  "@kubernetes/client-node": "^1.0.0",   // 🟡 Update to 1.3.0
  "@modelcontextprotocol/sdk": "^0.6.0", // 🔴 Update to 1.17.4 (Major)
  "uuid": "^11.0.3"                      // 🟡 Update to 11.1.0
}
```

### @ai-idp/core (`v1.0.0`)
```json
{
  "zod": "^4.0.17",                       // 🟡 Update to 4.1.3
  "fastify": "^5.5.0",                   // ✅ Current
  "pino": "^9.9.0",                      // ✅ Current
  "pino-http": "^10.5.0",                // ✅ Current
  "@aws-sdk/client-dynamodb": "^3.868.0", // 🟡 Update to 3.873.0
  "@aws-sdk/lib-dynamodb": "^3.868.0",    // 🟡 Update to 3.873.0
  "redis": "^5.8.1"                      // 🟢 Update to 5.8.2
}
```

### @ai-idp/web-app (`v2.0.0`)
```json
{
  "next": "15.4.7",                      // 🟡 Update to 15.5.0
  "react": "19.1.1",                     // ✅ Current
  "react-dom": "19.1.1",                 // ✅ Current
  "zod": "^4.0.17",                      // 🟡 Update to 4.1.3
  "@tanstack/react-query": "^5.85.5",    // ✅ Current
  "ai": "^5.0.16",                       // 🟢 Update to 5.0.24
  "eslint-config-next": "15.4.7",        // 🟡 Update to 15.5.0
  "styled-jsx": "^5.1.6"                 // 🟢 Update to 5.1.7
}
```

### Shared Libraries

#### @ai-idp/utils (`v1.0.0`)
```json
{
  "pino": "^9.9.0",         // ✅ Current
  "zod": "^4.0.17"          // 🟡 Update to 4.1.3
}
```

#### @ai-idp/qdrant-client (`v1.0.0`)
```json
{
  "@qdrant/js-client-rest": "^1.11.0", // 🟡 Update to 1.15.1
  "openai": "^4.69.0",                 // 🔴 Update to 5.15.0 (Major)
  "pino": "^9.9.0",                    // ✅ Current
  "zod": "^4.0.17"                     // 🟡 Update to 4.1.3
}
```

#### @ai-idp/mcp-client (`v1.0.0`)
```json
{
  "@modelcontextprotocol/sdk": "^0.6.0", // 🔴 Update to 1.17.4 (Major)
  "ws": "^8.18.0",                       // 🟢 Update to 8.18.3
  "@types/ws": "^8.5.13"                 // 🟡 Update to 8.18.1
}
```

#### @ai-idp/types (`v1.0.0`)
```json
{
  // Type definitions only - no runtime dependencies
  // ✅ All dependencies up to date
}
```

## 🔧 Immediate Actions Required

### 1. **Update All Packages to Latest Versions**
```bash
# Update packages with safe changes (minor/patch)
find packages -name package.json -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" | while read pkg; do
  dir=$(dirname "$pkg")
  echo "Updating $dir..."
  cd "$dir" && npx npm-check-updates -u --target minor
  cd - > /dev/null
done

# Install all updates
npm install --workspaces
```

### 2. **Major Version Updates (Requires Testing)**
```bash
# Update OpenAI SDK (4.x → 5.x) - BREAKING CHANGES
for pkg in packages/meta-agent packages/shared/qdrant-client; do
  echo "Updating OpenAI SDK in $pkg..."
  cd "$pkg" && npm install openai@^5.15.0 && cd -
done

# Update Anthropic SDK (0.36 → 0.60) - MAJOR 0.x CHANGES  
cd packages/meta-agent && npm install @anthropic-ai/sdk@^0.60.0

# Update MCP SDK (0.6 → 1.17) - BREAKING PROTOCOL CHANGES
for pkg in packages/agents/infrastructure packages/shared/mcp-client; do
  echo "Updating MCP SDK in $pkg..."
  cd "$pkg" && npm install @modelcontextprotocol/sdk@^1.17.4 && cd -
done
```

### 3. **Verify Compatibility After Each Update**
```bash
# Type check all packages
npm run type-check --workspaces

# Run tests  
npm run test --workspaces

# Build all packages
npm run build --workspaces
```

## 🔄 Automated Maintenance Process

### **Weekly Dependency Checks** 
```bash
#!/bin/bash
# check-updates.sh - Add to repository scripts

echo "🔍 Checking for dependency updates..."
for pkg in packages/*/package.json packages/*/*/package.json; do
  if [ -f "$pkg" ] && [[ "$pkg" != *"/node_modules/"* ]] && [[ "$pkg" != *"/.next/"* ]]; then
    dir=$(dirname "$pkg")
    echo "=== $dir ==="
    cd "$dir" && npx npm-check-updates --format group
    cd - > /dev/null
  fi
done
```

### **Safe Update Process**
1. **Minor/Patch Updates** (Weekly):
   ```bash
   # Apply safe updates automatically
   find packages -name package.json -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" | while read pkg; do
     dir=$(dirname "$pkg")
     cd "$dir" && npx npm-check-updates -u --target minor
     cd - > /dev/null
   done
   npm install --workspaces
   ```

2. **Major Updates** (Monthly, with testing):
   ```bash
   # Check major updates available
   npx npm-check-updates --target major --format group
   
   # Apply major updates one by one with testing
   cd packages/[package] && npx npm-check-updates -u [specific-package]
   npm install && npm run type-check && npm run test
   ```

3. **Security Audits** (Weekly):
   ```bash
   npm audit --workspaces
   npm audit fix --workspaces
   ```

## 🚀 Quick Update Commands

```bash
# Check all package versions
npm ls --workspaces --depth=0

# Update specific dependency to latest across all packages  
npm install zod@latest --workspaces

# Check outdated dependencies
npm outdated --workspaces

# Full dependency refresh
rm -rf packages/*/node_modules packages/*/*/node_modules
npm install --workspaces

# Check for security vulnerabilities
npm audit --workspaces
```

## 📊 Update Tracking

### Recent Updates
| Date | Package | Dependency | Old → New | Type | Status |
|------|---------|------------|-----------|------|---------|
| 2025-01-26 | All | zod | 4.0.17 → 4.1.3 | Minor | 🟡 Pending |
| 2025-01-26 | meta-agent | @anthropic-ai/sdk | 0.36.1 → 0.60.0 | Major | 🔴 Needs Testing |
| 2025-01-26 | Multiple | openai | 4.69.0 → 5.15.0 | Major | 🔴 Needs Testing |
| 2025-01-26 | MCP packages | @modelcontextprotocol/sdk | 0.6.0 → 1.17.4 | Major | 🔴 Needs Testing |

### Breaking Change Migration Guide

#### OpenAI SDK v4 → v5
- **Chat completions**: API structure changes
- **Streaming**: New streaming interface  
- **Error handling**: Updated error types
- **Migration**: Review [OpenAI v5 migration guide](https://github.com/openai/openai-node/blob/main/MIGRATION.md)

#### Anthropic SDK v0.36 → v0.60
- **Message format**: Potential message structure updates
- **Streaming**: Enhanced streaming capabilities
- **Types**: Updated TypeScript definitions
- **Migration**: Test message creation and streaming

#### MCP SDK v0.6 → v1.17
- **Protocol changes**: MCP protocol version updates
- **Agent communication**: Enhanced agent-to-agent communication
- **Tool definitions**: Updated tool definition schemas
- **Migration**: Update MCP server implementations

## 📅 Update Schedule

- **Daily**: Security patches (`npm audit`)
- **Weekly**: Minor/patch updates (`npm-check-updates --target minor`)
- **Monthly**: Major version updates (with testing)
- **Quarterly**: Full dependency audit and cleanup

## 🔍 Monitoring

```bash
# Set up automatic update checking
echo '#!/bin/bash
for pkg in packages/*/package.json packages/*/*/package.json; do
  if [ -f "$pkg" ] && [[ "$pkg" != *"/node_modules/"* ]]; then
    dir=$(dirname "$pkg")
    echo "=== $dir ==="
    cd "$dir" && npx npm-check-updates --format group
    cd - > /dev/null
  fi
done' > .github/scripts/check-updates.sh

chmod +x .github/scripts/check-updates.sh

# Add to GitHub Actions for weekly reports
```

## 📝 Notes

- **Latest First**: Always target the latest stable versions for security and features
- **Test Major Updates**: Always test major version changes in development first
- **Monitor Breaking Changes**: Check changelogs for breaking changes before updating
- **Consistency**: Keep all packages using the same dependency version
- **Security**: Run `npm audit` regularly and fix vulnerabilities immediately
- **Memory Issues**: Version mismatches can cause TypeScript compilation failures

---

**Last Updated**: January 26, 2025  
**Next Scheduled Update**: February 2, 2025 (Weekly minor updates)  
**Next Major Review**: February 26, 2025