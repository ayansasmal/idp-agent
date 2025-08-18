# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **AI-Powered Integrated Developer Platform (IDP)** that uses conversational AI to eliminate infrastructure complexity. Instead of learning platform abstractions, developers simply describe what they want in natural language, and the AI agent handles all the complexity.

**Revolutionary Approach:**
- **AI-Agent-First**: The AI agent IS the platform interface, not just a helper
- **Natural Language Operations**: "Deploy my Node.js app with PostgreSQL" → Done
- **Zero Learning Curve**: No platform training required
- **Self-Improving**: AI learns organizational patterns and gets smarter over time

## Architecture Strategy

### Modular Single Agent → Multi-Agent Evolution

**Phase 1 (Weeks 1-8): Modular Single Agent**
- 1 Primary Agent with 4 self-contained modules
- All modules run in single process with method calls
- Complete functionality delivered quickly

**Phase 2 (Weeks 9-12): Agent Extraction** 
- Extract modules to standalone agents with zero code changes
- Replace method calls with network calls
- Distributed deployment with same functionality

**Phase 3 (Weeks 13+): Specialized Agent Ecosystem**
- Add new specialized agents (Cost, Compliance, DevProd)
- Advanced features and self-improvement
- Enterprise capabilities

### Core Architecture Components

#### 4 Core Modules (Future Agents)
1. **Kubernetes Module** → Kubernetes Agent
   - Deploy, scale, status, logs, rollback operations
   - Kubernetes client wrapper and validation
   - Manifest generation and monitoring
   - **Rich Response Formatting**: Generates detailed markdown responses and structured data
   - **Self-contained UI Logic**: Owns presentation layer for Kubernetes operations

2. **Safety Module** → Security/Safety Agent
   - Policy compliance and risk assessment
   - Reality validation against platform state
   - Multi-layer safety checks

3. **Approval Module** → Workflow Agent
   - Human-in-the-loop approval workflows
   - **DynamoDB Persistent Storage**: Approval requests persist across chat sessions
   - **Risk-Based Execution Halting**: Operations halt when approval required
   - Slack integration and notifications
   - Risk-based routing and escalation

4. **Audit Module** → Observability Agent
   - Comprehensive audit logging
   - Metrics collection and compliance reporting
   - Audit trail for all operations

#### AI Core (LLM-Agnostic)
- **Primary**: Anthropic Claude (configurable)
- **Fallback**: OpenAI GPT-4 
- **Easy switching**: Change environment variables only
- **Structured responses**: Function calling for reliable operations

### Rich Response Architecture

#### Module-Level Response Formatting
Each module now owns its response formatting, creating a clean separation of concerns:

```typescript
interface ModuleResponse {
  success: boolean;
  message: string;           // Short status message
  detailedResponse?: string; // Rich markdown content  
  data: any;                // Structured data
  metadata: {
    module: string;
    action: string;
    hasDetailedResponse: boolean;
  };
}
```

#### Dual-Response System
**Short Status**: `✅ Successfully deployed nginx to staging`
**Detailed Content**: Rich markdown with:
- Pod status and replica counts
- Health conditions and deployment details  
- Troubleshooting commands and next steps
- Expandable JSON viewer for raw data

#### Benefits of Module-Owned Formatting
- **Decoupled**: Each module controls its own UI presentation
- **Scalable**: New modules automatically handle their formatting
- **Maintainable**: Domain knowledge stays with formatting logic
- **Future-Ready**: Zero changes needed when extracting to agents

## Technology Stack

### Core Technologies
- **Language**: TypeScript + Node.js 20+
- **Framework**: Fastify (high performance async)
- **Database**: PostgreSQL 16+ with Prisma ORM
- **Caching**: Redis for sessions and state
- **AI**: Anthropic Claude API (primary), OpenAI (fallback)

### Key Dependencies
```json
{
  "ai": "@anthropic-ai/sdk, openai",
  "kubernetes": "@kubernetes/client-node, js-yaml", 
  "slack": "@slack/bolt",
  "database": "prisma, postgresql",
  "validation": "zod",
  "testing": "vitest",
  "monitoring": "prom-client, pino"
}
```

### Project Structure (Monorepo)
```
ai-idp-modular/
├── packages/
│   ├── core/                    # Main agent + modules
│   │   ├── src/
│   │   │   ├── agent/           # Primary agent coordinator  
│   │   │   ├── ai/              # LLM abstraction layer
│   │   │   ├── modules/         # 4 core modules
│   │   │   │   ├── kubernetes/  # → Future K8s Agent
│   │   │   │   ├── safety/      # → Future Security Agent
│   │   │   │   ├── approval/    # → Future Workflow Agent
│   │   │   │   └── audit/       # → Future Observability Agent
│   │   │   └── shared/          # Common utilities
│   │   └── tests/               # Comprehensive tests
│   ├── web-app/                 # ✅ Next.js + React + Tailwind
│   │   ├── src/app/             # App Router pages & API routes
│   │   ├── src/components/      # React components (Chat, Approvals)
│   │   └── src/lib/             # Utilities and types
│   ├── slack-app/               # Slack integration  
│   └── cli/                     # Command-line interface
├── tools/
│   ├── agent-extractor/         # Module → Agent conversion
│   └── deployment/              # Deployment utilities
└── docs/                        # Documentation
```

## Development Commands

### Installation & Setup
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Add ANTHROPIC_API_KEY=your_key_here

# Database setup
npx prisma migrate dev
npx prisma generate

# Start development
npm run dev
```

### Build & Test
```bash
npm run build        # Build all packages
npm run test         # Run all tests  
npm run lint         # Lint code
npm run type-check   # TypeScript validation
```

### Development Services
```bash
docker-compose up -d  # Start PostgreSQL, Redis, LocalStack
npm run dev:core      # Start core agent
npm run dev:web       # Start Next.js web app (port 3002)
npm run dev:slack     # Start Slack app
```

## Core Design Principles

### 1. Zero-Refactoring Module Extraction
Each module is designed to become a standalone agent without code changes:

```typescript
// Module Interface (same for agents)
abstract class BaseModule {
    abstract process(request: ModuleRequest): Promise<ModuleResponse>;
    abstract validate(request: ModuleRequest): Promise<ValidationResult>;
    abstract getCapabilities(): string[];
}

// Communication Protocol (works for both method calls and network)
interface ModuleRequest {
    module: string;
    action: string;
    parameters: Record<string, any>;
    context: RequestContext;
}
```

### 2. LLM Provider Agnostic
Switch between Anthropic/OpenAI with zero code changes:

```typescript
// Environment-based switching
AI_PRIMARY_PROVIDER=anthropic  # or openai
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=fallback_key

// Automatic fallback on provider failure
const response = await aiCore.chat(request); // Uses best available provider
```

### 3. Safety-First Operations
All platform operations go through comprehensive safety validation:

- **Reality Checks**: Validate against actual platform state
- **Policy Compliance**: Check RBAC, quotas, environment rules  
- **Risk Assessment**: Conservative risk evaluation with execution halting
- **Permission Validation**: Missing permissions trigger approval workflows
- **Human Approval**: Required for medium/high-risk operations with execution halt
- **Execution Control**: Operations stop immediately when approval required
- **Audit Trail**: Complete logging for compliance

### 4. Conversational Interface
Natural language operations with structured AI responses:

```typescript
// User input: "Deploy my Node.js app with PostgreSQL to staging"
// AI output: Structured action with validation, risk assessment, rollback plan
interface PlatformAction {
    action: 'deploy' | 'scale' | 'status' | 'logs' | 'delete';
    resourceName: string;
    environment: 'development' | 'staging' | 'production';
    parameters: Record<string, any>;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    rollbackPlan: string;
}
```

## Web Application (Phase 2 Complete)

### ✅ Production-Ready Next.js Interface
- **Framework**: Next.js 15.4.6 with App Router and React 19
- **Styling**: Tailwind CSS v4 with modern configuration
- **State Management**: TanStack Query for server state
- **TypeScript**: Full type safety with Zod validation

### ✅ Chat Interface (`/chat`)
- Natural language interaction with AI agent
- **Dual-Response Display**: Short status + expandable detailed content
- **Rich Markdown Rendering**: Pod status, replica counts, health conditions
- **Interactive JSON Viewer**: Copy, export, and explore raw data
- **Namespace Selection UI**: Interactive dropdowns for multi-namespace clusters
- Real-time message display with timestamps
- Support for approval metadata in responses
- Error handling and loading states
- Mobile-responsive design

### ✅ Approval Workflow (`/approvals`)
- **Risk Assessment**: Automatic classification (low/medium/high/critical)
- **Execution Halting**: Operations stop when approval required (no unauthorized execution)
- **Persistent Storage**: DynamoDB-backed approval persistence across sessions
- **Permission-Based Approval**: Missing permissions trigger approval workflows
- **Human Review**: Detailed approval cards with all context
- **Approval Actions**: Approve, reject, and delete with review notes
- **Status Tracking**: Real-time status updates with optimistic UI
- **Filtering**: Filter by approval state (pending/approved/rejected)

### ✅ API Integration (`/api/`)
- **Agent Endpoint** (`/api/agent`): Chat with AI agent, automatic approval creation
- **Approvals Endpoint** (`/api/approvals`): Full CRUD operations for approvals
- **Real Agent Integration**: Full PrimaryAgent integration with all modules

### Usage
```bash
# Start Web Application (includes real core agent)
cd packages/web-app
npm run dev  # Starts both core agent and web app on http://localhost:3002

# OR start standalone (web app only with embedded agent)
npm run dev:standalone  # Web app with embedded core agent
```

**Architecture Note**: The web application now runs with the **real PrimaryAgent from the core package**. Full integration is complete and operational.

**Status**: ✅ **Production Ready** - Complete approval workflow with real AI agent integration

## Implementation Phases

### ✅ Phase 1: Modular Single Agent (Weeks 1-8) - COMPLETE
**Goal**: Working AI-powered platform with all core functionality

**Delivered:**
- ✅ Primary agent coordinator with AI core
- ✅ LLM-agnostic interface (Anthropic Claude primary) 
- ✅ Base module interface and communication layer
- ✅ Structured responses with function calling
- ✅ Complete modular architecture ready for extraction

### ✅ Phase 2: Production Web Application (Weeks 9-12) - COMPLETE
**Goal**: Production-ready web interface with comprehensive approval workflow

**Delivered:**
- ✅ **Next.js 15.4.6** web application with App Router
- ✅ **React 19 + Tailwind CSS v4** for modern UI
- ✅ **TanStack Query** for robust server state management
- ✅ **TypeScript + Zod** for complete type safety
- ✅ **Chat Interface** for natural language operations
- ✅ **Approval Workflow** with risk-based routing
- ✅ **Human Review System** with detailed approval cards
- ✅ **Real-time Status Updates** with optimistic UI
- ✅ **Complete Audit Trail** for compliance
- ✅ **End-to-End Testing** and validation
- ✅ **Production Deployment** ready

**Major Achievements:**
- **Web Application**: Complete Next.js application (http://localhost:3002)
- **Approval System**: Risk assessment (low/medium/high/critical) with human oversight
- **Chat Interface**: Natural language → AI processing → Approval creation
- **API Integration**: RESTful endpoints with full CRUD operations
- **User Experience**: Mobile-responsive, error handling, loading states
- **Technical Excellence**: Production build, deployment ready, comprehensive documentation

### ✅ Phase 2.5: Approval Workflow Enhancement (COMPLETE)
**Goal**: Fix execution flow to prevent unauthorized operations when approval required

**Problem Solved:**
- **Execution Race Condition**: Previously, when approval was required, the system would create an approval request but still continue executing the main operation, leading to unauthorized operations failing with permission errors.

**Solution Implemented:**
- **Execution Halting**: Modified `PrimaryAgent.ts` execution flow to immediately halt when approval is created
- **Proper State Management**: Added `approvalRequired`, `approvalId`, and `halted` flags to `ExecutionResult`
- **Enhanced Response Generation**: Rich approval-pending responses with detailed risk assessment and next steps
- **DynamoDB Persistence**: Complete persistent storage for approval requests using LocalStack/DynamoDB

**Technical Details:**
- **File**: `packages/core/src/agent/PrimaryAgent.ts` lines 315-332
- **Before**: System tried to update step dependencies mid-execution (too late)
- **After**: System returns immediately when approval created, halting further execution
- **Result**: Users see "⏳ Approval Required" instead of "❌ Operation Failed"

**Key Improvements:**
- ✅ No unauthorized operations execute when approval required
- ✅ Rich approval-pending UI with risk breakdown and next steps  
- ✅ Persistent approval storage across chat sessions
- ✅ Permission-based approval triggering (missing permissions → approval workflow)
- ✅ Complete type safety and error handling

### 🎯 Phase 3: Agent Extraction (Future)
**Goal**: Convert modules to standalone agents without code changes

**Planned Process:**
1. Extract Kubernetes module → Kubernetes Agent
2. Extract Safety module → Security Agent  
3. Extract Approval module → Workflow Agent
4. Extract Audit module → Observability Agent

**Zero-Refactoring Migration:**
- Copy module code to new agent projects
- Add network communication layer
- Update primary agent to use network calls
- Deploy agents independently

**Benefits:**
- Independent scaling per agent
- Isolated failures and updates
- Specialized optimization per agent

### 🚀 Phase 4: Advanced Agent Ecosystem (Future)
**Goal**: Full multi-agent platform with self-improvement

**Planned Agents:**
- Cost Optimization Agent: Cloud billing analysis and recommendations
- Compliance Agent: GDPR, SOC2, regulatory compliance automation
- Developer Productivity Agent: Code suggestions, tooling recommendations  
- Project Wizard Agent: Automated project scaffolding
- Incident Simulation Agent: Chaos engineering and resilience testing

**Advanced Features:**
- Self-improving pattern recognition
- Proactive optimization and alerting
- Advanced multi-tenancy and enterprise features

## Key Usage Patterns

### Natural Language Operations
```bash
# Deployment
"Deploy my user-auth service to staging with PostgreSQL"
# → Short: ✅ Successfully deployed user-auth to staging
# → Details: Pod status, replica counts, monitoring commands

# Scaling  
"Scale my api-gateway to handle 5000 users"
# → Short: ✅ Successfully scaled api-gateway to 5 replicas  
# → Details: Scaling timeline, monitoring commands, expected capacity

# Troubleshooting
"Why is my payment-service responding slowly?"
# → Short: ✅ Retrieved status for payment-service
# → Details: Pod health, resource usage, error logs, troubleshooting steps

# Status
"Show me the health of all my production services"
# → Short: ✅ Listed resources for production
# → Details: Service health matrix, resource utilization, issue summary
```

### Approval Workflows
1. Developer makes request via chat/Slack/CLI
2. AI validates request and assesses risk
3. For medium/high risk: Approval request sent to Slack
4. Approver reviews change preview and rollback plan
5. On approval: AI executes operation safely
6. Complete audit trail maintained

### Module Development
```typescript
// Adding new module capabilities with rich response formatting
class KubernetesModule extends BaseModule {
    capabilities = ['deploy', 'scale', 'status', 'logs', 'rollback'];
    
    async handleStatus(params: any): Promise<ModuleResponse> {
        // Execute Kubernetes operation
        const result = await this.k8sApi.readNamespacedDeployment(/*...*/);
        
        // Module owns its response formatting
        return this.createFormattedResponse(
            true,
            `Status for ${resourceName} in namespace ${namespace}`,
            { deployment: result.body, pods, replicas },
            'status',
            resourceName,
            namespace
        );
        // Returns: { message, detailedResponse, data, metadata }
        // detailedResponse = rich markdown with pod status, health, etc.
    }
    
    // When extracted to agent: zero code changes needed
    // Modules are self-contained with their formatting logic
}
```

## Important Notes

- **Defensive Security Only**: This platform is designed for defensive security tasks only
- **Use `awslocal`**: For LocalStack AWS resources in local development  
- **Safety First**: All operations include comprehensive safety validation
- **Human Oversight**: Critical operations require human approval
- **Audit Everything**: Complete audit trail for compliance
- **LLM Flexibility**: Easy switching between AI providers
- **Zero Vendor Lock-in**: Provider-agnostic architecture

## Getting Started

1. **Read Phase-specific README.md**: Check current phase documentation
2. **Setup Environment**: Follow installation commands above
3. **Understand Architecture**: Review core modules and AI integration
4. **Start Development**: Begin with current phase requirements

The platform delivers revolutionary developer experience through AI while maintaining enterprise-grade safety, security, and compliance.