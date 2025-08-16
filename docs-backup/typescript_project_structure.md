# TypeScript Project Structure for Module-to-Agent Extraction

## Complete Project Structure

```
ai-idp-modular/
├── package.json                     # Root package.json (workspace)
├── pnpm-workspace.yaml             # Workspace configuration
├── tsconfig.base.json               # Base TypeScript configuration
├── .eslintrc.js                     # ESLint configuration
├── .prettierrc                      # Prettier configuration
├── vitest.workspace.ts              # Vitest workspace configuration
├── .env.example                     # Environment variables template
├── .gitignore                       # Git ignore rules
├── docker-compose.yml               # Local development services
├── README.md                        # Project documentation
│
├── packages/                        # Main packages (monorepo)
│   ├── core/                       # Core agent package
│   │   ├── package.json            # Core package dependencies
│   │   ├── tsconfig.json           # Core TypeScript config
│   │   ├── vitest.config.ts        # Core testing config
│   │   ├── src/
│   │   │   ├── index.ts            # Public API exports
│   │   │   ├── agent/              # Primary agent implementation
│   │   │   │   ├── PrimaryAgent.ts # Main agent coordinator
│   │   │   │   ├── coordination.ts # Request coordination logic
│   │   │   │   └── communication.ts # Module communication layer
│   │   │   ├── ai/                 # AI Core implementation
│   │   │   │   ├── AICore.ts       # LLM-agnostic AI core
│   │   │   │   ├── PlatformAI.ts   # Platform-specific AI operations
│   │   │   │   ├── providers/      # LLM provider implementations
│   │   │   │   │   ├── BaseAIProvider.ts
│   │   │   │   │   ├── AnthropicProvider.ts
│   │   │   │   │   ├── OpenAIProvider.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── validation/     # Response validation
│   │   │   │       ├── StructuredResponseValidator.ts
│   │   │   │       └── schemas.ts
│   │   │   ├── modules/            # Module implementations
│   │   │   │   ├── base/           # Base module interface
│   │   │   │   │   ├── BaseModule.ts
│   │   │   │   │   ├── protocols.ts
│   │   │   │   │   ├── types.ts
│   │   │   │   │   └── exceptions.ts
│   │   │   │   ├── kubernetes/     # → Future Kubernetes Agent
│   │   │   │   │   ├── index.ts    # KubernetesModule main class
│   │   │   │   │   ├── operations/ # K8s operations
│   │   │   │   │   │   ├── deploy.ts
│   │   │   │   │   │   ├── scale.ts
│   │   │   │   │   │   ├── status.ts
│   │   │   │   │   │   ├── logs.ts
│   │   │   │   │   │   └── rollback.ts
│   │   │   │   │   ├── client/     # K8s client wrapper
│   │   │   │   │   │   ├── KubernetesClient.ts
│   │   │   │   │   │   ├── connection.ts
│   │   │   │   │   │   └── auth.ts
│   │   │   │   │   ├── validation/ # K8s validation
│   │   │   │   │   │   ├── resourceValidator.ts
│   │   │   │   │   │   ├── quotaChecker.ts
│   │   │   │   │   │   └── rbacValidator.ts
│   │   │   │   │   ├── templates/  # Manifest templates
│   │   │   │   │   │   ├── deployment.ts
│   │   │   │   │   │   ├── service.ts
│   │   │   │   │   │   ├── ingress.ts
│   │   │   │   │   │   └── generator.ts
│   │   │   │   │   ├── monitoring/ # Deployment monitoring
│   │   │   │   │   │   ├── healthChecker.ts
│   │   │   │   │   │   └── progressTracker.ts
│   │   │   │   │   └── agent-config.ts # Future agent configuration
│   │   │   │   ├── safety/         # → Future Security Agent
│   │   │   │   │   ├── index.ts    # SafetyValidationModule
│   │   │   │   │   ├── policy/     # Policy engine
│   │   │   │   │   │   ├── PolicyEngine.ts
│   │   │   │   │   │   ├── rules.ts
│   │   │   │   │   │   └── evaluator.ts
│   │   │   │   │   ├── risk/       # Risk assessment
│   │   │   │   │   │   ├── RiskAssessor.ts
│   │   │   │   │   │   ├── calculator.ts
│   │   │   │   │   │   └── impact.ts
│   │   │   │   │   ├── reality/    # Reality validation
│   │   │   │   │   │   ├── RealityChecker.ts
│   │   │   │   │   │   └── stateValidator.ts
│   │   │   │   │   ├── compliance/ # Compliance checking
│   │   │   │   │   │   ├── ComplianceChecker.ts
│   │   │   │   │   │   └── standards.ts
│   │   │   │   │   └── agent-config.ts
│   │   │   │   ├── approval/       # → Future Workflow Agent
│   │   │   │   │   ├── index.ts    # ApprovalWorkflowModule
│   │   │   │   │   ├── workflow/   # Workflow engine
│   │   │   │   │   │   ├── WorkflowEngine.ts
│   │   │   │   │   │   ├── states.ts
│   │   │   │   │   │   └── transitions.ts
│   │   │   │   │   ├── slack/      # Slack integration
│   │   │   │   │   │   ├── SlackIntegration.ts
│   │   │   │   │   │   ├── handlers.ts
│   │   │   │   │   │   ├── blocks.ts
│   │   │   │   │   │   └── client.ts
│   │   │   │   │   ├── routing/    # Approval routing
│   │   │   │   │   │   ├── ApprovalRouter.ts
│   │   │   │   │   │   ├── escalation.ts
│   │   │   │   │   │   └── delegation.ts
│   │   │   │   │   ├── notifications/ # Notification system
│   │   │   │   │   │   ├── NotificationService.ts
│   │   │   │   │   │   ├── channels.ts
│   │   │   │   │   │   └── templates.ts
│   │   │   │   │   └── agent-config.ts
│   │   │   │   └── audit/          # → Future Observability Agent
│   │   │   │       ├── index.ts    # AuditModule
│   │   │   │       ├── logging/    # Audit logging
│   │   │   │       │   ├── AuditLogger.ts
│   │   │   │       │   ├── storage.ts
│   │   │   │       │   └── formatter.ts
│   │   │   │       ├── metrics/    # Metrics collection
│   │   │   │       │   ├── MetricsCollector.ts
│   │   │   │       │   ├── collectors.ts
│   │   │   │       │   └── aggregator.ts
│   │   │   │       ├── compliance/ # Compliance reporting
│   │   │   │       │   ├── ComplianceReporter.ts
│   │   │   │       │   ├── reports.ts
│   │   │   │       │   └── exporters.ts
│   │   │   │       ├── alerting/   # Audit alerting
│   │   │   │       │   ├── AlertManager.ts
│   │   │   │       │   └── rules.ts
│   │   │   │       └── agent-config.ts
│   │   │   ├── shared/             # Shared utilities
│   │   │   │   ├── config/         # Configuration management
│   │   │   │   │   ├── ConfigManager.ts
│   │   │   │   │   ├── validation.ts
│   │   │   │   │   └── types.ts
│   │   │   │   ├── database/       # Database connections
│   │   │   │   │   ├── DatabaseManager.ts
│   │   │   │   │   ├── connection.ts
│   │   │   │   │   ├── migrations.ts
│   │   │   │   │   └── models/
│   │   │   │   ├── logger/         # Logging utilities
│   │   │   │   │   ├── Logger.ts
│   │   │   │   │   ├── formatters.ts
│   │   │   │   │   └── transports.ts
│   │   │   │   ├── cache/          # Caching utilities
│   │   │   │   │   ├── CacheManager.ts
│   │   │   │   │   └── redis.ts
│   │   │   │   ├── errors/         # Error handling
│   │   │   │   │   ├── exceptions.ts
│   │   │   │   │   ├── handlers.ts
│   │   │   │   │   └── types.ts
│   │   │   │   └── utils/          # General utilities
│   │   │   │       ├── crypto.ts
│   │   │   │       ├── validation.ts
│   │   │   │       ├── async.ts
│   │   │   │       └── types.ts
│   │   │   └── types/              # Global type definitions
│   │   │       ├── agent.ts
│   │   │       ├── modules.ts
│   │   │       ├── platform.ts
│   │   │       └── index.ts
│   │   └── tests/                  # Core package tests
│   │       ├── unit/               # Unit tests
│   │       ├── integration/        # Integration tests
│   │       ├── fixtures/           # Test fixtures
│   │       └── helpers/            # Test helpers
│   │
│   ├── web-interface/              # React frontend package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── main.tsx            # App entry point
│   │   │   ├── App.tsx             # Main App component
│   │   │   ├── components/         # React components
│   │   │   │   ├── chat/           # Chat interface
│   │   │   │   │   ├── ChatInterface.tsx
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageInput.tsx
│   │   │   │   │   └── MessageBubble.tsx
│   │   │   │   ├── approval/       # Approval interface
│   │   │   │   │   ├── ApprovalDashboard.tsx
│   │   │   │   │   ├── ApprovalCard.tsx
│   │   │   │   │   └── ApprovalActions.tsx
│   │   │   │   ├── audit/          # Audit interface
│   │   │   │   │   ├── AuditDashboard.tsx
│   │   │   │   │   ├── AuditTimeline.tsx
│   │   │   │   │   └── ComplianceReports.tsx
│   │   │   │   ├── layout/         # Layout components
│   │   │   │   │   ├── Header.tsx
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   └── Layout.tsx
│   │   │   │   └── common/         # Common components
│   │   │   │       ├── Button.tsx
│   │   │   │       ├── Modal.tsx
│   │   │   │       └── Loading.tsx
│   │   │   ├── services/           # API services
│   │   │   │   ├── api.ts          # API client
│   │   │   │   ├── websocket.ts    # WebSocket client
│   │   │   │   ├── chat.ts         # Chat service
│   │   │   │   └── approval.ts     # Approval service
│   │   │   ├── stores/             # State management
│   │   │   │   ├── chatStore.ts    # Chat state
│   │   │   │   ├── approvalStore.ts # Approval state
│   │   │   │   └── userStore.ts    # User state
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   │   ├── useChat.ts
│   │   │   │   ├── useApproval.ts
│   │   │   │   └── useWebSocket.ts
│   │   │   ├── types/              # TypeScript types
│   │   │   │   ├── api.ts
│   │   │   │   ├── chat.ts
│   │   │   │   └── approval.ts
│   │   │   └── styles/             # Styling
│   │   │       ├── globals.css
│   │   │       └── components.css
│   │   └── public/                 # Public assets
│   │
│   ├── slack-app/                  # Slack integration package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # Slack app entry point
│   │   │   ├── app.ts              # Slack Bolt app setup
│   │   │   ├── handlers/           # Slack event handlers
│   │   │   │   ├── commands.ts     # Slash commands
│   │   │   │   ├── actions.ts      # Interactive actions
│   │   │   │   ├── events.ts       # Event handlers
│   │   │   │   └── shortcuts.ts    # Shortcuts
│   │   │   ├── blocks/             # Slack Block Kit builders
│   │   │   │   ├── approval.ts     # Approval blocks
│   │   │   │   ├── status.ts       # Status blocks
│   │   │   │   └── chat.ts         # Chat blocks
│   │   │   ├── services/           # Slack services
│   │   │   │   ├── SlackService.ts
│   │   │   │   └── MessageBuilder.ts
│   │   │   └── types/              # Slack-specific types
│   │   │       ├── blocks.ts
│   │   │       └── events.ts
│   │   └── manifests/              # Slack app configuration
│   │       ├── app-manifest.json
│   │       └── install-guide.md
│   │
│   ├── cli/                        # CLI interface package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # CLI entry point
│   │   │   ├── cli.ts              # CLI setup
│   │   │   ├── commands/           # CLI commands
│   │   │   │   ├── deploy.ts
│   │   │   │   ├── scale.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── logs.ts
│   │   │   │   └── chat.ts
│   │   │   ├── services/           # CLI services
│   │   │   │   ├── CLIService.ts
│   │   │   │   └── OutputFormatter.ts
│   │   │   ├── config/             # CLI configuration
│   │   │   │   ├── ConfigManager.ts
│   │   │   │   └── auth.ts
│   │   │   └── types/              # CLI types
│   │   │       └── commands.ts
│   │   └── bin/                    # Executable scripts
│   │       └── idp-cli
│   │
│   └── api-server/                 # REST API server package
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts            # Server entry point
│       │   ├── server.ts           # Fastify server setup
│       │   ├── routes/             # API routes
│       │   │   ├── chat.ts         # Chat endpoints
│       │   │   ├── approval.ts     # Approval endpoints
│       │   │   ├── status.ts       # Status endpoints
│       │   │   ├── audit.ts        # Audit endpoints
│       │   │   └── health.ts       # Health check
│       │   ├── middleware/         # API middleware
│       │   │   ├── auth.ts         # Authentication
│       │   │   ├── validation.ts   # Request validation
│       │   │   ├── logging.ts      # Request logging
│       │   │   └── rateLimit.ts    # Rate limiting
│       │   ├── services/           # API services
│       │   │   ├── AgentService.ts # Core agent interface
│       │   │   └── WebSocketService.ts # WebSocket handling
│       │   ├── schemas/            # Request/response schemas
│       │   │   ├── chat.ts
│       │   │   ├── approval.ts
│       │   │   └── common.ts
│       │   └── types/              # API types
│       │       ├── requests.ts
│       │       └── responses.ts
│       └── docs/                   # API documentation
│           └── openapi.yaml
│
├── tools/                          # Development and extraction tools
│   ├── agent-extractor/            # Module → Agent extraction
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── extractor.ts        # Main extraction logic
│   │   │   ├── analyzer.ts         # Dependency analysis
│   │   │   ├── generator.ts        # Code generation
│   │   │   ├── templates/          # Agent templates
│   │   │   │   ├── agent-main.ts.hbs
│   │   │   │   ├── package.json.hbs
│   │   │   │   ├── dockerfile.hbs
│   │   │   │   ├── k8s-manifest.hbs
│   │   │   │   └── network-layer.ts.hbs
│   │   │   ├── migration/          # Migration utilities
│   │   │   │   ├── NetworkMigrator.ts
│   │   │   │   └── ConfigMigrator.ts
│   │   │   └── validation/         # Extraction validation
│   │   │       ├── ExtractionValidator.ts
│   │   │       └── tests.ts
│   │   └── cli/                    # Extraction CLI
│   │       └── extract-agent.ts
│   │
│   ├── deployment/                 # Deployment utilities
│   │   ├── scripts/               # Deployment scripts
│   │   │   ├── deploy-single.sh   # Single agent deployment
│   │   │   ├── deploy-multi.sh    # Multi-agent deployment
│   │   │   └── migrate-agents.sh  # Agent migration
│   │   ├── terraform/             # Infrastructure as Code
│   │   │   ├── aws/
│   │   │   ├── gcp/
│   │   │   └── azure/
│   │   └── kubernetes/            # K8s manifests
│   │       ├── single-agent/      # Phase 1 deployment
│   │       ├── multi-agent/       # Phase 2 deployment
│   │       └── monitoring/        # Monitoring stack
│   │
│   └── testing/                   # Testing utilities
│       ├── fixtures/              # Test fixtures
│       ├── mocks/                 # Mock implementations
│       ├── integration/           # Integration test utilities
│       └── performance/           # Performance testing
│
├── docs/                          # Project documentation
│   ├── api/                       # API documentation
│   ├── modules/                   # Module documentation
│   ├── extraction/                # Extraction guides
│   ├── deployment/                # Deployment guides
│   └── examples/                  # Usage examples
│
├── prisma/                        # Database schema and migrations
│   ├── schema.prisma             # Database schema
│   ├── migrations/               # Database migrations
│   └── seed.ts                   # Database seeding
│
├── k8s/                          # Kubernetes manifests
│   ├── base/                     # Base configurations
│   ├── overlays/                 # Environment overlays
│   │   ├── development/
│   │   ├── staging/
│   │   └── production/
│   └── monitoring/               # Monitoring stack
│
└── docker/                       # Docker configurations
    ├── Dockerfile.core           # Core agent image
    ├── Dockerfile.web            # Web interface image
    ├── Dockerfile.slack          # Slack app image
    ├── Dockerfile.cli            # CLI image
    └── Dockerfile.api            # API server image
```

## Key Design Principles for Module Extraction

### 1. Self-Contained Modules
Each module directory contains everything needed to become a standalone agent:

```typescript
// modules/kubernetes/agent-config.ts
export const kubernetesAgentConfig = {
    name: 'kubernetes-agent',
    version: '1.0.0',
    description: 'Kubernetes operations agent',
    dependencies: [
        '@kubernetes/client-node',
        'js-yaml',
        'zod'
    ],
    ports: {
        http: 3001,
        metrics: 9001
    },
    healthCheck: '/health',
    capabilities: [
        'deploy_application',
        'scale_resources',
        'get_status',
        'get_logs',
        'delete_resource',
        'rollback_deployment'
    ],
    // Configuration for when this becomes a standalone agent
    networkInterface: {
        protocol: 'http',
        authentication: 'jwt',
        rateLimit: '100/minute'
    }
};
```

### 2. Standardized Module Interface
All modules implement the same interface for consistent extraction:

```typescript
// modules/base/BaseModule.ts
export abstract class BaseModule {
    abstract readonly config: AgentConfig;
    abstract readonly capabilities: string[];
    
    // Core module interface
    abstract process(request: ModuleRequest): Promise<ModuleResponse>;
    abstract validate(request: ModuleRequest): Promise<ValidationResult>;
    abstract healthCheck(): Promise<HealthStatus>;
    
    // Extraction-ready methods
    abstract getNetworkInterface(): NetworkInterface;
    abstract getDependencies(): string[];
    abstract getDeploymentConfig(): DeploymentConfig;
    
    // Module lifecycle
    async initialize(): Promise<void> {
        // Module initialization logic
    }
    
    async shutdown(): Promise<void> {
        // Cleanup logic
    }
}
```

### 3. Zero-Refactoring Extraction Template
The extraction tool uses templates to create agents without changing module code:

```typescript
// tools/agent-extractor/templates/agent-main.ts.hbs
import { {{moduleClass}} } from './modules/{{moduleName}}';
import { AgentServer } from './network/AgentServer';
import { Logger } from './utils/Logger';

class {{agentName}} {
    private module: {{moduleClass}};
    private server: AgentServer;
    private logger: Logger;
    
    constructor() {
        this.module = new {{moduleClass}}();
        this.server = new AgentServer(this.module);
        this.logger = new Logger('{{agentName}}');
    }
    
    async start(): Promise<void> {
        await this.module.initialize();
        await this.server.start();
        this.logger.info('Agent started', { 
            agent: '{{agentName}}',
            port: {{port}},
            capabilities: this.module.capabilities 
        });
    }
    
    async stop(): Promise<void> {
        await this.server.stop();
        await this.module.shutdown();
        this.logger.info('Agent stopped');
    }
}

// Start the agent
const agent = new {{agentName}}();
agent.start().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', () => agent.stop());
process.on('SIGINT', () => agent.stop());
```

## Benefits of This Structure

### 1. Monorepo Advantages
- **Shared dependencies** and consistent versions across packages
- **Cross-package refactoring** with TypeScript compiler
- **Unified testing** and build processes
- **Code sharing** through shared package

### 2. Module Extraction Ready
- **Self-contained modules** with all dependencies
- **Standardized interfaces** for consistent extraction
- **Configuration-driven** agent generation
- **Zero code changes** during extraction

### 3. Development Experience
- **Type safety** across all packages
- **Hot reloading** in development
- **Consistent tooling** (ESLint, Prettier, Vitest)
- **Clear boundaries** between packages

### 4. Deployment Flexibility
- **Single agent deployment** for Phase 1
- **Gradual agent extraction** for Phase 2
- **Independent scaling** of extracted agents
- **Rollback capabilities** if needed

This structure provides the perfect foundation for building a modular agent system that can evolve from a single agent to a distributed multi-agent architecture without any breaking changes.