import { NextRequest, NextResponse } from "next/server";
import { ApprovalSchema, type Approval } from "@/lib/types";
import { PrimaryAgent, createAgent, RequestContext } from "@ai-idp/core";
import { z } from "zod";

// Global agent instance
let primaryAgent: PrimaryAgent | null = null;

// Initialize agent on startup
async function getAgent(): Promise<PrimaryAgent> {
  if (!primaryAgent) {
    try {
      primaryAgent = await createAgent();
      console.log('Primary Agent initialized for approvals API');
    } catch (error) {
      console.error('Failed to initialize Primary Agent for approvals:', error);
      throw new Error('Agent initialization failed');
    }
  }
  return primaryAgent;
}

// Convert core approval format to web app format
function convertToWebApproval(coreApproval: any): Approval {
  return {
    id: coreApproval.id,
    state: coreApproval.status === 'pending' ? 'PENDING' : 
           coreApproval.status === 'approved' ? 'APPROVED' : 
           coreApproval.status === 'rejected' ? 'REJECTED' : 'EXPIRED',
    resource: coreApproval.platformAction.resourceName,
    action: coreApproval.platformAction.action,
    parameters: {
      environment: coreApproval.platformAction.environment,
      ...coreApproval.platformAction.parameters,
    },
    diff: `${coreApproval.platformAction.action} ${coreApproval.platformAction.resourceName} in ${coreApproval.platformAction.environment}`,
    explanation: coreApproval.platformAction.explanation || coreApproval.justification,
    rollbackPlan: coreApproval.platformAction.rollbackPlan,
    riskLevel: coreApproval.riskLevel,
    estimatedImpact: coreApproval.platformAction.estimatedImpact,
    confidence: coreApproval.confidence || 0.85,
    createdAt: coreApproval.createdAt,
    createdBy: coreApproval.context.userId,
    reviewedAt: coreApproval.approvedAt || coreApproval.rejectedAt,
    reviewedBy: coreApproval.approvals?.[0]?.approverId || coreApproval.rejections?.[0]?.approverId,
    reviewNotes: coreApproval.approvals?.[0]?.comments || coreApproval.rejections?.[0]?.comments,
  };
}

export async function GET() {
  try {
    const agent = await getAgent();
    
    // Create a dummy context for the approval module request
    const context: RequestContext = {
      userId: "web-user",
      sessionId: `web-session-${Date.now()}`,
      originalRequest: "list pending approvals",
      environment: "development",
      permissions: ["read", "write", "deploy"],
      auditTrail: [],
      timestamp: new Date().toISOString(),
    };

    // Request pending approvals from the core agent
    const result = await agent.processRequest("list pending approvals", context);
    
    if (!result.success) {
      throw new Error(result.message || "Failed to fetch approvals from core agent");
    }

    // Convert core approval format to web app format
    const coreApprovals = result.data?.pendingApprovals || [];
    const webApprovals = coreApprovals.map(convertToWebApproval);
    
    // Sort by creation date, newest first
    const sortedApprovals = webApprovals.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return NextResponse.json(sortedApprovals);
  } catch (error: any) {
    console.error("Failed to fetch approvals from core agent:", error);
    return NextResponse.json(
      { error: "Failed to fetch approvals", message: error.message },
      { status: 500 }
    );
  }
}

// POST method removed - approvals are now created automatically by the core agent
// when operations require approval based on risk assessment

export async function PATCH(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { error: "Approval ID is required" },
        { status: 400 }
      );
    }
    
    const body = await req.json();
    const { state, reviewNotes, reviewedBy } = body;
    
    const agent = await getAgent();
    
    // Create context for the approval action
    const context: RequestContext = {
      userId: reviewedBy || "web-user",
      sessionId: `web-session-${Date.now()}`,
      originalRequest: `${state.toLowerCase()} approval ${id}`,
      environment: "development",
      permissions: ["read", "write", "deploy", "approve"],
      auditTrail: [],
      timestamp: new Date().toISOString(),
    };

    let result;
    
    if (state === "APPROVED") {
      // Approve the request using core agent
      result = await agent.processRequest(
        `approve approval ${id} with comments: ${reviewNotes || "Approved via web interface"}`,
        context
      );
    } else if (state === "REJECTED") {
      // Reject the request using core agent
      result = await agent.processRequest(
        `reject approval ${id} with reason: ${reviewNotes || "Rejected via web interface"}`,
        context
      );
    } else {
      return NextResponse.json(
        { error: "Invalid state. Must be APPROVED or REJECTED" },
        { status: 400 }
      );
    }

    if (!result.success) {
      throw new Error(result.message || "Failed to update approval");
    }

    // Fetch the updated approval from core agent
    const updatedResult = await agent.processRequest(`check approval ${id}`, context);
    
    if (!updatedResult.success) {
      throw new Error("Failed to fetch updated approval");
    }

    // Convert to web format and return
    const webApproval = convertToWebApproval(updatedResult.data);
    
    return NextResponse.json(webApproval);
  } catch (error: any) {
    console.error("Failed to update approval:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid approval update data", details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to update approval", message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    if (!id) {
      return NextResponse.json(
        { error: "Approval ID is required" },
        { status: 400 }
      );
    }
    
    // For now, we'll keep DELETE as a placeholder
    // In a real system, you might want to mark approvals as cancelled rather than delete them
    return NextResponse.json(
      { error: "Approval deletion not implemented. Use PATCH to update status instead." },
      { status: 501 }
    );
  } catch (error: any) {
    console.error("Failed to delete approval:", error);
    
    return NextResponse.json(
      { error: "Failed to delete approval", message: error.message },
      { status: 500 }
    );
  }
}