# AI-Powered Integrated Developer Platform

> **Current Phase: Phase 1 - Modular Single Agent (Weeks 1-8)**

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
# Start the agent
npm run dev:core

# In another terminal, try the CLI
npm run cli "Deploy my hello-world app to development"

# Or open the web interface
open http://localhost:3000
```

## Current Phase 1 Goals

### Week 1-2: Foundation ✅
- [x] Primary agent coordinator with AI core
- [x] LLM-agnostic interface (Anthropic primary, OpenAI fallback)
- [x] Base module interface and communication layer
- [x] Structured responses with function calling

### Week 3-4: Core Modules 🚧
- [ ] Kubernetes module (deploy, scale, status, logs)
- [ ] Safety module (validation, risk assessment, policies)
- [ ] Basic Slack approval integration
- [ ] Module communication and coordination

### Week 5-6: Interfaces 📋
- [ ] Approval module (human-in-the-loop workflows)
- [ ] Audit module (logging, metrics, compliance)
- [ ] Web interface and CLI
- [ ] Multi-interface coordination

### Week 7-8: Production Ready 📋
- [ ] Complete safety validation and approval workflows
- [ ] Monitoring, alerting, and observability
- [ ] Documentation and deployment automation
- [ ] End-to-end testing and validation

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
├── web-interface/        # React chat interface
├── slack-app/           # Slack integration
├── cli/                 # Command-line interface
└── api-server/          # REST API server
```

### Available Scripts
```bash
# Development
npm run dev              # Start all services
npm run dev:core         # Core agent only
npm run dev:web          # Web interface only
npm run dev:slack        # Slack app only

# Building
npm run build            # Build all packages
npm run build:core       # Build core only

# Testing
npm run test             # Run all tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only

# Quality
npm run lint             # Lint code
npm run type-check       # TypeScript validation
npm run format           # Format code
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

### Natural Language Operations
```bash
# Deploy applications
"Deploy my user-auth service to staging with PostgreSQL"
"Deploy my React app to production with auto-scaling"

# Scale resources
"Scale my api-gateway to handle 5000 concurrent users"
"Increase replicas for my worker-service to 10"

# Get status and logs
"Show me the health of all my production services"
"Get logs for my payment-service from the last hour"

# Troubleshooting
"Why is my order-service responding slowly?"
"Check if my database has enough resources"
```

### Approval Workflow
1. **Developer Request**: Make request via chat/Slack/CLI
2. **AI Validation**: AI validates and assesses risk level
3. **Human Approval**: Medium/high-risk operations sent to Slack for approval
4. **Safe Execution**: On approval, AI executes with monitoring
5. **Audit Trail**: Complete logging for compliance

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

## Testing

### Unit Tests
```bash
npm run test:unit
# Tests individual modules and components
```

### Integration Tests  
```bash
npm run test:integration
# Tests module communication and AI integration
```

### End-to-End Tests
```bash
npm run test:e2e
# Tests complete workflows with real services
```

## Deployment

### Local Development
```bash
docker-compose up -d     # PostgreSQL, Redis, LocalStack
npm run dev              # All services with hot reload
```

### Production Deployment
```bash
npm run build
npm run deploy           # Builds and deploys to Kubernetes
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

## Phase Roadmap

- **Phase 1 (Current)**: Modular Single Agent - Complete platform functionality
- **Phase 2 (Weeks 9-12)**: Agent Extraction - Zero-refactoring migration to distributed agents
- **Phase 3 (Weeks 13+)**: Advanced Ecosystem - New specialized agents and enterprise features

## License

[License Type] - See LICENSE file for details.

---

**Status**: Phase 1 in development  
**Next Milestone**: Core modules completion (Week 4)  
**Documentation**: See CLAUDE.md for complete technical details