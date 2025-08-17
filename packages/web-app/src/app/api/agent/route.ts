import { NextRequest, NextResponse } from "next/server";
import { OperationRequestSchema } from "@/lib/types";
import { z } from "zod";
import { PrimaryAgent, createAgent, RequestContext } from "@ai-idp/core";

// Global agent instance
let primaryAgent: PrimaryAgent | null = null;

// Initialize agent on startup
async function getAgent(): Promise<PrimaryAgent> {
  if (!primaryAgent) {
    try {
      primaryAgent = await createAgent();
      console.log('Primary Agent initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Primary Agent:', error);
      throw new Error('Agent initialization failed');
    }
  }
  return primaryAgent;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, context } = body;
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages array is required" },
        { status: 400 }
      );
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.content) {
      return NextResponse.json(
        { error: "Last message must have content" },
        { status: 400 }
      );
    }

    // Validate request context
    const operationRequest = OperationRequestSchema.parse({
      userInput: lastMessage.content,
      context: context || {
        userId: "web-user",
        environment: "development",
        permissions: ["read", "write", "deploy"],
      },
    });

    // Create request context
    const requestContext = {
      userId: operationRequest.context.userId,
      sessionId: `web-session-${Date.now()}`,
      originalRequest: operationRequest.userInput,
      environment: operationRequest.context.environment,
      permissions: operationRequest.context.permissions,
      auditTrail: [],
      timestamp: new Date().toISOString(),
    };

    // Get the core agent instance
    const agent = await getAgent();
    
    // Process the request with the real core agent
    const result = await agent.processRequest(operationRequest.userInput, requestContext as RequestContext);
    
    // Check if the result has actions that require approval
    let approvalId = result.metadata?.approvalId;
    const hasApprovalRequiredActions = result.actions?.some((action: any) => 
      action.riskLevel === 'high' || action.riskLevel === 'critical'
    );
    
    if (hasApprovalRequiredActions && result.actions && result.actions.length > 0 && !approvalId) {
      const primaryAction = result.actions[0]; // Take the first action for approval
      
      // Create approval record via our API
      const approvalResponse = await fetch(new URL('/api/approvals', req.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resource: primaryAction.resourceName,
          action: primaryAction.action,
          parameters: primaryAction.parameters,
          diff: `Proposed ${primaryAction.action} operation on ${primaryAction.resourceName}:\n\n${primaryAction.explanation}`,
          explanation: primaryAction.explanation,
          rollbackPlan: primaryAction.rollbackPlan,
          riskLevel: primaryAction.riskLevel,
          estimatedImpact: primaryAction.estimatedImpact,
          confidence: result.metadata?.confidence || 0.85,
          createdBy: requestContext.userId,
        }),
      });
      
      if (approvalResponse.ok) {
        const approval = await approvalResponse.json();
        approvalId = approval.id;
      }
    }
    
    // Generate response content from the agent's message
    let responseContent = result.message || "Operation processed successfully";
    
    // Add approval information if needed
    if (hasApprovalRequiredActions && approvalId) {
      const primaryAction = result.actions?.[0];
      const riskLevel = primaryAction?.riskLevel || 'high';
      responseContent += `\n\n⚠️ **Approval Required**: This operation requires human approval due to ${riskLevel} risk level. View approval details: [Approval ${approvalId}](/approvals?id=${approvalId})`;
    }
    
    // Return the response in chat format
    return NextResponse.json({
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: responseContent,
      metadata: {
        requiresApproval: hasApprovalRequiredActions || false,
        approvalId: approvalId,
        confidence: result.metadata?.confidence || 0.85,
        riskLevel: result.actions?.[0]?.riskLevel || 'low',
        success: result.success,
        actions: result.actions?.length || 0,
      },
    });

  } catch (error: any) {
    console.error("Agent API error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request format", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    console.log('Getting agent for health check...');
    const agent = await getAgent();
    console.log('Agent obtained, calling getHealthStatus...');
    const health = await agent.getHealthStatus();
    console.log('Health status received:', health);
    
    return NextResponse.json({
      status: health.status,
      timestamp: new Date().toISOString(),
      agentReady: health.status === "healthy",
      modules: Object.keys(health.checks || {}),
      checks: health.checks,
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { 
        status: "unhealthy", 
        error: error.message,
        timestamp: new Date().toISOString(),
        agentReady: false,
        modules: [],
      },
      { status: 500 }
    );
  }
}