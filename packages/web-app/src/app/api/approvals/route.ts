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
  // Handle both the full approval object format and the simplified list format
  const platformAction = coreApproval.platformAction || {};
  const resource = platformAction.resourceName || coreApproval.resource || 'unknown';
  const action = platformAction.action || coreApproval.action || 'unknown';
  const environment = platformAction.environment || coreApproval.environment || 'development';
  
  return {
    id: coreApproval.id,
    state: coreApproval.status === 'pending' ? 'PENDING' : 
           coreApproval.status === 'approved' ? 'APPROVED' : 
           coreApproval.status === 'rejected' ? 'REJECTED' : 
           coreApproval.status === 'expired' ? 'EXPIRED' : 'PENDING', // Default to PENDING for list format
    resource: resource,
    action: action,
    parameters: {
      environment: environment,
      ...(platformAction.parameters || {}),
    },
    diff: `${action} ${resource} in ${environment}`,
    explanation: platformAction.explanation || coreApproval.justification || 'No explanation provided',
    rollbackPlan: platformAction.rollbackPlan || 'No rollback plan specified',
    riskLevel: coreApproval.riskLevel || 'medium',
    estimatedImpact: platformAction.estimatedImpact || 'Unknown impact',
    confidence: coreApproval.confidence || 0.85,
    createdAt: coreApproval.createdAt,
    createdBy: coreApproval.context?.userId || 'system',
    reviewedAt: coreApproval.approvedAt || coreApproval.rejectedAt,
    reviewedBy: coreApproval.approvals?.[0]?.approverId || coreApproval.rejections?.[0]?.approverId,
    reviewNotes: coreApproval.approvals?.[0]?.comments || coreApproval.rejections?.[0]?.comments,
  };
}

export async function GET() {
  try {
    const agent = await getAgent();
    
    // Use direct approval module access (bypasses AI processing)
    const result = await agent.getApprovalModule();
    
    if (!result.success) {
      throw new Error(result.message || "Failed to fetch approvals from approval module");
    }

    // Convert core approval format to web app format
    const coreApprovals = result.result?.pendingApprovals || [];
    const webApprovals = coreApprovals.map(convertToWebApproval);
    
    // Sort by creation date, newest first
    const sortedApprovals = webApprovals.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return NextResponse.json(sortedApprovals);
  } catch (error: any) {
    console.error("Failed to fetch approvals from approval module:", error);
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
      // Approve the request using direct approval module access
      result = await agent.processApprovalAction("approve", id, reviewedBy || "web-user", reviewNotes);
    } else if (state === "REJECTED") {
      // Reject the request using direct approval module access
      result = await agent.processApprovalAction("reject", id, reviewedBy || "web-user", reviewNotes);
    } else {
      return NextResponse.json(
        { error: "Invalid state. Must be APPROVED or REJECTED" },
        { status: 400 }
      );
    }

    if (!result.success) {
      throw new Error(result.message || "Failed to update approval");
    }

    // Get the updated approval data from the result
    const approvalData = result.result || {};
    
    // Convert to web format and return
    // Create a simple approval object for the response
    const webApproval = {
      id: id,
      state: state as 'APPROVED' | 'REJECTED',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewedBy || "web-user",
      reviewNotes: reviewNotes || (state === "APPROVED" ? "Approved via web interface" : "Rejected via web interface"),
      // Add other fields as needed - we'll return what we have
      ...approvalData
    };
    
    return NextResponse.json(webApproval);
  } catch (error: any) {
    console.error("Failed to update approval:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid approval update data", details: error.issues },
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