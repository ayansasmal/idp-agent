# HTTP MCP Server for Infrastructure Agent

## Overview

The Infrastructure Agent implements a **Model Context Protocol (MCP) Server** using HTTP transport to enable communication with the Meta-Agent in our multi-agent architecture. This server exposes Infrastructure Agent capabilities as MCP tools with an advanced **assume-and-confirm framework** for cost-effective parameter completion.

## Architecture

```
Meta-Agent (MCP Client)          Infrastructure Agent (HTTP MCP Server)
     Port: 3000                           Port: 3003
         │                                     │
         │ HTTP MCP Transport                  │
         ├────────────────────────────────────►│
         │                                     │
         │ Tool Calls (JSON-RPC 2.0)          │
         ├────────────────────────────────────►│
         │                                     │
         │ Assume-and-Confirm Responses        │
         ◄────────────────────────────────────┤
         │                                     │
         │ Kubernetes Manifest Previews       │
         ◄────────────────────────────────────┤
```

## ✅ PRODUCTION READY - Single Implementation

### **Unified HTTP MCP Approach**

We have simplified to a single, focused implementation:

- **✅ HTTP MCP Server**: Primary and only implementation using HTTP transport
- **✅ Enhanced Tool Handlers**: Assume-and-confirm framework with smart defaults
- **✅ Parameter Validation**: Comprehensive Zod schema validation
- **✅ Kubernetes Manifest Preview**: Full transparency before execution
- **✅ Cost-Effective**: No expensive LLM calls for parameter completion

### **Removed Legacy Implementations**

As part of our focus on a single, robust implementation, we have removed:

- ❌ ~~WebSocket MCP implementations~~ (removed)
- ❌ ~~Legacy tool handlers~~ (removed)
- ❌ ~~Fallback mechanisms~~ (removed)
- ❌ ~~Multiple transport options~~ (removed)

## 🔧 HTTP MCP Server Implementation

### **Core Features**

#### **1. Assume-and-Confirm Framework**

The server implements a sophisticated parameter completion system:

```typescript
// User provides minimal input
{ appName: "nginx", image: "nginx:latest" }

// System intelligently fills defaults
{
  appName: "nginx",
  resourceName: "nginx",
  image: "nginx:latest",
  containerImage: "nginx:latest",
  namespace: "default",
  replicas: 1,
  port: 80,                    // ← Smart detection for nginx
  resources: {
    cpu: "100m",              // ← Web server optimized
    memory: "128Mi"
  }
}

// User sees complete Kubernetes manifest preview before approval
```

#### **2. Smart Detection Logic**

**Port Detection Based on Container Images:**
- `nginx`, `apache` → Port 80
- `postgres`, `postgresql` → Port 5432
- `redis` → Port 6379
- `mongo`, `mongodb` → Port 27017
- `mysql` → Port 3306

**Resource Allocation Based on Workload Type:**
- **Database workloads** (`postgres`, `mysql`, `mongo`): 500m CPU, 512Mi memory
- **Web servers** (`nginx`, `apache`): 100m CPU, 128Mi memory
- **Generic applications**: 100m CPU, 128Mi memory (conservative baseline)

#### **3. Enhanced Tool Handlers**

Each tool includes:
```typescript
interface EnhancedToolHandler {
  handler: Function;                           // Tool implementation
  schema: ZodSchema;                          // Parameter validation
  defaultsGenerator?: DefaultsGenerator;       // Smart defaults function
  requiresConfirmation: boolean;              // User approval requirement
  description: string;                        // Human-readable description
  confirmationMessageGenerator?: Function;     // Custom preview generator
}
```

### **Available Tools**

#### **🚀 Application Management**
- **`deployApplication`**: Deploy applications with enhanced validation and Kubernetes manifest preview
- **`scaleResource`**: Scale Kubernetes resources with smart defaults and confirmation

#### **📊 Monitoring & Observability**
- **`getResourceStatus`**: Get comprehensive Kubernetes resource status (read-only, no confirmation)
- **`getResourceLogs`**: Retrieve and analyze pod logs (read-only, no confirmation)

#### **🤖 AI-Powered Operations**
- **`generateKubectlCommand`**: Generate kubectl commands from natural language using AI (no confirmation needed)

### **Tool Confirmation Strategies**

- **High-Risk Operations** (`deployApplication`, `scaleResource`): Always require confirmation with full Kubernetes manifest preview
- **Read-Only Operations** (`getResourceStatus`, `getResourceLogs`): Execute directly without confirmation
- **AI Generation** (`generateKubectlCommand`): No confirmation needed as it only generates commands

## 🛠 Configuration

### **Environment Variables**

```bash
# Required - Server Configuration
INFRASTRUCTURE_AGENT_PORT=3003

# Optional - Kubernetes Configuration
KUBECONFIG=/path/to/kubeconfig

# Optional - Qdrant Vector Database
QDRANT_URL=https://your-qdrant-instance
QDRANT_API_KEY=your-api-key
QDRANT_COLLECTION=infrastructure_context

# Optional - AI Operations
OLLAMA_URL=http://localhost:11434
KUBERNETES_AI_MODEL=hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest
```

### **Starting the Server**

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start

# Direct HTTP server
npm run http-server
```

## 🔄 MCP Communication Protocol

### **Tool Call Flow**

1. **Meta-Agent Request**: Sends MCP tool call with minimal parameters
2. **Parameter Validation**: Zod schema validates input parameters
3. **Smart Defaults**: System generates intelligent defaults for missing parameters
4. **Confirmation (if required)**: Returns confirmation request with Kubernetes manifest preview
5. **User Approval**: Meta-Agent collects user confirmation
6. **Execution**: Tool executes with validated and complete parameters
7. **Response**: Returns structured response with operation results

### **Confirmation Response Format**

```json
{
  "status": "pending_confirmation",
  "toolName": "deployApplication",
  "assumptions": {
    "resourceName": "nginx-app",
    "containerImage": "nginx:latest",
    "namespace": "default",
    "replicas": 1,
    "port": 80,
    "resources": { "cpu": "100m", "memory": "128Mi" }
  },
  "message": "Ready to deploy nginx-app with the following configuration:\n\n📋 **Deployment Settings:**\n• Name: nginx-app\n• Image: nginx:latest\n• Namespace: default\n• Replicas: 1\n• Port: 80\n• CPU: 100m\n• Memory: 128Mi\n\n📄 **Kubernetes Manifest Preview:**\n```yaml\napiVersion: apps/v1\nkind: Deployment\n...\n```",
  "confirmationPrompt": "Proceed with these settings? (y/n) or specify changes:"
}
```

## 🧪 Testing

### **Comprehensive Test Suite**

```bash
# Test assume-and-confirm framework
node scripts/test-mcp-assume-confirm.js

# Test direct deployment scenarios
node scripts/test-direct-assume-confirm.js
```

**Test Coverage:**
- ✅ Minimal nginx deployment with smart defaults
- ✅ PostgreSQL deployment with database-optimized resources
- ✅ Parameter validation and error handling
- ✅ Kubernetes manifest preview generation
- ✅ MCP protocol compliance

## 📋 Health Monitoring

### **Health Check Endpoint**

```bash
curl http://localhost:3003/health
```

**Response:**
```json
{
  "status": "healthy",
  "agent": "infrastructure-agent",
  "version": "2.0.0",
  "transport": "http",
  "sessions": 0,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### **Tool Discovery**

The server automatically exposes all enhanced tool handlers via MCP discovery, ensuring the Meta-Agent can dynamically discover available capabilities.

## 🏗 Benefits of Single Implementation

### **🎯 Focused Development**
- Single HTTP MCP implementation eliminates complexity
- No confusing legacy fallbacks or multiple code paths
- Clear, maintainable architecture focused on production needs

### **💰 Cost-Effective Operations**
- Smart defaults eliminate expensive LLM parameter completion calls
- Deterministic parameter generation based on container image heuristics
- Fast response times with no external API dependencies

### **🔍 Complete Transparency**
- Users see full Kubernetes manifests before deployment
- No surprises or unexpected resource creation
- Trust through visibility and clear confirmation workflows

### **⚡ Production Ready**
- HTTP transport ideal for containerized environments
- Comprehensive error handling and validation
- Proven architecture with extensive testing coverage

## 🔗 Integration

The HTTP MCP Server integrates seamlessly with:

- **Meta-Agent**: Primary orchestrator consuming MCP tools
- **Kubernetes API**: Direct cluster operations and resource management
- **Qdrant Vector Database**: Pattern storage and learning (optional)
- **AI Services**: Kubectl command generation and manifest creation (optional)

This focused, single-implementation approach ensures reliability, maintainability, and clear operational characteristics for production deployments.