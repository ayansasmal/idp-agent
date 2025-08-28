import { NextRequest, NextResponse } from "next/server";
// Local definition for RequestContext (remove import if not available)
type RequestContext = {
  userId: string;
  sessionId: string;
  originalRequest: string;
  environment: string;
  permissions: string[];
  auditTrail: any[];
  timestamp: string;
};
import { ApprovalSchema, type Approval } from "@/lib/types";
import { z } from "zod";

// Meta Agent HTTP client
const META_AGENT_URL = process.env.META_AGENT_URL || 'http://localhost:3000';

async function callMetaAgent(endpoint: string, method: string = 'GET', body?: any) {
  try {
    const response = await fetch(`${META_AGENT_URL}${endpoint}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Meta Agent ${method} ${endpoint} failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to call Meta Agent ${endpoint}:`, error);
    throw error;
  }
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
    // Call Meta Agent approvals endpoint
    const result = await callMetaAgent('/approvals');

    if (!result.success && result.success !== undefined) {
      throw new Error(result.message || "Failed to fetch approvals from Meta Agent");
    }

    // Handle different response formats
    const coreApprovals = result.result?.pendingApprovals || result.approvals || result || [];
    const webApprovals = Array.isArray(coreApprovals) 
      ? coreApprovals.map(convertToWebApproval)
      : [];

    // Sort by creation date, newest first
    const sortedApprovals = webApprovals.sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json(sortedApprovals);
  } catch (error: any) {
    console.error("Failed to fetch approvals from Meta Agent:", error);
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

    let result;

    if (state === "APPROVED") {
      // Call Meta Agent approve endpoint
      result = await callMetaAgent('/approvals/approve', 'POST', {
        id,
        approverId: reviewedBy || "web-user",
        comments: reviewNotes
      });
    } else if (state === "REJECTED") {
      // Call Meta Agent reject endpoint
      result = await callMetaAgent('/approvals/reject', 'POST', {
        id,
        approverId: reviewedBy || "web-user", 
        comments: reviewNotes
      });
    } else {
      return NextResponse.json(
        { error: "Invalid state. Must be APPROVED or REJECTED" },
        { status: 400 }
      );
    }

    if (!result.success && result.success !== undefined) {
      throw new Error(result.message || "Failed to update approval");
    }

    // Create response
    const webApproval = {
      id: id,
      state: state as 'APPROVED' | 'REJECTED',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewedBy || "web-user",
      reviewNotes: reviewNotes || (state === "APPROVED" ? "Approved via web interface" : "Rejected via web interface"),
      ...result.result
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