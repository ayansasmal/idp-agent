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

2. **Safety Module** → Security/Safety Agent
   - Policy compliance and risk assessment
   - Reality validation against platform state
   - Multi-layer safety checks

3. **Approval Module** → Workflow Agent
   - Human-in-the-loop approval workflows
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
│   ├── web-interface/           # React chat interface
│   ├── slack-app/               # Slack integration  
│   ├── cli/                     # Command-line interface
│   └── api-server/              # REST API server
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
npm run dev:web       # Start web interface
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
- **Risk Assessment**: Conservative risk evaluation
- **Human Approval**: Required for medium/high-risk operations
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

## Implementation Phases

### Phase 1: Modular Single Agent (Weeks 1-8)
**Goal**: Working AI-powered platform with all core functionality

**Week 1-2: Foundation**
- Primary agent coordinator with AI core
- Base module interface and communication layer
- Anthropic Claude integration with structured responses

**Week 3-4: Core Modules** 
- Kubernetes module (deploy, scale, status, logs)
- Safety module (validation, risk assessment, policies)
- Basic Slack approval integration

**Week 5-6: Interfaces**
- Approval module (human-in-the-loop workflows)
- Audit module (logging, metrics, compliance)
- Web interface and CLI

**Week 7-8: Production Ready**
- Complete safety validation and approval workflows
- Monitoring, alerting, and observability
- Documentation and deployment automation

**Deliverables:**
- ✅ Natural language platform operations
- ✅ Human approval for all changes  
- ✅ Complete audit trail
- ✅ Multi-interface access (web, Slack, CLI)
- ✅ Production deployment ready

### Phase 2: Agent Extraction (Weeks 9-12)
**Goal**: Convert modules to standalone agents without downtime

**Process:**
1. Extract Kubernetes module → Kubernetes Agent
2. Extract Safety module → Security Agent  
3. Extract Approval module → Workflow Agent
4. Extract Audit module → Observability Agent

**Zero-Refactoring Migration:**
- Copy module code to new agent project
- Add network communication layer
- Update primary agent to use network calls
- Deploy agents independently

**Benefits:**
- Independent scaling per agent
- Isolated failures and updates
- Specialized optimization per agent

### Phase 3: Advanced Agent Ecosystem (Weeks 13+)
**Goal**: Full multi-agent platform with self-improvement

**New Specialized Agents:**
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

# Scaling  
"Scale my api-gateway to handle 5000 users"

# Troubleshooting
"Why is my payment-service responding slowly?"

# Status
"Show me the health of all my production services"
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
// Adding new module capabilities
class KubernetesModule extends BaseModule {
    capabilities = ['deploy', 'scale', 'status', 'logs', 'rollback'];
    
    async process(request: ModuleRequest): Promise<ModuleResponse> {
        // Module logic here
        // When extracted to agent: zero code changes needed
    }
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