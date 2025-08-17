import { NextRequest, NextResponse } from "next/server";
import { OperationRequestSchema } from "@/lib/types";
import { z } from "zod";

// Mock agent implementation for demo purposes
class MockAgent {
  async processRequest(userInput: string, context: any) {
    // Simple intent analysis based on keywords
    const input = userInput.toLowerCase();
    
    let action = "status";
    let resourceName = "unknown-resource";
    let riskLevel = "low";
    let requiresApproval = false;
    
    // Parse intent from user input
    if (input.includes("deploy")) {
      action = "deploy";
      riskLevel = input.includes("production") ? "high" : "medium";
      requiresApproval = riskLevel !== "low";
    } else if (input.includes("scale")) {
      action = "scale";
      riskLevel = input.includes("production") ? "medium" : "low";
      requiresApproval = riskLevel === "high";
    } else if (input.includes("delete") || input.includes("remove")) {
      action = "delete";
      riskLevel = "high";
      requiresApproval = true;
    }
    
    // Extract resource name
    const words = userInput.split(" ");
    for (let i = 0; i < words.length; i++) {
      if (["app", "service", "database", "my"].includes(words[i].toLowerCase()) && i + 1 < words.length) {
        resourceName = words[i + 1].replace(/[^a-zA-Z0-9-]/g, "");
        break;
      }
    }
    
    const platformAction = requiresApproval ? {
      action,
      resourceName,
      parameters: {
        environment: context.environment,
        userRequested: true,
      },
      explanation: `Execute ${action} operation on ${resourceName} in ${context.environment} environment`,
      rollbackPlan: `Revert ${resourceName} to previous state using kubectl rollout undo`,
      riskLevel,
      estimatedImpact: riskLevel === "high" ? "Potential service disruption" : "Minimal impact expected",
      confidence: 0.85,
    } : null;
    
    let response = `I understand you want to ${action} ${resourceName}. `;
    
    if (requiresApproval) {
      response += `Due to the ${riskLevel} risk level of this operation, it requires human approval before execution.`;
    } else {
      response += `This is a ${riskLevel} risk operation. Proceeding with ${action} on ${resourceName}.`;
    }
    
    return {
      response,
      requiresApproval,
      platformAction,
      riskLevel,
      confidence: 0.85,
    };
  }
  
  getHealth() {
    return {
      status: "healthy",
      modules: ["mock-agent"],
    };
  }
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

    // Process the request with our mock agent
    const result = await mockAgent.processRequest(operationRequest.userInput, requestContext);
    
    // If the result requires approval, create an approval record
    let approvalId = result.approvalId;
    if (result.requiresApproval && result.platformAction && !approvalId) {
      // Create approval record via our API
      const approvalResponse = await fetch(new URL('/api/approvals', req.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resource: result.platformAction.resourceName,
          action: result.platformAction.action,
          parameters: result.platformAction.parameters,
          diff: `Proposed ${result.platformAction.action} operation on ${result.platformAction.resourceName}:\n\n${result.platformAction.explanation}`,
          explanation: result.platformAction.explanation,
          rollbackPlan: result.platformAction.rollbackPlan,
          riskLevel: result.platformAction.riskLevel,
          estimatedImpact: result.platformAction.estimatedImpact,
          confidence: result.platformAction.confidence,
          createdBy: requestContext.userId,
        }),
      });
      
      if (approvalResponse.ok) {
        const approval = await approvalResponse.json();
        approvalId = approval.id;
      }
    }
    
    // Generate response content
    let responseContent = result.response;
    if (result.requiresApproval && approvalId) {
      responseContent += `\n\n⚠️ **Approval Required**: This operation requires human approval due to ${result.riskLevel} risk level. View approval details: [Approval ${approvalId}](/approvals?id=${approvalId})`;
    }
    
    // Return the response in chat format
    return NextResponse.json({
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: responseContent,
      metadata: {
        requiresApproval: result.requiresApproval,
        approvalId: approvalId,
        confidence: result.confidence,
        riskLevel: result.riskLevel,
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

const mockAgent = new MockAgent();

export async function GET() {
  try {
    const health = mockAgent.getHealth();
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      agentReady: health.status === "healthy",
      modules: health.modules,
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        status: "unhealthy", 
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}