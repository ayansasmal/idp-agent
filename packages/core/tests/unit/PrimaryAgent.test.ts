import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrimaryAgent } from '../../src/agent/PrimaryAgent';
import { RequestContext } from '../../src/types';

describe('PrimaryAgent', () => {
  let agent: PrimaryAgent;
  let testContext: RequestContext;

  beforeAll(async () => {
    // Skip tests if no API key available
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('Skipping PrimaryAgent tests - ANTHROPIC_API_KEY not set');
      return;
    }

    agent = new PrimaryAgent();
    await agent.initialize();

    testContext = {
      userId: 'test-user',
      sessionId: 'test-session',
      originalRequest: '',
      environment: 'development',
      permissions: ['read', 'write', 'deploy'],
      auditTrail: [],
      timestamp: new Date().toISOString(),
    };
  });

  afterAll(async () => {
    if (agent) {
      await agent.shutdown();
    }
  });

  it('should initialize successfully', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return; // Skip if no API key
    }

    expect(agent).toBeDefined();
    
    const health = await agent.getHealthStatus();
    expect(health.status).toBe('healthy');
  });

  it('should handle basic status request', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return; // Skip if no API key
    }

    const response = await agent.processRequest(
      'Show me the status of my test-app',
      testContext
    );

    expect(response).toBeDefined();
    expect(response.success).toBeDefined();
    expect(response.message).toBeDefined();
    expect(response.timestamp).toBeDefined();
  });

  it('should parse simple deployment request', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return; // Skip if no API key
    }

    const response = await agent.processRequest(
      'Deploy my node.js app called test-service to development',
      testContext
    );

    expect(response).toBeDefined();
    expect(response.message).toBeDefined();
    // Response should contain some indication of the deployment action
    expect(response.message.toLowerCase()).toMatch(/deploy|test-service|development/);
  });

  it('should handle chat interface', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return; // Skip if no API key
    }

    const chatResponse = await agent.chat(
      'Hello, can you help me with my platform?',
      testContext
    );

    expect(chatResponse).toBeDefined();
    expect(typeof chatResponse).toBe('string');
    expect(chatResponse.length).toBeGreaterThan(0);
  });

  it('should provide health status', async () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return; // Skip if no API key
    }

    const health = await agent.getHealthStatus();

    expect(health).toBeDefined();
    expect(health.status).toMatch(/healthy|degraded|unhealthy/);
    expect(health.checks).toBeDefined();
    expect(health.checks.agent).toBeDefined();
    expect(health.timestamp).toBeDefined();
  });
});