# Copilot Instructions for AI-IDP Multi-Agent Codebase

## Big Picture Architecture & Agent Roles

- **Meta-Agent Orchestrator**: Central AI agent routes requests to specialized
  domain agents (Infrastructure, Security, Workflow, Observability).
- **Focused Agents**: Each agent exposes domain operations via MCP (Model
  Context Protocol) server/client, using request object patterns and shared
  types.
- **Shared Context**: Qdrant vector DB enables cross-agent memory and learning;
  all agents read/write context for improved recommendations and audit.
- **Web App**: Next.js frontend interacts with Meta-Agent via API endpoints,
  supporting conversational workflows and approval management.
- **Utilities**: All agents/services use `@ai-idp/utils` for HTTP, logging,
  error handling, validation, and config management.

### Agent Roles

- **Meta-Agent**: Orchestrates, routes, manages context, coordinates responses,
  and makes high-level decisions.
- **Infrastructure Agent**: Handles Kubernetes/cloud operations, exposes MCP
  server, stores infra patterns in Qdrant.
- **Security Agent**: Enforces policies, assesses risk, detects threats, adapts
  via Qdrant learning.
- **Workflow Agent**: Orchestrates approvals, manages workflows, integrates
  notifications, stores decision history.
- **Observability Agent**: Monitors logs/metrics, manages incidents, compliance,
  and predictive analytics.

## Developer Workflows

- **Build/Dev**: Use `npm run dev` (root or `packages/web-app`) for local
  development; `docker-compose up -d` for backend services.
- **Database**: Run `npx prisma migrate dev` and `npx prisma generate` for DB
  setup; use `./scripts/create-dynamodb-tables.sh` for DynamoDB tables.
- **Testing**: Use `vitest` for unit/integration tests (see
  `vitest.workspace.ts`).
- **Session Management**: Persistent chat/approval sessions via DynamoDB (see
  `packages/web-app/src/lib/session-manager.ts`).

## Utility Library Patterns

- Use `@ai-idp/utils` for HTTP clients, logging, error handling, validation,
  retry, and config management.
- All agents/services share consistent patterns for observability and
  maintainability.

## Type Safety & Compatibility

- Use latest shared types from `@ai-idp/types` for:
  - `ConversationContext`, `AgentResponse`, `UserResponse`, `ApprovalRequest`,
    `ToolDefinition`, `MCPRequest`, `MCPResponse`
- Ensure `UserResponse` and `AgentResponse` include: `approvalId`, `confidence`,
  `actions`, `riskLevel` (top-level and in `metadata`)
- Pass a single request object with all required fields and a valid `context` to
  agent methods.

## MCP Protocol Usage

- MCP server/client methods use request object signatures:
  ```typescript
  interface CallToolRequest {
    tool: string;
    arguments: Record<string, any>;
    context?: ConversationContext;
  }
  ```
- Always include a valid `ConversationContext` in MCP requests and agent calls.

## Approval Workflow

- Approval APIs/UI expect `approvalId`, `riskLevel`, and `confidence` in
  responses.
- Implement or stub `getApprovalModule` and `processApprovalAction` in
  `MetaAgent` for compatibility.

## Error Handling & Type-Check Resolutions

- Prefer explicit error types over `any`.
- For Zod validation errors, return detailed issue lists in API responses.
- See `/docs/TYPE-CHECK-ERROR-RESOLUTIONS.md` for code snippets to fix missing
  properties, method stubs, and type conversions.

## Session & Context Management

- Use `sessionManager` and DynamoDB-backed session store for persistent context.
- Update session activity and store deployed resources after successful agent
  actions.

## Code Patterns & Examples

- Validate required arguments before agent method calls.
- Log tool calls and responses with context and arguments.
- Use latest types for request/response schemas in web-app API routes.
- Ensure all metadata fields are present in responses for UI compatibility.
- For missing properties (`approvalId`, `confidence`, `actions`, `riskLevel`),
  update types/interfaces and populate these fields.
- Refactor outdated method signatures to request object patterns.
- Always construct a valid `ConversationContext` object.

## Key Files & Directories

- `/README.md`, `/README-MULTI-AGENT.md`, `/docs/MULTI-AGENT-ARCHITECTURE.md`:
  Architecture, workflows, and conventions.
- `/packages/agents/infrastructure/src/mcp/MCPServer.ts`: Example of MCP server
  and request object pattern.
- `/packages/web-app/src/app/api/agent/route.ts`: Web API route using latest
  types and approval workflow.
- `/packages/shared/types/src/index.ts`: Source of all shared types/interfaces.
- `/packages/shared/utils/README.md`: Utility library usage and patterns.
- `/docs/TYPE-CHECK-ERROR-RESOLUTIONS.md`: Type error fixes and code migration
  strategies.

## Examples

- **Agent Method Call**:
  ```typescript
  await agent.deployApplication({ resourceName, containerImage, context });
  ```
- **MCP Request**:
  ```typescript
  const request: CallToolRequest = { tool: 'deployApplication', arguments: { ... }, context };
  await mcpClient.callTool(request);
  ```
- **Approval Response**:
  ```typescript
  { success: true, approvalId, riskLevel, confidence, ... }
  ```

---

For more details, see `/docs/TYPE-CHECK-ERROR-RESOLUTIONS.md`. Update this file
as new patterns emerge.

## Key Files & Directories

- `/README.md`, `/docs/MULTI-AGENT-ARCHITECTURE.md`: Architecture, workflows,
  and conventions.
- `/packages/agents/infrastructure/src/mcp/MCPServer.ts`: Example of MCP server
  and request object pattern.
- `/packages/web-app/src/app/api/agent/route.ts`: Web API route using latest
  types and approval workflow.
- `/packages/shared/types/src/index.ts`: Source of all shared types/interfaces.
- `/packages/shared/utils/README.md`: Utility library usage and patterns.

## Examples

- **Agent Method Call**:
  ```typescript
  await agent.deployApplication({ resourceName, containerImage, context });
  ```
- **MCP Request**:
  ```typescript
  const request: CallToolRequest = { tool: 'deployApplication', arguments: { ... }, context };
  await mcpClient.callTool(request);
  ```
- **Approval Response**:
  ```typescript
  { success: true, approvalId, riskLevel, confidence, ... }
  ```

---

For more details, see `/docs/TYPE-CHECK-ERROR-RESOLUTIONS.md`. Update this file
as new patterns emerge.
