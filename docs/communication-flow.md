# AI-IDP Communication Flow Analysis

## 1. Service Startup and Registration Flow

```mermaid
sequenceDiagram
    participant PM as Process Manager
    participant IA as Infrastructure Agent
    participant MA as Meta Agent
    participant WA as Web App

    Note over PM: npm run dev (process-manager.js start)
    
    PM->>IA: Start Infrastructure Agent (port 3003)
    IA->>IA: Load environment (.env KUBECONFIG)
    IA->>IA: Initialize Kubernetes client
    IA->>IA: Start HTTP server (port 3003)
    IA->>IA: Start MCP server (/mcp endpoint)
    Note over IA: ✅ Infrastructure Agent Ready

    PM->>MA: Start Meta Agent (port 3000)
    MA->>MA: Load environment 
    MA->>MA: Initialize Qdrant client
    MA->>MA: Initialize AI providers (Anthropic)
    MA->>MA: Start agent discovery process
    
    Note over MA,IA: 🔍 Agent Registration Process (WHERE IT FAILS)
    
    MA->>IA: GET /health (health check)
    IA-->>MA: 200 OK (healthy: true)
    Note over MA: Health check passes ✅
    
    MA->>IA: GET /mcp (establish SSE connection)
    IA-->>MA: SSE connection established
    Note over MA: SSE connection works ✅
    
    MA->>IA: MCP handshake (tools/list request)
    IA-->>MA: MCP tools list response (5 tools)
    Note over MA: Tools received ✅
    
    Note over MA: ❌ REGISTRATION NEVER COMPLETES
    Note over MA: registeredAgents.set() never called
    Note over MA: agentRegistry remains empty
    
    MA->>MA: Complete Meta Agent initialization
    Note over MA: ✅ Meta Agent Ready (but no agents registered)
    
    PM->>WA: Start Web App (port 3002)
    WA->>WA: Next.js initialization
    Note over WA: ✅ Web App Ready
```

## 2. Request Processing Flow (Current Broken State)

```mermaid
sequenceDiagram
    participant UI as Web UI
    participant API as Web App API
    participant MA as Meta Agent  
    participant MCP as MCP Client
    participant IA as Infrastructure Agent

    UI->>API: POST /api/agent<br/>{"messages": [{"content": "deploy nginx"}]}
    
    API->>API: Parse request, create context
    API->>MA: POST /chat<br/>{"userInput": "deploy nginx", "context": {...}}
    
    MA->>MA: Retrieve context from Qdrant
    MA->>MA: Classify intent with AI<br/>Result: {agent: "infrastructure", action: "deployApplication"}
    
    Note over MA,MCP: 🚨 FAILURE POINT
    MA->>MCP: callTool("infrastructure", "deployApplication", params)
    MCP->>MCP: agentRegistry.get("infrastructure")
    Note over MCP: Returns undefined ❌<br/>No agent registered!
    
    MCP-->>MA: Error: "No agent registered for: infrastructure"
    MA-->>API: {"success": false, "message": "No agent registered for: infrastructure"}
    API-->>UI: Error response
    
    Note over IA: Infrastructure Agent never called<br/>Even though it's healthy and ready!
```

## 3. Direct Infrastructure Agent Call (What Works)

```mermaid
sequenceDiagram
    participant Test as Test Script
    participant IA as Infrastructure Agent
    participant K8s as Kubernetes API
    
    Test->>IA: POST /tools/deployApplication<br/>{"resourceName": "nginx", "containerImage": "nginx:latest"}
    
    IA->>IA: Validate parameters
    IA->>K8s: Create Deployment (nginx)
    K8s-->>IA: Deployment created successfully
    IA->>K8s: Create Service (nginx)  
    K8s-->>IA: Service created successfully
    
    IA-->>Test: {"success": true, "message": "✅ Deployed nginx"}
    
    Note over Test: ✅ This works perfectly!<br/>Nginx deployment is created
```

## 4. Expected Working Flow (Once Fixed)

```mermaid
sequenceDiagram
    participant UI as Web UI
    participant API as Web App API
    participant MA as Meta Agent
    participant MCP as MCP Client
    participant IA as Infrastructure Agent
    participant K8s as Kubernetes API
    
    UI->>API: POST /api/agent<br/>{"messages": [{"content": "deploy nginx"}]}
    
    API->>MA: POST /chat<br/>{"userInput": "deploy nginx", "context": {...}}
    
    MA->>MA: Classify intent → {agent: "infrastructure", action: "deployApplication"}
    MA->>MCP: callTool("infrastructure", "deployApplication", params)
    MCP->>MCP: agentRegistry.get("infrastructure")
    Note over MCP: ✅ Found registered agent
    
    MCP->>IA: MCP tools/call request<br/>{"name": "deployApplication", "arguments": {...}}
    
    IA->>IA: Execute deployment logic
    IA->>K8s: Create Deployment & Service
    K8s-->>IA: Resources created
    
    IA-->>MCP: {"success": true, "result": {"message": "✅ Deployed nginx", "detailedResponse": "..."}}
    MCP-->>MA: MCP Response with deployment details
    MA->>MA: Synthesize response with AI
    MA-->>API: {"success": true, "message": "✅ Successfully deployed nginx"}
    API-->>UI: Chat response with deployment confirmation
```

## 5. Registration Failure Analysis

```mermaid
flowchart TD
    A[Meta Agent Starts] --> B[Initialize MCP Client]
    B --> C[Start Agent Discovery]
    C --> D[Check Infrastructure Agent Health]
    D --> E{Health Check Passes?}
    
    E -->|✅ Yes| F[Establish SSE Connection to /mcp]
    E -->|❌ No| G[Skip Registration]
    
    F --> H[Send MCP tools/list Request]
    H --> I[Receive Tools List Response]
    I --> J[Validate Response Format]
    J --> K{Response Valid?}
    
    K -->|✅ Yes| L[Store in agentRegistry Map]
    K -->|❌ No| M[Log Error & Skip]
    
    L --> N[✅ Registration Complete]
    M --> O[❌ Registration Failed]
    G --> O
    
    N --> P[Meta Agent Ready with Agents]
    O --> Q[Meta Agent Ready but No Agents]
    
    style E fill:#e1f5fe
    style K fill:#e1f5fe
    style N fill:#c8e6c9
    style O fill:#ffcdd2
    style P fill:#c8e6c9
    style Q fill:#ffcdd2
    
    Note1[Current State: Reaches step J<br/>but fails at step K or L]
    Note1 -.-> K
```

## 6. Architecture Overview with Failure Points

```mermaid
graph TB
    subgraph "Web Layer"
        UI[Web UI<br/>localhost:3002]
        API[Web App API<br/>/api/agent]
    end
    
    subgraph "Meta Agent Layer"
        MA[Meta Agent<br/>localhost:3000]
        IC[Intent Classifier]
        RC[Response Coordinator]
        MCP[MCP Client]
        REG[(Agent Registry<br/>❌ EMPTY)]
    end
    
    subgraph "Infrastructure Layer"
        IA[Infrastructure Agent<br/>localhost:3003]
        MCP_SERVER[MCP Server<br/>/mcp endpoint]
        K8S[Kubernetes Operations]
        TOOLS[5 Tools Available]
    end
    
    subgraph "External Systems"
        K8S_API[Kubernetes API<br/>✅ Connected]
        QDRANT[Qdrant Vector DB<br/>✅ Connected]
    end
    
    UI --> API
    API --> MA
    MA --> IC
    MA --> MCP
    MCP --> REG
    
    %% This is the broken connection
    MCP -.->|❌ Registration Fails| MCP_SERVER
    MCP_SERVER --> IA
    IA --> K8S
    K8S --> K8S_API
    
    %% This works fine
    IA -.->|✅ Direct calls work| K8S_API
    
    MA --> QDRANT
    MA --> RC
    
    style REG fill:#ffcdd2
    style MCP_SERVER fill:#fff3e0
    style IA fill:#e8f5e8
    style K8S_API fill:#e8f5e8
```

## Key Findings

### ✅ What Works:
1. **All services start successfully**
2. **Infrastructure Agent connects to real Kubernetes**
3. **Direct Infrastructure Agent API calls work perfectly**
4. **Meta Agent HTTP server is operational**
5. **Web App can reach Meta Agent**

### ❌ What Fails:
1. **MCP agent registration between Meta Agent and Infrastructure Agent**
2. **Agent registry in MCP Client remains empty**
3. **Meta Agent cannot route requests to Infrastructure Agent**

### 🔍 Root Cause:
The MCP registration handshake between Meta Agent and Infrastructure Agent fails at step K or L in the registration flow. The agents can communicate (health checks pass, SSE connects), but the final registration step that populates `agentRegistry.set("infrastructure", capabilities)` never completes.

### 🛠️ Next Steps:
1. Debug the MCP registration handshake
2. Check MCP protocol implementation between agents
3. Verify the tools/list response format matches expected schema
4. Add detailed logging to pinpoint exact failure in registration process