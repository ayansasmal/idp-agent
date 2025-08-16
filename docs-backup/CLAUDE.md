# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-Powered Integrated Developer Platform (IDP) that uses AI agents to eliminate infrastructure complexity through natural language conversations. The platform uses LangChain for AI agent logic and Windmill for workflow execution, allowing developers to deploy and manage infrastructure through conversational interfaces rather than learning complex platform abstractions.

## Key Architecture Concepts

### AI-Agent-First Strategy
- The AI agent is the primary interface, not just a helper feature
- Natural language eliminates the traditional platform learning curve
- Target 80-95% adoption vs 10-30% typical for traditional IDPs
- AI learns organizational patterns and continuously improves recommendations

### Technology Stack
- **LangChain JS/TS**: Conversational AI agent framework with memory management
- **Anthropic Claude**: Primary LLM for intelligent decision making
- **Windmill**: Workflow execution engine with safety controls and rollback capabilities
- **Traditional Platform Layer**: Kubernetes, Crossplane, ArgoCD orchestrated by AI
- **Multi-Interface Support**: Chat, Slack, IDE extensions, voice commands

### Agent Architecture Overview
The platform consists of a comprehensive suite of specialized agents orchestrated by a Meta-Agent:

#### Core Foundation Agents
1. **Meta-Agent (Coordinator)**: Orchestrates all agent interactions and routing
2. **Kubernetes Agent**: Manages K8s operations (deploy, scale, rollback, RBAC)
3. **Observability Agent**: Monitors metrics/logs, raises alerts, auto-remediation
4. **Secrets Management Agent**: Secure secrets handling with Vault/AWS integration
5. **Security Agent**: Vulnerability scanning, container security, compliance checks

#### Specialized Agents
6. **Cost Optimization Agent**: Cloud billing analysis and cost recommendations
7. **Compliance Agent**: GDPR, SOC2, ISO27001 compliance enforcement
8. **Developer Productivity Agent**: Code suggestions, tooling recommendations
9. **New Project Wizard Agent**: Automated project scaffolding and setup
10. **Incident Simulation Agent**: Chaos engineering and resilience testing
11. **Agent Improvement Agent**: Self-improving system through telemetry analysis

### Core Components
1. **Agent Communication Hub**: All agents interact through the Coordinator for safe execution
2. **Pattern Learning System**: ML-based organizational pattern recognition and recommendation
3. **Safety Validation**: Multi-layer safety checks with human approval for destructive operations
4. **Execution Layer**: Windmill workflows that safely execute platform operations
5. **Metrics & Approval System**: Centralized metrics collection with human-in-the-loop approval

## Documentation Structure

This repository contains comprehensive documentation organized as follows:

- `readme_main.md`: Main project overview and quickstart
- `comprehensive_idp_docs.md`: Detailed technical documentation and implementation guide
- `architecture_decisions.md`: ADRs documenting key architectural decisions
- `integration_details.md`: **Comprehensive agent suite architecture and integration patterns**
- `epic_ai_11_implementation.md`: Detailed implementation roadmap and epic breakdown
- `safety_implementation_guide.md`: Safety measures and validation strategies
- `ai_safety_architecture.md`: AI-specific safety architecture
- `idp_documentation.md`: Platform engineering documentation
- `monday_tickets.md` & `monday_ai_tickets.md`: Project management tracking

## Development Approach

### Documentation-First Development
This project follows a documentation-first approach where comprehensive planning and architecture documentation precedes implementation. All major features and architectural decisions are thoroughly documented before development begins.

### No Code Files Yet
This repository currently contains only documentation and planning materials. Implementation will follow the detailed specifications in the documentation files.

### Key Development Principles
- AI safety is paramount - multi-layer validation for all operations
- Pattern learning drives continuous improvement
- Developer experience takes priority over enterprise complexity
- Hybrid traditional + AI architecture for reliability
- Proactive optimization with user-controlled preferences

## Getting Started

Since this is a documentation-heavy project in the planning phase:

1. **Read the Architecture**: Start with `readme_main.md` for overview
2. **Understand Decisions**: Review `architecture_decisions.md` for key ADRs
3. **Implementation Details**: See `comprehensive_idp_docs.md` for technical specs
4. **Safety Considerations**: Review safety documentation before implementing any AI features

## Development Commands

No build, test, or lint commands are currently available as this is a documentation-only repository in the planning phase. When implementation begins, the project will use:

### Expected Technology Stack Commands
- **TypeScript/JavaScript**: `npm install`, `npm run build`, `npm test`, `npm run lint`
- **Environment Setup**: Node.js project with Anthropic SDK (primary), Kubernetes client, Fastify
- **Key Dependencies**: `@anthropic-ai/sdk`, `openai`, `@kubernetes/client-node`, `@slack/bolt`, `fastify`, `zod`, `prisma`

Implementation will follow the agent architecture detailed in `integration_details.md`.

## Important Notes

- This project is designed for **defensive security tasks only**
- All AI operations must include comprehensive safety validation
- Use `awslocal` for any LocalStack AWS resources in local development
- Pattern learning and organizational intelligence are core differentiators
- The AI agent should be conversational, helpful, and continuously learning from user interactions

## Implementation Roadmap

### **Modular Single Agent Architecture (Approved Plan)**

The implementation follows a **modular single agent** approach designed for easy future extraction into specialized agents:

#### **Core Architecture**
- **1 Primary Agent** with 4 self-contained modules
- **Zero-refactoring extraction path** to standalone agents
- **Standardized module interface** for future agent communication
- **TypeScript/JavaScript + Node.js + OpenAI** stack

#### **4 Core Modules (Future Agents)**
1. **Kubernetes Operations Module** → Future Kubernetes Agent
2. **Safety Validation Module** → Future Security/Safety Agent  
3. **Approval Workflow Module** → Future Workflow/Approval Agent
4. **Audit & Monitoring Module** → Future Observability Agent

### **3-Phase Implementation**

#### **Phase 1: Modular Single Agent (Weeks 1-8)**
1. **Primary Agent Core**: Build coordinator with standardized module interface
2. **4 Core Modules**: Implement each module as self-contained, extraction-ready unit
3. **Module Communication**: Design protocol that works for both method calls and future network calls
4. **Multi-Interface Support**: Web, Slack, CLI interfaces

#### **Phase 2: Agent Extraction (Weeks 9-12)**
5. **Module → Agent Migration**: Extract modules to standalone agents with zero refactoring
6. **Network Communication**: Replace inter-module calls with network communication
7. **Distributed Deployment**: Deploy agents independently while maintaining functionality
8. **Migration Tools**: Build automated module-to-agent extraction utilities

#### **Phase 3: Specialized Agent Ecosystem (Weeks 13+)**
9. **Advanced Agent Features**: Add agent-specific optimizations and capabilities
10. **New Specialized Agents**: Add Cost, Compliance, Developer Productivity agents
11. **Self-Improving System**: Implement agent improvement and pattern learning
12. **Enterprise Features**: Advanced multi-tenancy, compliance, and observability

### **Key Benefits of This Approach**
- **Rapid MVP**: Single agent delivers full functionality in 8 weeks
- **Future-Proof**: Modules designed for extraction with no code changes
- **Risk Mitigation**: Validate core concepts before building complex multi-agent system
- **Iterative Value**: Each phase delivers working improvements

Detailed technical specifications and module designs are available in the documentation files.