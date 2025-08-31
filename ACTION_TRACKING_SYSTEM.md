# Distributed Action Tracking System Implementation 📋

## Overview

Comprehensive distributed system for tracking user actions across the AI-IDP platform using DynamoDB for persistence, background workers for execution, and real-time UI updates via WebSocket.

## System Architecture 🏗️

```
User Request → Action Creation → DynamoDB Storage → Worker Queue → Background Execution → Status Updates → UI Updates
```

### Core Components:
1. **Action Manager**: Central orchestration service
2. **DynamoDB Storage**: Action persistence with TTL
3. **Worker Framework**: Background task execution  
4. **WebSocket Service**: Real-time UI updates
5. **Agent Integration**: Modified agent methods
6. **UI Components**: Action status displays with follow-ups

## Implementation Checklist ✅

### Phase 1: Core Infrastructure (Days 1-2) ✅ **COMPLETED**
- [x] **DynamoDB Schema Setup**
  - [x] Create `action_tracking` table with GSI indexes (SessionIndex, UserIndex, StatusIndex, AgentIndex)
  - [x] Reuse existing `chat_sessions` table for session context (more efficient)
  - [x] Configure TTL for automatic cleanup (30 days actions)
  - [x] LocalStack already running with table creation scripts
  - [x] Test table creation and verification completed

- [x] **Action Type Registry**
  - [x] Define all Infrastructure Agent actions (deploy, scale, status-check, get-logs, provision-db)
  - [x] Define all Observability Agent actions (analyze-logs, monitor-metrics, investigate-incident, health-check)
  - [x] Define all Meta Agent actions (orchestrate, request-approval)
  - [x] Create action completion criteria templates with validation commands
  - [x] Document validation commands and retry policies for each action type

- [x] **Core Types & Interfaces**
  - [x] ActionRecord interface with all required fields
  - [x] Leveraging existing UserSessionRecord from chat sessions
  - [x] ActionDefinition templates for each action type with completion criteria
  - [x] CreateActionRequest interface
  - [x] FollowUpAction interface for UI suggestions

### Phase 2: Action Manager Service (Day 3) ✅ **COMPLETED**
- [x] **Action Manager Class**
  - [x] `createAction()` - Generate unique IDs and store in DynamoDB
  - [x] `updateActionStatus()` - Update status, progress, results
  - [x] `getAction()` - Retrieve single action by ID  
  - [x] `getActionsBySession()` - Get all actions for a session
  - [x] `getActionsByUser()` - Get all actions for a user
  - [x] Connection pooling and error handling for DynamoDB
  - [x] Comprehensive query methods (by status, agent, batch retrieval)
  - [x] Action statistics and monitoring capabilities

- [x] **Queue Integration**
  - [x] InMemoryActionQueue implementation for development
  - [x] ActionQueue abstract base class for multiple queue backends
  - [x] Job creation when actions are queued with retry logic
  - [x] Event handler system for queue processing events
  - [x] Progress tracking and completion callbacks

- [x] **Service Integration**
  - [x] ActionManagerService - High-level service integration
  - [x] Singleton pattern with global service access
  - [x] Event callback system for action lifecycle
  - [x] Service initialization and graceful shutdown
  - [x] Comprehensive service statistics

### Phase 3: Worker Framework (Day 4) ✅ **COMPLETED**
- [x] **Abstract ActionWorker Base Class**
  - [x] `execute()` - Complete action execution orchestration
  - [x] `executeTool()` - Abstract method for tool execution
  - [x] `checkCompletion()` - Abstract method for validation
  - [x] `startValidation()` - Polling loop with completion checking
  - [x] Retry logic with exponential backoff and error handling
  - [x] Worker context, timeouts, and abort capabilities
  - [x] WorkerFactory for creating appropriate worker instances

- [x] **Infrastructure Worker**
  - [x] Implement `executeTool()` for all infrastructure actions (deploy, scale, status, logs, provision-db)
  - [x] Implement `checkCompletion()` with kubectl command simulation
  - [x] Handle Kubernetes-specific validation logic with progress tracking
  - [x] Parse deployment, scaling, and resource status with proper typing
  - [x] K8sResourceStatus interface with comprehensive status parsing

- [x] **Observability Worker** 
  - [x] Implement `executeTool()` for log analysis, metrics monitoring, health checks, incident investigation
  - [x] Implement `checkCompletion()` for SLM-powered analysis completion
  - [x] Comprehensive result interfaces (LogAnalysisResult, MetricsAnalysisResult, HealthCheckResult)
  - [x] Simulated SLM analysis workflows with realistic delays
  - [x] Time range parsing and analysis progress tracking

- [x] **Meta Worker**
  - [x] Handle orchestration actions with workflow definition
  - [x] Approval workflow management with comprehensive request tracking
  - [x] Child action coordination and dependency management
  - [x] OrchestrationStep and ApprovalRequest interfaces
  - [x] Dynamic workflow creation based on user input

- [x] **Worker Management System**
  - [x] WorkerManager for coordinating worker execution
  - [x] Concurrent worker pool with configurable limits
  - [x] Worker timeout handling and graceful shutdown
  - [x] Action retry logic with exponential backoff
  - [x] Worker statistics and monitoring capabilities

### Phase 4: Agent Integration (Day 5)
- [ ] **Infrastructure Agent Updates**
  - [ ] Modify `deployApplication()` to create action instead of blocking
  - [ ] Modify `scaleResource()` to create action
  - [ ] Update `getResourceStatus()` for immediate actions
  - [ ] Update `getResourceLogs()` for immediate actions
  - [ ] Update `provisionDatabase()` to create action
  - [ ] Remove existing timeout handling (now handled by workers)

- [ ] **Meta Agent Updates**
  - [ ] Update `processRequest()` to create orchestration actions  
  - [ ] Modify approval request workflow
  - [ ] Handle action dependency management
  - [ ] Update response format to include actionId

- [ ] **Response Format Standardization**
  - [ ] All agents return actionId in metadata
  - [ ] Immediate responses for queued actions
  - [ ] Status tracking information in responses
  - [ ] Follow-up action suggestions

### Phase 5: UI Real-time Updates (Day 6)
- [ ] **WebSocket Server**
  - [ ] Create WebSocket server on port 3001
  - [ ] Handle client connections with session authentication
  - [ ] Subscribe clients to session-specific action updates
  - [ ] Broadcast action status changes to connected clients
  - [ ] Handle connection cleanup and error scenarios

- [ ] **Action Status API**
  - [ ] `GET /api/actions/:actionId` - Get single action status
  - [ ] `GET /api/actions/session/:sessionId` - Get all session actions  
  - [ ] `POST /api/actions/:actionId/cancel` - Cancel running action
  - [ ] Error handling and proper HTTP status codes

- [ ] **React Hooks & Components**
  - [ ] `useActionStatus(actionId)` hook for real-time updates
  - [ ] `useSessionActions(sessionId)` hook for all session actions
  - [ ] `ActionStatusCard` component for individual action display
  - [ ] `ActionProgress` component with progress bars
  - [ ] Connection status indicators

- [ ] **Chat Integration**
  - [ ] Display action cards in chat messages
  - [ ] Show real-time progress updates
  - [ ] Handle action completion notifications
  - [ ] Link follow-up actions to new messages

### Phase 6: Follow-up Intelligence (Day 7) 
- [ ] **Smart Follow-up Actions**
  - [ ] Generate context-aware follow-up suggestions
  - [ ] "Continue waiting" for running actions
  - [ ] "Investigate delay" triggering observability analysis
  - [ ] "Show details" for immediate status updates
  - [ ] "Cancel action" for user-initiated cancellation

- [ ] **Observability Triggers**
  - [ ] Automatic investigation when actions timeout
  - [ ] Link investigation actions to parent deployment actions
  - [ ] Trigger log analysis for failed deployments
  - [ ] Generate health check actions for problematic resources

- [ ] **Action Dependencies**
  - [ ] Parent-child action relationships
  - [ ] Dependency completion checking
  - [ ] Cascading cancellation logic
  - [ ] Rollback action triggers

## File Structure 📁

```
packages/shared/action-manager/
├── src/
│   ├── types/
│   │   ├── ActionTypes.ts              ✅ Created
│   │   └── index.ts
│   ├── registry/
│   │   ├── ActionRegistry.ts           ✅ Created
│   │   ├── InfrastructureActions.ts    (Included in ActionRegistry.ts)
│   │   ├── ObservabilityActions.ts     (Included in ActionRegistry.ts)
│   │   └── MetaActions.ts              (Included in ActionRegistry.ts)
│   ├── storage/
│   │   ├── DynamoDBClient.ts
│   │   ├── TableSetup.ts               ✅ Created
│   │   └── SessionStore.ts             (Leveraging existing chat sessions)
│   ├── manager/
│   │   ├── ActionManager.ts            🟡 Next
│   │   └── QueueManager.ts
│   ├── workers/
│   │   ├── ActionWorker.ts
│   │   ├── InfrastructureWorker.ts
│   │   ├── ObservabilityWorker.ts
│   │   └── MetaWorker.ts
│   └── index.ts                        ✅ Created
├── package.json                        ✅ Created
└── tsconfig.json                       ✅ Created

packages/web-app/src/
├── hooks/
│   ├── useActionStatus.ts
│   └── useSessionActions.ts
├── components/
│   ├── ActionStatusCard.tsx
│   ├── ActionProgress.tsx
│   └── FollowUpActions.tsx
├── lib/
│   └── websocket-client.ts
└── app/api/actions/
    ├── [actionId]/route.ts
    └── session/[sessionId]/route.ts
```

## Testing Strategy 🧪

### Unit Tests
- [ ] ActionManager CRUD operations
- [ ] Worker execution and validation logic
- [ ] DynamoDB operations
- [ ] Action registry definitions

### Integration Tests  
- [ ] End-to-end action lifecycle (create → execute → complete)
- [ ] WebSocket real-time updates
- [ ] Agent integration with action creation
- [ ] Follow-up action workflows

### Load Tests
- [ ] Concurrent action creation and execution
- [ ] DynamoDB performance under load
- [ ] WebSocket connection scaling
- [ ] Worker queue processing capacity

## Configuration 🔧

### Environment Variables
```bash
# DynamoDB Configuration
AWS_REGION=us-west-2
DYNAMODB_ENDPOINT=http://localhost:4566  # LocalStack
ACTION_TRACKING_TABLE=action_tracking
USER_SESSIONS_TABLE=user_sessions

# Redis Configuration  
REDIS_URL=redis://localhost:6379
REDIS_DB=1

# WebSocket Configuration
WEBSOCKET_PORT=3001

# Worker Configuration
WORKER_CONCURRENCY=5
MAX_RETRY_ATTEMPTS=3
VALIDATION_CHECK_INTERVAL=30000
```

### LocalStack Setup
```yaml
# docker-compose.yml addition
localstack:
  image: localstack/localstack:latest
  environment:
    - SERVICES=dynamodb
    - DEBUG=1
  ports:
    - "4566:4566"
```

## Migration Plan 🚚

### Phase 1: Parallel Implementation
- Implement action tracking alongside existing blocking methods
- Add feature flag to enable/disable action tracking
- Test with development deployments

### Phase 2: Gradual Rollout
- Enable action tracking for specific action types
- Monitor performance and reliability  
- Gather user feedback on UI experience

### Phase 3: Full Migration
- Switch all actions to tracked mode
- Remove blocking implementations
- Clean up legacy timeout handling code

## Monitoring & Observability 📊

### Metrics to Track
- [ ] Action creation rate
- [ ] Action completion time by type  
- [ ] Worker queue depth and processing rate
- [ ] WebSocket connection count
- [ ] DynamoDB read/write capacity utilization
- [ ] Error rates by action type

### Logging Requirements
- [ ] Action lifecycle events (created, started, completed, failed)
- [ ] Worker execution logs with actionId correlation
- [ ] WebSocket connection and message logs
- [ ] DynamoDB operation logs with performance metrics

## Security Considerations 🔒

- [ ] **Action Authorization**: Verify user permissions before creating actions
- [ ] **Session Validation**: Authenticate WebSocket connections
- [ ] **Data Isolation**: Ensure users can only access their own actions
- [ ] **Input Validation**: Sanitize all action parameters
- [ ] **Rate Limiting**: Prevent action spam from single users

## Success Criteria 🎯

### Performance
- Actions created in <100ms
- Status updates delivered to UI in <5s
- Worker job processing starts within 10s
- 99.9% action completion tracking accuracy

### User Experience  
- Real-time status updates without page refresh
- Clear progress indicators for long-running actions
- Intuitive follow-up action suggestions
- Consistent action tracking across all agent types

### Reliability
- Zero lost actions due to system failures
- Graceful degradation when components are unavailable
- Automatic retry for transient failures
- Complete audit trail for all platform operations

---

## Current Status: 🟢 Phase 1 Complete, Phase 2 In Progress

**Last Updated**: 2025-01-30  
**Progress**: Phase 1 Complete (100%) → Phase 2 Started (0%)
**Next Steps**: Implement Action Manager service with DynamoDB CRUD operations

### Completed ✅
- **Phase 1**: Complete DynamoDB schema and Action Registry setup
  - Action tracking table created with all GSI indexes and TTL
  - Comprehensive Action Registry with all agent actions defined
  - Core TypeScript interfaces and types
  - Table creation scripts updated and tested
  - Environment variables configured

### In Progress 🟡  
- **Phase 2**: Action Manager service implementation
  - DynamoDB CRUD operations
  - Action creation and status management
  - Queue integration planning

### Upcoming ⏳
- Worker framework development
- Agent integration updates
- UI real-time components