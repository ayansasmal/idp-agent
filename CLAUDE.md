# CLAUDE.md

This file provides guidance to Claude Code when working with this AI-Powered Integrated Developer Platform (IDP).

## Project Overview

Multi-agent AI platform that uses conversational AI to eliminate infrastructure complexity. Natural language operations like "Deploy my Node.js app with PostgreSQL" → Done.

**Architecture**: Meta-Agent + Focused Agents + Shared Intelligence
- **Meta-Agent**: Orchestrator with AI routing (port 3000)
- **Infrastructure Agent**: K8s operations (port 3003) ✅ Production Ready
- **Observability Agent**: SLM-powered monitoring (port 3005) ✅ Production Ready
- **Shared Context**: Qdrant vector database for cross-agent memory
- **Communication**: MCP (Model Context Protocol)

## Technology Stack

- **Language**: TypeScript + Node.js 20+
- **AI Models**: Anthropic Claude (Meta), Llama 3.2:3b (Observability), OpenAI (fallback)
- **Database**: PostgreSQL + Prisma, Redis cache, Qdrant vectors
- **Web**: Next.js 15 + React 19 + Tailwind v4
- **Infrastructure**: Kubernetes, Docker Compose
- **Testing**: Vitest

## Project Structure

```
packages/
├── meta-agent/              # 🧠 Orchestrator (port 3000)
├── agents/
│   ├── infrastructure/      # ✅ K8s operations (port 3003)
│   └── observability/       # ✅ SLM monitoring (port 3005)
├── shared/                  # 📚 Common libraries
│   ├── types/              # TypeScript definitions
│   ├── utils/              # HTTP, logging, validation
│   ├── mcp-client/         # Agent communication
│   └── qdrant-client/      # Vector database
└── web-app/                # 🌐 Next.js UI (port 3002)
```

## Development Commands

```bash
# Installation & Setup
npm install
cp .env.example .env  # Add ANTHROPIC_API_KEY
npx prisma migrate dev
npm run dev

# Build & Test  
npm run build
npm run test
npm run lint
npm run type-check

# Services
docker-compose up -d  # PostgreSQL, Redis, LocalStack
npm run dev:web       # Web app (port 3002)
```

## Core Design Principles

1. **Safety-First**: Parameter validation, risk assessment, human approval for critical ops
2. **LLM Agnostic**: Switch between Anthropic/OpenAI with environment variables
3. **Natural Language**: "Deploy my Node.js app with PostgreSQL" → Done
4. **Conversational**: AI handles complexity, users get simple chat interface

## Current Status: ✅ Production Ready Multi-Agent System

- **Meta-Agent + Infrastructure Agent**: Fully operational with MCP communication
- **Observability Agent**: SLM-powered monitoring with 5 AI tools  
- **Web Application**: Complete Next.js UI with chat and approval workflows
- **Shared Libraries**: @ai-idp/utils, types, mcp-client, qdrant-client

## Recent Improvements ✨ (2025-01-30)

### **🔧 BUILD SYSTEM FIXES** (2025-09-04)

**All build issues resolved - project fully operational**

- **✅ Fixed root package.json**: Added action-manager to all build scripts (build, test, lint, type-check)
- **✅ Fixed dependency versions**: Corrected @types/bull version (4.10.6 → 4.10.4) and removed unnecessary types
- **✅ Fixed ConversationContext usage**: Removed invalid timestamp properties in infrastructure examples
- **✅ Fixed ActionManager API integration**: Updated Infrastructure Agent to use correct API methods
  - `createAction(CreateActionRequest)` instead of individual parameters
  - `getAction(actionId)` instead of `getActionStatus(actionId)`
  - `getActionsByUser(userId)` instead of `getUserActions(userId)`
- **✅ Fixed ActionIntent enum usage**: Corrected TypeScript enum type annotations
- **✅ All packages build successfully**: infrastructure, meta-agent, action-manager, web-app
- **✅ All type checks pass**: Zero TypeScript errors across entire codebase

**Build Commands Working:**
```bash
npm run build              # ✅ All packages
npm run type-check         # ✅ Zero errors
npm run test               # ✅ All tests
npm run lint               # ✅ Code quality
```

### **🎉 DISTRIBUTED ACTION TRACKING SYSTEM - COMPLETE**

**All 6 phases successfully implemented with real-time UI and intelligent follow-ups!**

- **✅ Phase 1-3: Complete Backend Infrastructure**
  - DynamoDB schema with TTL cleanup
  - Action Manager service with full CRUD operations
  - Worker Framework with abstract base classes and validation

- **✅ K8s AI Integration (4 sub-phases)**
  - 🤖 **AI-Powered Kubernetes Operations**: Integrated K8sAIOps/kubernetes_operator_3b_peft_gguf model
  - Natural language to kubectl command generation with risk assessment
  - AI-powered Kubernetes YAML manifest creation from descriptions
  - Specialized 3B parameter model trained on ~1,500 K8s operations
  - Confidence scoring and safety warnings for all generated operations

- **✅ Phase 4: Multi-Agent Integration (3 sub-phases)**
  - Infrastructure Agent connection to distributed tracking
  - **Meta-Agent Hybrid Routing**: Smart routing between distributed and direct modes
  - End-to-end workflow testing UI → Meta-Agent → Action Manager → Workers

- **✅ Phase 5: Real-time UI System (5 sub-phases)**
  - Complete TypeScript type definitions with Zod schemas
  - **WebSocket Context Provider**: Real-time action updates across the application
  - **ActionStatusCard Component**: Live progress tracking with detailed execution info
  - **Chat Integration**: Real-time action tracking within conversation flow
  - **ActionDashboard**: Comprehensive monitoring with filtering, sorting, and statistics

- **✅ Phase 6: Intelligence & Observability**
  - **Smart Follow-up Prompts**: Context-aware suggestions after operations complete
  - **Failure Investigation**: Automatic troubleshooting prompts with recommended actions
  - **System-wide Pattern Detection**: High failure rate alerts and resource constraints
  - **Timeout Intelligence**: Smart prompts for long-running operations

  ```mermaid
  flowchart TD
      A[User Request] --> B[Meta-Agent]
      B --> C{Action Manager\nEnabled?}
      
      C -->|Yes| D{Infrastructure\nOperation?}
      C -->|No| E[Direct Agent Call]
      
      D -->|Yes| F[Should Use\nAction Manager?]
      D -->|No| E
      
      F -->|Yes| G[Create Action Record]
      F -->|No| E
      
      G --> H[Store in DynamoDB]
      H --> I[Return Tracking Response\nwith actionId]
      
      I --> J[Background Worker\nPicks Up Action]
      J --> K[Execute Tool]
      K --> L[Update Action Status]
      L --> M[WebSocket Broadcast]
      M --> N[Real-time UI Updates]
      N --> O[Intelligent Prompts]
      
      E --> P[Call Agent via MCP]
      P --> Q[Return Immediate Response]
      
      style G fill:#e1f5fe
      style I fill:#e8f5e8
      style J fill:#fff3e0
      style M fill:#e8f5e8
      style O fill:#f8bbd9
  ```

### **System Capabilities Now Available:**
- 🔄 **Real-time Action Tracking** with live WebSocket updates
- 🧠 **Intelligent Follow-up Suggestions** based on operation context
- 📊 **Comprehensive Monitoring Dashboard** with advanced filtering
- 🚨 **Automated Observability Triggers** for system-wide issues
- 💬 **Conversational Action Management** with progress visibility
- 🎯 **Context-aware Failure Investigation** with remediation steps

- **✅ Fixed Infrastructure Agent Timeout Handling**: Deployment timeouts are now non-fatal
  - Graceful 5-minute timeout with informative UI feedback
  - Automatic health check analysis for timed-out deployments
  - Deployment continues in background even after timeout
  
- **✅ Fixed Qdrant Point ID Format Errors**: Resolved vector database integration issues
  - Added UUID generation for valid Qdrant point IDs
  - Deterministic UUID v5 generation from string identifiers
  - Prevents crashes when storing execution patterns and contexts

## ✅ Current Status: Production-Ready Distributed Multi-Agent System

**COMPLETE**: All distributed action tracking phases implemented

### **📚 Comprehensive Documentation**
- **[Distributed Action Tracking System](./docs/ACTION_TRACKING_SYSTEM.md)**: Complete implementation details with all 6 phases
- **[Multi-Agent Architecture](./docs/MULTI-AGENT-ARCHITECTURE.md)**: System architecture with Meta-Agent orchestration
- **[Communication Flow Analysis](./docs/communication-flow.md)**: Inter-service communication patterns and debugging
- **[Type Check Error Resolutions](./docs/TYPE-CHECK-ERROR-RESOLUTIONS.md)**: Common TypeScript issues and solutions