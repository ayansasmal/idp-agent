import { NextRequest, NextResponse } from "next/server";
import { OperationRequestSchema } from "@/lib/types";
import { z } from "zod";
import { MetaAgent, createMetaAgent } from "@ai-idp/meta-agent";
import { ConversationContext } from "@ai-idp/types";
import { sessionManager, ConversationMessage } from "@/lib/session-manager";

// Global agent instance
let metaAgent: MetaAgent | null = null;

// Initialize agent on startup
async function getAgent(): Promise<MetaAgent> {
  if (!metaAgent) {
    try {
      metaAgent = createMetaAgent();
      await metaAgent.initialize();
      console.log('Meta Agent initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Meta Agent:', error);
      throw new Error('Agent initialization failed');
    }
  }
  return metaAgent;
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

    // Extract namespace from user input if provided
    let userInput = lastMessage.content;
    let specificNamespace = undefined;
    
    // Check if user input contains namespace specification
    const namespaceMatch = userInput.match(/\(use namespace:\s*([^)]+)\)/);
    if (namespaceMatch) {
      specificNamespace = namespaceMatch[1].trim();
      // Remove the namespace specification from the user input
      userInput = userInput.replace(/\s*\(use namespace:[^)]+\)\s*/, '').trim();
    }

    // Validate request context
    const operationRequest = OperationRequestSchema.parse({
      userInput: userInput,
      context: context || {
        userId: "web-user",
        environment: specificNamespace || "development", // Use specific namespace if provided
        permissions: ["read", "write", "deploy"],
      },
    });

    // Generate session ID from headers or create new one
    const sessionId = req.headers.get('x-session-id') || `web-session-${Date.now()}`;
    
    // Get or create session with conversation context
    const session = await sessionManager.getSession(sessionId, operationRequest.context.userId);
    
    // Generate context prompt from conversation history
    const contextPrompt = await sessionManager.generateContextPrompt(sessionId);
    
    // Add user message to conversation history
    const userMessage: ConversationMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    };
    await sessionManager.addMessage(sessionId, userMessage);

    // Create enhanced user input with context
    const enhancedUserInput = contextPrompt ? `${contextPrompt}${userInput}` : userInput;

    // Create conversation context for MetaAgent
    const conversationContext: ConversationContext = {
      conversationId: sessionId,
      userId: operationRequest.context.userId,
      sessionId: sessionId,
      history: await sessionManager.getConversationHistory(sessionId),
      metadata: {
        environment: operationRequest.context.environment,
        permissions: operationRequest.context.permissions,
        deployedResources: await sessionManager.getDeployedResources(sessionId),
        originalRequest: userInput,
        timestamp: new Date().toISOString(),
        ...(specificNamespace && { specificNamespace })
      }
    };

    // Get the meta agent instance
    const agent = await getAgent();
    
    // Process the request with MetaAgent using enhanced input with conversation context
    const result = await agent.processRequest(enhancedUserInput, conversationContext);
    
    // Track deployed resources in session context
    if (result.success && result.data) {
      // Extract resource info from successful deployments
      if (result.actions && result.actions.length > 0) {
        result.actions.forEach(async (action: any) => {
          if (action.action === 'deploy' && action.resourceName) {
            await sessionManager.addDeployedResource(sessionId, {
              name: action.resourceName,
              type: action.resourceType || 'deployment',
              namespace: action.environment || 'default',
              status: 'deployed'
            });
          }
        });
      }
    }
    
    // Check if the result has approval metadata from the core agent
    const approvalId = result.metadata?.approvalId;
    const hasApprovalRequiredActions = !!approvalId;
    
    // Check if this is a parameter validation response
    const requiresUserInput = result.data?.requiresUserInput === true;
    const missingParameters = result.data?.missingParameters || [];
    
    // Generate response content from the agent's message
    let responseContent = result.message || "Operation processed successfully";
    
    // Format parameter validation responses in a user-friendly way
    if (requiresUserInput && missingParameters.length > 0) {
      responseContent = "I need some additional information to proceed with your request:\n\n";
      
      missingParameters.forEach((param: any, index: number) => {
        responseContent += `**${param.displayName || param.name}**: ${param.description}\n`;
        if (param.example) {
          responseContent += `*Example: ${param.example}*\n`;
        }
        if (index < missingParameters.length - 1) {
          responseContent += "\n";
        }
      });
      
      responseContent += "\nYou can provide the missing information in your next message. For example:\n";
      if (missingParameters.length === 1) {
        const param = missingParameters[0];
        if (param.example) {
          const examples = param.example.split(',').map((ex: string) => ex.trim());
          responseContent += `"${examples[0]}"`;
        }
      } else {
        responseContent += `"${result.data?.originalRequest} with [missing information]"`;
      }
    }
    
    // Add approval information if needed
    else if (hasApprovalRequiredActions && approvalId) {
      const primaryAction = result.actions?.[0];
      const riskLevel = primaryAction?.riskLevel || 'high';
      responseContent += `\n\n⚠️ **Approval Required**: This operation requires human approval due to ${riskLevel} risk level. View approval details: [Approval ${approvalId}](/approvals?id=${approvalId})`;
    }
    
    // Add assistant message to conversation history
    const assistantMessage: ConversationMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content: responseContent,
      timestamp: new Date().toISOString(),
      metadata: {
        success: result.success,
        hasApproval: hasApprovalRequiredActions,
        actions: result.actions?.length || 0
      }
    };
    await sessionManager.addMessage(sessionId, assistantMessage);

    // Return the response in chat format with detailed content
    const response = NextResponse.json({
      id: assistantMessage.id,
      role: "assistant",
      content: responseContent,
      detailedContent: result.detailedResponse,
      rawData: result.data,
      metadata: {
        requiresApproval: hasApprovalRequiredActions || false,
        approvalId: approvalId,
        confidence: result.metadata?.confidence || 0.85,
        riskLevel: result.actions?.[0]?.riskLevel || 'low',
        success: result.success,
        actions: result.actions?.length || 0,
        hasDetailedContent: !!result.detailedResponse,
        hasRawData: !!result.data,
        sessionId: sessionId, // Include session ID in response
        requiresUserInput: requiresUserInput,
        missingParameters: missingParameters,
        parameterValidation: requiresUserInput, // Alternative flag for UI
      },
    });
    
    // Set session ID in response headers for client tracking
    response.headers.set('x-session-id', sessionId);
    
    return response;

  } catch (error: any) {
    console.error("Agent API error:", error);
    console.error("Error stack:", error.stack);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request format", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: error.message || "Unknown error",
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    console.log('Getting Meta Agent for health check...');
    const agent = await getAgent();
    console.log('Meta Agent obtained, calling getAgentStatus...');
    const status = await agent.getAgentStatus();
    console.log('Agent status received:', status);
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      agentReady: true,
      type: "meta-agent",
      registeredAgents: Object.keys(status),
      agentStatus: status,
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
        type: "meta-agent",
        registeredAgents: [],
      },
      { status: 500 }
    );
  }
}