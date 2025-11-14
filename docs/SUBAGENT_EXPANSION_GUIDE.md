# Subagent Expansion Guide

## Overview

This guide explains how to add new focused agents to the AI-IDP platform using the revolutionary persona-based architecture. The system is designed to be extended by domain experts without requiring deep programming knowledge - new agents are created through markdown personas, similar to Claude's subagent approach.

## Prerequisites

- Basic understanding of the agent's domain expertise
- Familiarity with markdown formatting
- Access to the AI-IDP codebase
- Understanding of the tools/capabilities the agent should provide

## Step-by-Step Agent Creation

### Step 1: Define the Agent's Persona

Create a new markdown file in the appropriate agent package:

```
packages/agents/[agent-name]/personas/[agent-name]-agent.md
```

#### Persona Template

```markdown
# [Agent Name] Agent Persona

## Domain Expertise
You are an expert [Agent Name] Agent specializing in [domain areas]. You have deep knowledge of:
- [Key area 1]
- [Key area 2]
- [Key area 3]
- [Integration points]
- [Best practices]

## Model Configuration
- Primary Model: [preferred model for this domain]
- Fallback Model: [backup model]
- Temperature: [0.0-1.0 for creativity vs consistency]
- Max Tokens: [response length limit]
- Context Window: [context size needed]
- Cost Target: [target cost per operation]

## Available Tools
- **toolName1**: Description of what this tool does
- **toolName2**: Description of what this tool does
- **toolName3**: Description of what this tool does

## Parameter Extraction Rules

### For toolName1:
- **paramName** (REQUIRED): How to extract this parameter
- **optionalParam**: Default behavior and extraction rules
- **anotherParam**: Pattern matching rules

### For toolName2:
- [Similar parameter rules]

## Classification Examples

### Category 1 Operations
- "user input example" → toolName {param: "value"}
- "another example" → toolName {param1: "value1", param2: "value2"}

### Category 2 Operations
- [More examples with expected outputs]

## Safety Protocols
- [Domain-specific safety requirements]
- [Validation rules]
- [Human approval triggers]

## Performance Optimization
- [Domain-specific optimizations]
- [Caching strategies]
- [Cost reduction approaches]

## Context Awareness
- Recognize when to escalate to [other agent]
- Delegate [specific tasks] to [appropriate agent]
- Coordinate with [related agent] for [integration scenarios]

## Natural Language Patterns

### Action Verbs
- [domain-specific action words]
- [common phrases users might use]

### Domain Keywords
- [technical terminology]
- [user-friendly terms]

### Time Expressions
- [if relevant to domain]

## Error Handling
- [Common error scenarios]
- [Recovery strategies]
- [When to escalate to humans]
```

### Step 2: Implement the Agent's HTTP MCP Server

Create the agent's HTTP MCP server based on the established pattern:

```typescript
// packages/agents/[agent-name]/src/mcp/HTTPMCPServer.ts

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createLogger, type Logger } from '@ai-idp/utils';
import { [AgentName]Agent } from '../agent/[AgentName]Agent';
import type {
  [AgentName]AgentConfig,
} from '../agent/[AgentName]Agent';
import type { ConversationContext } from '@ai-idp/types';

export interface HTTPMCPServerConfig {
  port: number;
  [agentName]AgentConfig: [AgentName]AgentConfig;
}

export class HTTPMCPServer {
  // Follow the same pattern as Infrastructure and Observability agents
  // Register tools based on the persona definition
  // Handle parameter extraction correctly
}
```

### Step 3: Create the Agent Implementation

```typescript
// packages/agents/[agent-name]/src/agent/[AgentName]Agent.ts

export interface [AgentName]AgentConfig {
  // Configuration specific to this agent
}

export class [AgentName]Agent {
  // Implement the tools defined in the persona
  // Follow the established patterns for:
  // - Error handling
  // - Logging
  // - Parameter validation
  // - Response formatting
}
```

### Step 4: Update Meta-Agent Configuration

Add the new agent to the Meta-Agent configuration:

#### 4.1 Update MetaAgentConfig Interface

```typescript
// packages/meta-agent/src/agent/MetaAgent.ts

export interface MetaAgentConfig {
  // ... existing config
  agents: {
    infrastructure: { /* ... */ };
    observability: { /* ... */ };
    [agentName]: {
      url: string;
      timeout?: number;
      personaPath?: string;
    };
  };
}
```

#### 4.2 Update Zod Schema

```typescript
// packages/meta-agent/src/agent/MetaAgent.ts

const MetaAgentConfigSchema = z.object({
  // ... existing schema
  agents: z.object({
    infrastructure: z.object({ /* ... */ }),
    observability: z.object({ /* ... */ }),
    [agentName]: z.object({
      url: z.string(),
      timeout: z.number().default(30000),
      personaPath: z.string().optional()
    })
  }),
});
```

#### 4.3 Update PersonaRouter Initialization

```typescript
// packages/meta-agent/src/agent/MetaAgent.ts

private initializePersonaRouter(): PersonaRouter {
  // ... existing agents

  // Configure New Agent
  const [agentName]PersonaPath = this.config.agents.[agentName].personaPath ||
    join(basePath, '[agent-name]/personas/[agent-name]-agent.md');

  agentConfigs.set('[agentName]', {
    name: '[agentName]',
    filePath: [agentName]PersonaPath,
    url: this.config.agents.[agentName].url,
    enabled: true
  });
}
```

#### 4.4 Update MCP Client Initialization

```typescript
// packages/meta-agent/src/agent/MetaAgent.ts

private async initializeMCPClients(): Promise<void> {
  // ... existing clients

  // Initialize New Agent MCP client
  const [agentName]Transport = new StreamableHTTPClientTransport(
    new URL(this.config.agents.[agentName].url)
  );
  const [agentName]Client = new Client(
    {
      name: 'meta-agent-[agentName]-client',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  await [agentName]Client.connect([agentName]Transport);
  this.mcpClients.set('[agentName]', [agentName]Client);
}
```

### Step 5: Update Default Configuration

Add environment variable support and default configuration:

```typescript
// packages/meta-agent/src/index.ts

const config: MetaAgentConfig = {
  // ... existing config
  agents: {
    // ... existing agents
    [agentName]: {
      url: `http://localhost:${process.env.[AGENT_NAME]_AGENT_PORT || [PORT]}/mcp`,
      timeout: parseInt(process.env.[AGENT_NAME]_AGENT_TIMEOUT || '30000', 10),
      personaPath: process.env.[AGENT_NAME]_PERSONA_PATH
    }
  }
};
```

### Step 6: Update Environment Variables

Add the new agent's environment variables to `.env`:

```bash
# New Agent Configuration
[AGENT_NAME]_AGENT_PORT=[PORT]
[AGENT_NAME]_AGENT_TIMEOUT=30000
[AGENT_NAME]_PERSONA_PATH=  # Optional custom path
```

### Step 7: Update Persona Schema

Add the new agent to the schema enum:

```typescript
// packages/meta-agent/src/persona/PersonaRouter.ts

const PersonaRoutingSchema = z.object({
  agent: z.enum(['infrastructure', 'observability', 'security', 'workflow', 'cicd', '[agentName]']),
  // ... rest of schema
});
```

## Testing Your New Agent

### 1. Unit Testing

Create tests for your agent's individual tools:

```typescript
// packages/agents/[agent-name]/src/tests/[AgentName]Test.ts

import { [AgentName]Agent } from '../agent/[AgentName]Agent';

async function test[AgentName]Agent() {
  // Test each tool individually
  // Verify parameter extraction
  // Check error handling
}
```

### 2. MCP Integration Testing

Test the HTTP MCP server:

```typescript
// packages/agents/[agent-name]/src/tests/[AgentName]MCPTest.ts

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function test[AgentName]MCP() {
  // Test MCP client connection
  // Test tool execution via MCP
  // Verify response format
}
```

### 3. Persona Routing Testing

Test that the Meta-Agent correctly routes to your new agent:

```typescript
// packages/meta-agent/src/tests/[AgentName]PersonaTest.ts

async function test[AgentName]PersonaRouting() {
  // Test user inputs that should route to your agent
  // Verify parameter extraction
  // Check confidence scores
}
```

## Domain-Specific Examples

### Security Agent Example

```markdown
# Security Agent Persona

## Domain Expertise
You are an expert Security Agent specializing in cybersecurity, vulnerability assessment, and threat detection. You have deep knowledge of:
- Container and Kubernetes security scanning
- Dependency vulnerability analysis
- Policy compliance validation
- Threat detection and incident response
- Security best practices and hardening

## Available Tools
- **scanContainerImage**: Scan container images for vulnerabilities
- **analyzeDependencies**: Analyze project dependencies for security issues
- **validatePolicy**: Check configurations against security policies
- **assessRisk**: Perform risk assessment for deployment requests

## Classification Examples
- "scan nginx image for vulnerabilities" → scanContainerImage {image: "nginx"}
- "check my app dependencies for security issues" → analyzeDependencies {project: "myapp"}
- "validate security policy for production deployment" → validatePolicy {environment: "production"}
```

### Workflow Agent Example

```markdown
# Workflow Agent Persona

## Domain Expertise
You are an expert Workflow Agent specializing in process orchestration, approval workflows, and multi-step automation. You have deep knowledge of:
- Human-in-the-loop approval processes
- Multi-agent coordination and orchestration
- Process automation and pipeline management
- Notification and escalation procedures

## Available Tools
- **createApproval**: Create approval requests for sensitive operations
- **processApprovalDecision**: Handle approval/rejection decisions
- **executeWorkflow**: Execute multi-step automated workflows
- **sendNotification**: Send notifications to users and teams

## Classification Examples
- "request approval for production deployment" → createApproval {operation: "deployment", environment: "production"}
- "approve request #1234" → processApprovalDecision {requestId: "1234", decision: "approve"}
- "run the onboarding workflow for new user" → executeWorkflow {workflow: "onboarding", target: "user"}
```

## Best Practices

### 1. Persona Design
- **Be Specific**: Define clear boundaries for your agent's responsibilities
- **Use Examples**: Provide many concrete examples of user inputs and expected outputs
- **Consider Edge Cases**: Include error handling and ambiguous input scenarios
- **Think Cost-Effectively**: Choose appropriate models for the complexity level

### 2. Tool Implementation
- **Follow Patterns**: Use the same error handling and logging patterns as existing agents
- **Validate Parameters**: Always validate inputs before processing
- **Provide Rich Responses**: Include helpful details in success and error responses
- **Handle Timeouts**: Implement appropriate timeout handling for long-running operations

### 3. Integration
- **Test Thoroughly**: Test both isolated functionality and integration with Meta-Agent
- **Document Clearly**: Update all relevant documentation
- **Monitor Performance**: Track costs, response times, and accuracy
- **Iterate Based on Usage**: Refine personas based on real-world usage patterns

### 4. Maintenance
- **Version Personas**: Track changes to persona definitions
- **Monitor Accuracy**: Regularly review routing accuracy and parameter extraction
- **Update Examples**: Keep examples current with actual usage patterns
- **Gather Feedback**: Collect user feedback to improve agent capabilities

## Troubleshooting

### Common Issues

1. **Agent Not Being Selected**
   - Check persona domain expertise matches user input patterns
   - Verify agent is enabled in PersonaRouter configuration
   - Review classification examples for coverage
   - Add action mappings to normalization layer

2. **Parameter Extraction Failing**
   - Review parameter extraction rules in persona
   - Check for typos in parameter names
   - Verify examples cover the user input patterns
   - Add parameter key mappings to normalization layer

3. **Low Confidence Scores**
   - Expand domain expertise description
   - Add more classification examples
   - Review natural language patterns section
   - Ensure normalization handles specific action variants

4. **MCP Connection Issues**
   - Verify HTTP MCP server is running on correct port
   - Check Meta-Agent configuration includes new agent
   - Validate MCP client initialization code

5. **Inconsistent Action Names**
   - Update normalization layer's actionMappings
   - Include common variations in your agent's actions
   - Follow the pattern in `normalizeRouterResponse()`

6. **Parameter Key Variations**
   - Update normalization layer's paramMappings
   - Map all likely variations to your canonical keys
   - Add special case handling if needed

## Normalization Layer Integration

When adding a new agent, you must update the normalization layer to handle variations in action names and parameter keys. See [Persona Normalization Layer](./PERSONA_NORMALIZATION_LAYER.md) for comprehensive documentation.

```typescript
// Add mappings for your new agent
private normalizeRouterResponse(response: any): void {
  // ...existing code...

  // Add your agent's action mappings
  const actionMappings: Record<string, string> = {
    // ... existing mappings ...

    // Your new agent mappings
    'scan_image': 'scanContainerImage',
    'check_dependencies': 'analyzeDependencies',
    'policy_check': 'validatePolicy',
  };

  // Add your agent's parameter mappings
  const paramMappings: Record<string, string> = {
    // ... existing mappings ...

    // Your new agent parameter mappings
    'image_name': 'imageName',
    'dependency_path': 'projectPath',
    'policy_name': 'policyType',
  };

  // Add special case handling if needed
  if (response.action === 'scanContainerImage') {
    // Your special case handling
  }
}
```

## Advanced Features

### Multi-Agent Coordination

Agents can coordinate with each other through the Meta-Agent. Define coordination patterns in your persona:

```markdown
## Context Awareness
- Recognize when security scanning is needed → delegate to security agent
- Coordinate with infrastructure agent for deployment validation
- Escalate complex workflows to workflow agent
```

### Dynamic Model Selection

Configure different models based on operation complexity:

```markdown
## Model Configuration
- Primary Model: llama-3.2:3b-instruct (fast operations)
- Complex Analysis Model: claude-3-sonnet (deep analysis)
- Fallback Model: gpt-4 (when local models unavailable)
```

### Cost Optimization

Design your agent for cost-effectiveness:

```markdown
## Performance Optimization
- Use local SLMs for routine operations
- Cache frequently accessed data
- Batch similar operations
- Implement smart defaults to reduce token usage
```

This guide provides the complete framework for extending the AI-IDP with new specialized agents using the persona-based architecture. The system is designed to be accessible to domain experts while maintaining the technical robustness needed for production deployments.