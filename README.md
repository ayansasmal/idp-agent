# AI-Powered Integrated Developer Platform

> **Current Phase: Phase 3.2 Complete - Multi-Agent Architecture + Shared Utilities Library**

## Overview

This project builds a revolutionary AI-powered platform where developers use natural language to manage infrastructure instead of learning complex platform abstractions.

**What makes this different:**
- 🤖 **Multi-Agent Architecture**: Meta-Agent orchestrates specialized domain agents
- 💬 **Natural Language**: "Deploy my Node.js app with PostgreSQL" → Done
- ⚡ **Shared Utilities**: Consistent HTTP, logging, errors, validation across all agents
- ✅ **Smart Validation**: AI-powered parameter validation with helpful prompting
- 🛡️ **Safety-First**: Human approval + comprehensive validation for all changes
- 📊 **Complete Audit**: Enterprise-grade compliance and audit trails
- 🔄 **Self-Improving**: AI learns organizational patterns over time

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Anthropic Claude API key
- Kubernetes access (local or remote)

### Installation
```bash
# Clone repository
git clone <repository>
cd ai-idp-modular

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start local services
docker-compose up -d

# Setup database
npx prisma migrate dev
npx prisma generate

# Setup DynamoDB tables for approvals and chat sessions
./scripts/create-dynamodb-tables.sh

# Start development with PID tracking
npm run dev
```

### First Conversation
```bash
# Start the web application (includes built-in mock agent)
cd packages/web-app
npm run dev

# Open the web interface
open http://localhost:3002

# Try natural language operations:
# - "Deploy my Node.js app to staging"  
# - "Scale my payment service to 5 replicas"
# - "Show me production service status"

# The AI will guide you if information is missing:
# - "deploy something" → "I need the container image. Example: nginx:latest"
# - "scale api-gateway" → "I need to know how many replicas. Example: 3, 5, 10"
```

**Note**: The web application now includes the **real PrimaryAgent** from the core package. Full integration is complete and operational.

## ✅ Phase 3.4 Complete - Multi-Agent Architecture + Process Management

### 🏗️ Multi-Agent Architecture ✅
- [x] **Meta-Agent**: Intelligent orchestrator with context management
- [x] **Infrastructure Agent**: Kubernetes and cloud operations specialist  
- [x] **MCP Communication**: Model Context Protocol for agent-to-agent communication
- [x] **Qdrant Integration**: Vector database for shared context and learning
- [x] **Process Management**: Complete PID tracking and service lifecycle management
- [x] **Environment Configuration**: .env-based port and service configuration
- [x] **Graceful Shutdown**: Clean service termination and cleanup

### 🌐 Web Application ✅
- [x] **Next.js 15.4.6** with App Router and React 19
- [x] **Tailwind CSS v4** for modern styling
- [x] **TanStack Query** for server state management
- [x] **TypeScript + Zod** for full type safety

### 💬 Chat Interface ✅
- [x] Natural language interaction with AI agent
- [x] **Smart Parameter Prompting**: AI guides users when information is missing
- [x] **Dual-Response System**: Short status + rich detailed content
- [x] **Expandable Markdown**: Pod status, replica counts, health conditions
- [x] **Interactive JSON Viewer**: Copy, export, and explore raw data
- [x] **Namespace Selection**: Smart dropdowns for multi-namespace clusters
- [x] Real-time message display with approval indicators
- [x] Error handling and loading states
- [x] Mobile-responsive design
- [x] Direct links to approval workflows

### 🔐 Approval Workflow ✅
- [x] **Risk-based routing** (low/medium/high/critical)
- [x] **Execution halting** - Operations stop when approval required (no unauthorized execution)
- [x] **DynamoDB persistence** - Approval requests persist across chat sessions
- [x] **Permission-based triggers** - Missing permissions automatically create approval workflows
- [x] **Human review system** with detailed approval cards
- [x] **Approval actions** (approve/reject/delete with notes)
- [x] **Real-time status** updates with optimistic UI
- [x] **Filtering and tracking** by approval state
- [x] **Complete audit trail** for compliance

### 🔧 Production Systems ✅
- [x] **RESTful API** endpoints for all operations
- [x] **Automatic approval creation** for high-risk operations
- [x] **Full CRUD operations** for approval management
- [x] **End-to-end testing** and validation
- [x] **Production-ready build** system

## Architecture

### Multi-Agent System (Current)
**Meta-Agent** orchestrates specialized **Focused Agents**:

```
🧠 Meta-Agent (Port 3000)
├── Intent Classification
├── Agent Routing  
├── Response Coordination
└── Context Management (Qdrant)

🔧 Infrastructure Agent (Port 3003) 
├── Kubernetes Operations
├── Cloud Provisioning
├── MCP Server (SSE)
└── Resource Management

🌐 Web Application (Port 3002)
├── Chat Interface
├── Approval Dashboard
├── HTTP Client to Meta-Agent
└── Real-time UI Updates
```

### Key Architecture Benefits
- **Distributed Agents**: Each agent runs independently with MCP communication
- **Shared Intelligence**: Qdrant vector database for cross-agent context
- **Process Management**: Complete PID tracking and service lifecycle control
- **Environment Configuration**: Single .env file controls all service ports
- **Graceful Operations**: Clean startup, monitoring, and shutdown
- **HTTP Communication**: Web app connects to Meta-Agent via REST API

## Development

### Project Structure
```
packages/
├── meta-agent/           # 🧠 Meta-Agent (Orchestrator)
│   ├── src/agent/       # Meta-Agent coordinator  
│   ├── src/ai/          # LLM abstraction layer
│   ├── src/routing/     # Intent classification & agent routing
│   └── src/context/     # Qdrant integration & context management
├── agents/              # 🔧 Focused Agents (Domain Specialists)
│   └── infrastructure/  # Infrastructure Agent (MCP Server)
├── shared/              # 📚 Shared Libraries
│   ├── mcp-client/      # MCP client SDK
│   ├── qdrant-client/   # Qdrant vector database client
│   ├── types/           # Shared TypeScript definitions
│   └── utils/           # Common utilities (HTTP, logging, errors)
├── web-app/             # 🌐 Next.js Web Interface
│   ├── src/app/         # App Router pages & API routes
│   ├── src/components/  # React components (Chat, Approvals)  
│   └── src/lib/         # Web app utilities
└── scripts/             # 🛠️ Process Management
    ├── process-manager.js # PID tracking and service lifecycle
    ├── cleanup.sh       # Emergency cleanup script
    └── README.md        # Process management documentation
```

### Available Scripts

#### 🚀 Process Management (Recommended)
```bash
npm run dev              # Start all services with PID tracking
npm run stop             # Gracefully stop all services  
npm run status           # Show service status and ports
npm run restart          # Stop and restart all services
npm run cleanup          # Emergency cleanup of stuck processes
```

#### 🔧 Development Scripts
```bash
# Legacy startup (without PID tracking)
npm run dev:legacy       # Start with concurrently (old method)

# Individual services
npm run dev:meta-agent       # Start Meta-Agent only
npm run dev:infrastructure   # Start Infrastructure Agent only
npm run dev:web             # Start Web App only

# Build and maintenance
npm run build            # Build all packages
npm run test             # Run all tests
npm run lint             # Lint all packages
npm run type-check       # TypeScript validation
npm run health           # Check agent health status
```

#### 📊 Process Tracking
The new process management system tracks:
- **PIDs**: All service process IDs in `.pids.json`
- **Ports**: Which service uses which port
- **Status**: Real-time process and port status
- **Lifecycle**: Clean startup, monitoring, and shutdown

See `scripts/README.md` for detailed process management documentation.

### Environment Variables
```bash
# Service Ports (configurable)
META_AGENT_PORT=3000
INFRASTRUCTURE_AGENT_PORT=3003  
WEB_PORT=3002

# Service URLs (for cross-service communication)
META_AGENT_URL=http://localhost:3000
INFRASTRUCTURE_AGENT_URL=http://localhost:3003

# AI Configuration
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_fallback_key
AI_PRIMARY_PROVIDER=anthropic

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ai_idp
REDIS_URL=redis://localhost:6379
QDRANT_URL=your_qdrant_cloud_url
QDRANT_API_KEY=your_qdrant_api_key

# DynamoDB (for approval persistence)
AWS_REGION=us-east-1
AWS_ENDPOINT=http://localhost:4566
APPROVALS_TABLE_NAME=ai-idp-approvals

# Kubernetes
KUBECONFIG=~/.kube/config

# Slack (optional)
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
```

## Usage Examples

### 🌐 Web Interface (Primary)
Visit **http://localhost:3002** for the complete experience:

**Chat Interface** (`/chat`):
```
👤 "Show me the status of my nginx deployment"
🤖 "✅ Successfully retrieved status for nginx"

   [📊 View Details] ← Click to expand
   
   ## 🚀 Deployment Status
   **Service:** nginx
   **Namespace:** default  
   **Replicas:** 3/3 ready (3 available)
   
   ### 📊 Pod Status
   - nginx-abc123: Running ✅
   - nginx-def456: Running ✅ 
   - nginx-ghi789: Running ✅
   
   ### ⚙️ Deployment Details
   - Strategy: RollingUpdate
   - Image: nginx:latest
   
   [🔍 Raw Data] ← JSON viewer with copy/export
```

**Approval Dashboard** (`/approvals`):
- View all pending, approved, and rejected requests
- Detailed approval cards with risk assessment
- One-click approve/reject with review notes
- Complete audit trail and status tracking

### 🔄 Complete Approval Workflow
1. **Natural Language Request**: Developer types in chat interface
2. **AI Risk Assessment**: Automatic risk classification (low/medium/high/critical)
3. **Approval Creation**: High-risk operations automatically create approval requests
4. **Human Review**: Reviewers see detailed context, impact assessment, rollback plans
5. **Decision & Execution**: Approve/reject with notes, complete audit trail
6. **Status Tracking**: Real-time updates across all interfaces

### 📝 Example Operations

#### ✅ Complete Operations (Auto-execute)
```bash
"Show me the status of my nginx deployment"
"Get logs for my api-gateway"
"Deploy nginx:latest to staging"
"Scale my payment-service to 3 replicas"
```

#### 🤔 Incomplete Operations (AI Prompts for Info)
```bash
User: "deploy something"
AI: "I need some additional information to proceed with your request.

**Container Image**: The container image to deploy (optional if using existing deployment)
*Example: nginx:latest, myapp:v1.2.3*

You can provide the missing information like: 'Deploy nginx:latest'"

User: "scale api-gateway"  
AI: "I need to know how many replicas. Example: 3, 5, 10"

User: "delete nginx"
AI: "I need confirmation to delete this resource.
*Example: yes, confirm, I understand*"
```

#### 🚨 High Risk Operations (Required Approval)
```bash
"Deploy to production" → Creates approval request
"Delete my database" → Creates approval request  
"Scale down critical services" → Creates approval request
```

### Development Workflow
```typescript
// Adding new capabilities to modules
class KubernetesModule extends BaseModule {
    capabilities = ['deploy', 'scale', 'status', 'logs', 'rollback'];
    
    async process(request: ModuleRequest): Promise<ModuleResponse> {
        // Module logic - will become agent logic in Phase 2
        // Zero refactoring needed for extraction
    }
}
```

## ✅ Testing & Validation

### End-to-End Workflow Tested
```bash
# 1. Health Check
curl http://localhost:3002/api/agent
# → {"status":"healthy","agentReady":true}

# 2. Chat Request (High Risk)
curl -X POST http://localhost:3002/api/agent \
  -d '{"messages":[{"role":"user","content":"Deploy payment-service to production"}]}'
# → Creates approval, returns approval ID

# 3. Approval Management
curl http://localhost:3002/api/approvals
# → Lists all approvals including the new one

# 4. Approve Request
curl -X PATCH "http://localhost:3002/api/approvals?id=APR-123" \
  -d '{"state":"APPROVED","reviewNotes":"Approved for production"}'
# → Updates approval status with audit trail
```

### UI Components Tested
- ✅ **Chat Interface**: Message display, loading states, error handling
- ✅ **Approval Cards**: Rich detail view, action buttons, status indicators  
- ✅ **Navigation**: Seamless routing between chat and approvals
- ✅ **Responsive Design**: Mobile and desktop compatibility
- ✅ **Real-time Updates**: Optimistic UI with server state sync

## 🚀 Deployment

### Local Development
```bash
# Start the web application with real core agent
cd packages/web-app
npm install
npm run dev              # Starts core agent + web app on http://localhost:3002

# OR start standalone (embedded agent)
npm run dev:standalone   # Web app with embedded core agent

# Environment setup (optional)
cp .env.example .env.local
# Add ANTHROPIC_API_KEY for real AI integration
```

### Production Deployment
```bash
# Build for production
cd packages/web-app
npm run build            # Creates optimized production build
npm run start            # Starts production server

# Or deploy to platforms like Vercel, Netlify, AWS
# The app is a standard Next.js application
```

### Docker Deployment
```bash
# Build Docker image
docker build -t ai-idp-web packages/web-app

# Run container
docker run -p 3002:3002 ai-idp-web
```

## Contributing

### Adding New Module Capabilities
1. Add method to appropriate module class
2. Update module capabilities array
3. Add mandatory parameters to PrimaryAgent validation
4. Add validation logic in safety module
5. Add tests for new functionality
6. Update documentation

### Module Development Guidelines
- **Self-contained**: Each module should have all its dependencies
- **Extraction-ready**: Design for future agent extraction
- **Parameter validation**: Define mandatory parameters and validation logic
- **Safety-first**: Always validate before executing
- **Audit everything**: Log all actions for compliance

## Security

- **Defensive Security Only**: Platform designed for defensive security tasks
- **Parameter Validation**: All operations validated for completeness before execution
- **Human Oversight**: All medium/high-risk operations require approval
- **Complete Audit Trail**: Every action logged for compliance
- **Secure by Default**: Safety validation for all operations
- **Zero Secrets Exposure**: Secure secrets management

## Support

- **Documentation**: See CLAUDE.md for comprehensive guidance
- **Issues**: Create GitHub issues for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Security**: Email security@company.com for security issues

## 🗺️ Phase Roadmap

- ✅ **Phase 1 (Complete)**: Core modular agent architecture with AI integration
- ✅ **Phase 2 (Complete)**: Production-ready web application with approval workflow  
- ✅ **Phase 3 (Complete)**: Multi-agent architecture with MCP communication
- ✅ **Phase 3.4 (Complete)**: Process management and environment configuration
- ✅ **Phase 3.5 (Complete)**: Port configuration and service communication fixes
- 🎯 **Phase 4 (Next)**: Additional focused agents (Security, Workflow, Observability)
- 🚀 **Phase 5 (Future)**: Self-improving agent ecosystem with advanced intelligence

## 📈 Current Status

**🎉 Phase 3.5 Complete - Multi-Agent Architecture + Port Communication Fixed!**

✅ **Multi-Agent System**: Meta-Agent + Infrastructure Agent with MCP communication  
✅ **Port Configuration**: All services running on correct configured ports (3000, 3002, 3003)
✅ **Process Management**: Complete PID tracking and service lifecycle control  
✅ **Environment Configuration**: Single .env file controls all service ports  
✅ **Service Communication**: Fixed port mismatches preventing agent registration
✅ **Timeout Protection**: Graceful handling of agent registration failures
✅ **Shared Intelligence**: Qdrant vector database for cross-agent context  
✅ **Web Application**: HTTP client connecting to distributed agents  
✅ **Graceful Operations**: Clean startup, monitoring, and shutdown  

**🌐 Live Demo**: http://localhost:3002  
**🚀 Process Management**: `npm run dev` | `npm run status` | `npm run stop`

## 📚 Documentation

- **Technical Details**: See [CLAUDE.md](./CLAUDE.md) for comprehensive technical guidance
- **Web App Summary**: See [WEB_APP_SUMMARY.md](./WEB_APP_SUMMARY.md) for detailed feature overview
- **API Documentation**: Available at `/api/` endpoints with OpenAPI specs

## License

[License Type] - See LICENSE file for details.

---

**Status**: ✅ **Phase 3.5 Complete - Multi-Agent Architecture + Port Communication Fixed**  
**Current Focus**: Operational multi-agent system with proper service communication  
**URL**: http://localhost:3002  
**Process Management**: See `scripts/README.md` for complete documentation