# TypeScript Type Errors & Possible Resolutions

## 1. `@ai-idp/web-app` Errors

### Example Code Snippets for Common Fixes

#### 10. Add `actions` to `UserResponse` type

```ts
// In shared/types/src/UserResponse.ts
export interface ActionType {
  action: string;
  resourceName?: string;
  resourceType?: string;
  environment?: string;
  riskLevel?: string;
  // Add other fields as needed
}

export interface UserResponse {
  // ...existing properties...
  actions?: ActionType[];
  // Add other fields as needed
}
```

#### 11. Add missing properties to `ConversationMetadata`

```ts
// In shared/types/src/ConversationMetadata.ts
export interface ConversationMetadata {
  agentsInvolved: string[];
  totalExecutionTime: number;
  contextStored: boolean;
  approvalId?: string;
  confidence?: number;
  // Add other fields as needed
}
```

#### 12. Implement stubs for approval methods in `MetaAgent`

```ts
// In meta-agent/src/agent/MetaAgent.ts
class MetaAgent {
  // ...existing code...

  async getApprovalModule(): Promise<any> {
    // TODO: Implement actual logic or proxy to core agent
    return { success: false, message: 'getApprovalModule not implemented' };
  }

  async processApprovalAction(
    action: string,
    id: string,
    reviewedBy: string,
    reviewNotes?: string
  ): Promise<any> {
    // TODO: Implement actual logic or proxy to core agent
    return { success: false, message: 'processApprovalAction not implemented' };
  }
}
```

#### 13. Define `RequestContext` locally if not available

```ts
// In web-app/src/app/api/approvals/route.ts
type RequestContext = {
  userId: string;
  sessionId: string;
  originalRequest: string;
  environment: string;
  permissions: string[];
  auditTrail: any[];
  timestamp: string;
};
```

#### 1. Type Conversion for `timestamp` Property

```ts
// Before:
history: await sessionManager.getConversationHistory(sessionId),

// After (convert string to Date):
history: (await sessionManager.getConversationHistory(sessionId)).map(msg => ({
  ...msg,
  timestamp: new Date(msg.timestamp)
})),
```

#### 2. Add `actions` to `UserResponse` Type

```ts
// In shared/types/src/UserResponse.ts
export interface UserResponse {
  // ...existing properties...
  actions?: ActionType[]; // Add this line
}
```

#### 3. Add Missing Metadata Properties

```ts
// In shared/types/src/ConversationMetadata.ts
export interface ConversationMetadata {
  agentsInvolved: string[];
  totalExecutionTime: number;
  contextStored: boolean;
  approvalId?: string; // Add this line
  confidence?: number; // Add this line
}
```

#### 4. Implement Missing Methods in `MetaAgent`

```ts
// In meta-agent/src/agent/MetaAgent.ts
class MetaAgent {
  // ...existing code...

  getApprovalModule() {
    // Implementation here
  }

  async processApprovalAction(
    action: string,
    id: string,
    reviewedBy: string,
    reviewNotes?: string
  ) {
    // Implementation here
  }
}
```

#### 5. Import or Define `RequestContext`

```ts
// At the top of src/app/api/approvals/route.ts
import { RequestContext } from 'shared/types'; // Or define it if missing
```

### File: `src/app/api/agent/route.ts`

#### Error: Type 'PersistentConversationMessage[]' is not assignable to type 'ConversationMessage[]'.

- **Cause:** `timestamp` property type mismatch (`string` vs `Date`).
- **Resolution:** Convert `timestamp` from `string` to `Date` when mapping
  history, or update type definitions to allow both types if needed.

#### Error: Property 'actions' does not exist on type 'UserResponse'.

- **Cause:** The `UserResponse` type does not define `actions` property.
- **Resolution:**
  - Update the `UserResponse` type to include `actions` if it should exist.
  - Or, update code to handle cases where `actions` may be undefined or not
    present.

#### Error: Property 'approvalId' does not exist on type '{ agentsInvolved: string[]; ... }'.

- **Cause:** `approvalId` is missing from the `metadata` type.
- **Resolution:** Add `approvalId` to the metadata type definition or check if
  the property exists before accessing.

#### Error: Property 'confidence' does not exist on type '{ agentsInvolved: string[]; ... }'.

- **Cause:** `confidence` is missing from the `metadata` type.
- **Resolution:** Add `confidence` to the metadata type definition or handle its
  absence in code.

### File: `src/app/api/approvals/route.ts`

#### Error: Property 'getApprovalModule' does not exist on type 'MetaAgent'.

- **Cause:** Method not defined in `MetaAgent` class.
- **Resolution:** Implement `getApprovalModule` in `MetaAgent` or update code to
  use an existing method.

#### Error: Cannot find name 'RequestContext'.

- **Cause:** `RequestContext` type is not imported or defined.
- **Resolution:** Import or define `RequestContext` type in the file.

#### Error: Property 'processApprovalAction' does not exist on type 'MetaAgent'.

- **Cause:** Method not defined in `MetaAgent` class.
- **Resolution:** Implement `processApprovalAction` in `MetaAgent` or update
  code to use an existing method.

## 2. `@ai-idp/infrastructure-agent` Errors

### MCP Server/Agent Method Signatures (as per latest MCP SDK)

#### 1. MCP Server

```typescript
class Server {
  constructor(agentInfo: AgentInfo, options?: ServerOptions);
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
  // ...other methods
}
```

#### 2. MCPAgentClient

```typescript
class MCPAgentClient {
  registerAgent(capabilities: AgentCapabilities): Promise<void>;
  callTool(request: CallToolRequest): Promise<ToolResponse>;
  // ...other methods
}
```

#### 3. Tool Call Request

```typescript
interface CallToolRequest {
  tool: string;
  arguments: Record<string, any>;
  context?: ConversationContext;
}
```

#### 4. ConversationContext

```typescript
interface ConversationContext {
  conversationId: string;
  userId: string;
  sessionId: string;
  history: ConversationMessage[];
  metadata: Record<string, any>;
}
```

#### 5. Agent Method Arguments

For infrastructure agent methods, the required arguments are typically:

- `deployApplication`:
  `{ resourceName, containerImage, namespace, replicas, port, environment, context }`
- `scaleResource`:
  `{ resourceName, replicas, namespace, resourceType, context }`
- `getResourceStatus`: `{ resourceName, namespace, resourceType, context }`
- `getResourceLogs`: `{ resourceName, namespace, lines, follow, context }`
- `provisionDatabase`: `{ databaseType, name, size, environment, context }`

All arguments should be passed as a single object, with `context` included.

#### Common Issues

- **Missing Arguments:** Ensure all required fields are present in the request
  object.
- **Incorrect Types:** Use the correct types for each field (e.g., string,
  number, boolean).
- **Context:** Always include a valid `ConversationContext` object.

### Kubernetes Client Method Signatures (as per @kubernetes/client-node)

#### 1. Patch Deployment

```typescript
patchNamespacedDeployment(
  name: string,
  namespace: string,
  body: k8s.V1Deployment,
  pretty?: string,
  dryRun?: string,
  fieldManager?: string,
  force?: boolean,
  options?: { headers?: { [key: string]: string } }
): Promise<{ body: k8s.V1Deployment }>
```

#### 2. Create Deployment

```typescript
createNamespacedDeployment(
  namespace: string,
  body: k8s.V1Deployment,
  pretty?: string,
  dryRun?: string,
  fieldManager?: string
): Promise<{ body: k8s.V1Deployment }>
```

#### 3. Read Deployment

```typescript
readNamespacedDeployment(
  name: string,
  namespace: string,
  pretty?: string
): Promise<{ body: k8s.V1Deployment }>
```

#### 4. Patch Service

```typescript
patchNamespacedService(
  name: string,
  namespace: string,
  body: k8s.V1Service,
  pretty?: string,
  dryRun?: string,
  fieldManager?: string,
  force?: boolean,
  options?: { headers?: { [key: string]: string } }
): Promise<{ body: k8s.V1Service }>
```

#### 5. Create Service

```typescript
createNamespacedService(
  namespace: string,
  body: k8s.V1Service,
  pretty?: string,
  dryRun?: string,
  fieldManager?: string
): Promise<{ body: k8s.V1Service }>
```

#### 6. Read Pod Log

```typescript
readNamespacedPodLog(
  name: string,
  namespace: string,
  container?: string,
  follow?: boolean,
  limitBytes?: number,
  pretty?: string,
  previous?: boolean,
  sinceSeconds?: number,
  tailLines?: number
): Promise<{ body: string }>
```

#### 7. List Namespaced Pod

```typescript
listNamespacedPod(
  namespace: string,
  pretty?: string,
  allowWatchBookmarks?: boolean,
  _continue?: string,
  fieldSelector?: string,
  labelSelector?: string,
  limit?: number,
  resourceVersion?: string,
  resourceVersionMatch?: string,
  timeoutSeconds?: number,
  watch?: boolean
): Promise<{ body: k8s.V1PodList }>
```

#### 8. Create Namespace

```typescript
createNamespace(
  body: k8s.V1Namespace,
  pretty?: string,
  dryRun?: string,
  fieldManager?: string
): Promise<{ body: k8s.V1Namespace }>
```

#### 9. Read Namespace

```typescript
readNamespace(
  name: string,
  pretty?: string
): Promise<{ body: k8s.V1Namespace }>
```

### Example Code Snippets for Common Fixes

#### 6. Update Kubernetes Client Method Calls

```ts
// Before:
await this.k8sApi.createNamespacedDeployment(deployment, undefined, undefined, undefined, { headers: { ... } });

// After:
await this.k8sApi.createNamespacedDeployment({
  namespace: namespace,
  body: deployment
});
```

#### 7. Access API Response Directly

```ts
// Before:
const currentReplicas = currentDeployment.body.spec?.replicas || 0;

// After:
const currentReplicas = currentDeployment.spec?.replicas || 0;
```

#### 8. Provide All Required Properties for Typed Objects

```ts
// Before:
const context: ConversationContext = args?.context || {};

// After:
const context: ConversationContext = args?.context || {
  conversationId: '',
  userId: '',
  sessionId: '',
  history: [],
  metadata: {},
};
```

#### 9. Pass Correct Arguments to Methods

```ts
// Before:
await this.agent.deployApplication({ context });

// After:
await this.agent.deployApplication({
  resourceName: 'my-app',
  containerImage: 'my-image',
  namespace: 'default',
  replicas: 1,
  port: 8080,
  environment: 'production',
  context,
});
```

### File: `src/kubernetes/KubernetesOperations.ts`

#### Error: Expected 1-2 arguments, but got 8/9/6/3/etc.

- **Cause:** API method signatures have changed; too many arguments are being
  passed.
- **Resolution:** Update method calls to match the expected number and type of
  arguments as per the latest API documentation.

#### Error: Argument of type 'string' is not assignable to parameter of type 'AppsV1ApiCreateNamespacedDeploymentRequest' (and similar for other types).

- **Cause:** API expects an object, not a string.
- **Resolution:** Pass the correct request object as per the API type
  definitions.

#### Error: Property 'body' does not exist on type 'V1Deployment', 'V1PodList', etc.

- **Cause:** API response type has changed; may return the object directly, not
  wrapped in `body`.
- **Resolution:** Access properties directly on the returned object, or update
  code to handle new response structure.

#### Error: Argument of type '{ ... }' is not assignable to parameter of type 'never'.

- **Cause:** Logger or method signature expects a different type.
- **Resolution:** Update logger or method signature to accept the correct type.

#### Error: Type '{}' is missing properties from type 'ConversationContext'.

- **Cause:** Default context object is missing required properties.
- **Resolution:** Provide all required properties when creating a
  `ConversationContext` object.

#### Error: Argument of type '{ context: ConversationContext; }' is not assignable to parameter of type '{ resourceName: string; ... }'.

- **Cause:** Required properties are missing in the argument object.
- **Resolution:** Ensure all required properties are included in the argument
  object.

## General Recommendations

- Review and update type definitions to match actual data structures and API
  responses.
- Refactor code to handle new/changed API signatures and response formats.
- Ensure all required properties are present when creating typed objects.
- Add missing imports for types.
- If using external libraries, check for breaking changes in their type
  definitions.

---

**Next Steps:**

- Review each error in detail and update code/type definitions as suggested
  above.
- Re-run type-check after each fix to confirm resolution.
- If any error persists, consult the relevant API/type documentation for the
  latest signatures and structures.
