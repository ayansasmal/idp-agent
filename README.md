# AI-Powered Integrated Developer Platform

> **Current Phase: Phase 2 Complete - Production-Ready Web Application + Approval Workflow**

## Overview

This project builds a revolutionary AI-powered platform where developers use natural language to manage infrastructure instead of learning complex platform abstractions.

**What makes this different:**
- 🤖 **AI-Agent-First**: The AI agent IS the platform interface
- 💬 **Natural Language**: "Deploy my Node.js app with PostgreSQL" → Done
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

# Start development
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
```

**Note**: The web application now includes the **real PrimaryAgent** from the core package. Full integration is complete and operational.

## ✅ Phase 2 Complete - Major Achievements

### 🏗️ Core Architecture ✅
- [x] Modular single agent with 4 self-contained modules
- [x] LLM-agnostic AI core (Anthropic Claude primary)
- [x] Zero-refactoring module extraction design
- [x] Production-ready error handling and logging

### 🌐 Web Application ✅
- [x] **Next.js 15.4.6** with App Router and React 19
- [x] **Tailwind CSS v4** for modern styling
- [x] **TanStack Query** for server state management
- [x] **TypeScript + Zod** for full type safety

### 💬 Chat Interface ✅
- [x] Natural language interaction with AI agent
- [x] Real-time message display with approval indicators
- [x] Error handling and loading states
- [x] Mobile-responsive design
- [x] Direct links to approval workflows

### 🔐 Approval Workflow ✅
- [x] **Risk-based routing** (low/medium/high/critical)
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

### Modular Single Agent
In Phase 1, we build **1 Primary Agent** with **4 self-contained modules**:

```
Primary Agent
├── Kubernetes Module      → Future: Kubernetes Agent
├── Safety Module          → Future: Security/Safety Agent  
├── Approval Module        → Future: Workflow Agent
└── Audit Module           → Future: Observability Agent
```

### Key Design Benefits
- **Fast Development**: Single codebase, method calls, shared state
- **Future-Proof**: Modules designed for zero-refactoring extraction
- **Full Functionality**: Complete platform capabilities in 8 weeks
- **Safety-First**: Comprehensive validation and human oversight

## Development

### Project Structure
```
packages/
├── core/                 # Main agent + modules
├── web-app/             # ✅ Next.js + React + Tailwind (COMPLETE)
│   ├── src/app/         # App Router pages & API routes
│   ├── src/components/  # React components (Chat, Approvals)  
│   └── src/lib/         # Utilities and types
├── slack-app/           # Slack integration (placeholder)
└── cli/                 # Command-line interface (placeholder)
```

### Available Scripts
```bash
# Web Application (Primary Interface)
cd packages/web-app
npm run dev              # Start Next.js app (http://localhost:3002)
npm run build            # Production build
npm run start            # Production server

# Core Agent (Backend)
cd packages/core  
npm run build            # Build core agent
npm run test             # Run tests
npm run lint             # Lint code
npm run type-check       # TypeScript validation

# Root Level
npm install              # Install all dependencies
npm run build            # Build all packages
```

### Environment Variables
```bash
# AI Configuration
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_fallback_key
AI_PRIMARY_PROVIDER=anthropic

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ai_idp
REDIS_URL=redis://localhost:6379

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
👤 "Deploy my payment-service to production with 5 replicas"
🤖 "Due to the high risk level of this operation, it requires human approval before execution.
   
   ⚠️ Approval Required: View approval details: Approval APR-12345"
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
```
✅ Low Risk (Auto-execute):
"Show me the status of my services"
"Get logs for my api-gateway"

⚠️ Medium Risk (Optional approval):
"Deploy my app to staging"
"Scale my service to 3 replicas"

🚨 High Risk (Required approval):
"Deploy to production"
"Delete my database"
"Scale down critical services"
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
3. Add validation logic in safety module
4. Add tests for new functionality
5. Update documentation

### Module Development Guidelines
- **Self-contained**: Each module should have all its dependencies
- **Extraction-ready**: Design for future agent extraction
- **Safety-first**: Always validate before executing
- **Audit everything**: Log all actions for compliance

## Security

- **Defensive Security Only**: Platform designed for defensive security tasks
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
- 🎯 **Phase 3 (Next)**: Agent extraction to distributed multi-agent system  
- 🚀 **Phase 4 (Future)**: Advanced ecosystem with specialized agents

## 📈 Current Status

**🎉 Phase 2 Complete - Production Ready!**

✅ **Web Application**: Next.js + React + Tailwind CSS  
✅ **Chat Interface**: Natural language platform operations  
✅ **Approval Workflow**: Human oversight with risk assessment  
✅ **API Integration**: RESTful endpoints with full CRUD  
✅ **End-to-End Testing**: Complete workflow validation  

**🌐 Live Demo**: http://localhost:3002

## 📚 Documentation

- **Technical Details**: See [CLAUDE.md](./CLAUDE.md) for comprehensive technical guidance
- **Web App Summary**: See [WEB_APP_SUMMARY.md](./WEB_APP_SUMMARY.md) for detailed feature overview
- **API Documentation**: Available at `/api/` endpoints with OpenAPI specs

## License

[License Type] - See LICENSE file for details.

---

**Status**: ✅ **Phase 2 Complete - Production Ready**  
**Current Focus**: Web application with approval workflow  
**URL**: http://localhost:3002  
**Documentation**: Complete technical implementation available