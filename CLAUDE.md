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

- **✅ Fixed Infrastructure Agent Timeout Handling**: Deployment timeouts are now non-fatal
  - Graceful 5-minute timeout with informative UI feedback
  - Automatic health check analysis for timed-out deployments
  - Deployment continues in background even after timeout
  
- **✅ Fixed Qdrant Point ID Format Errors**: Resolved vector database integration issues
  - Added UUID generation for valid Qdrant point IDs
  - Deterministic UUID v5 generation from string identifiers
  - Prevents crashes when storing execution patterns and contexts

## 🚧 Current Development: Distributed Action Tracking System

**Status**: Phase 3 Complete ✅ → Phase 4 Next 🟡
**Documentation**: See [ACTION_TRACKING_SYSTEM.md](./ACTION_TRACKING_SYSTEM.md) for comprehensive implementation plan

**Goal**: Replace polling-based status updates with distributed action tracking using DynamoDB, background workers, and real-time WebSocket updates.

**Architecture**: 
- **Action Manager**: Central orchestration with unique action IDs ✅
- **DynamoDB Storage**: Persistent action state with TTL cleanup ✅
- **Queue System**: Background processing with event handlers ✅
- **Worker Framework**: Action execution and validation ✅
- **WebSocket Updates**: Real-time UI status updates
- **Follow-up Intelligence**: Smart user prompts ("continue waiting" vs "investigate delay")

**Progress**:
- ✅ **DynamoDB Schema**: Action tracking table created with GSI indexes
- ✅ **Action Registry**: All agent actions defined with completion criteria  
- ✅ **Core Types**: Comprehensive TypeScript interfaces
- ✅ **Action Manager**: Complete service with DynamoDB CRUD operations
- ✅ **Queue System**: InMemoryActionQueue with background processing
- ✅ **Service Integration**: ActionManagerService with event callbacks
- ✅ **Worker Framework**: Production-ready execution with WorkerManager, abstract base class, and specialized workers
- ⏳ **Agent Integration**: Connect existing agents to use action tracking
- ⏳ **UI Integration**: Real-time status updates