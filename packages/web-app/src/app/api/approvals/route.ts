import { NextRequest, NextResponse } from "next/server";
import { ApprovalSchema, type Approval } from "@/lib/types";
import { z } from "zod";

// In-memory store for demo - replace with database in production
let approvals: Approval[] = [
  {
    id: "demo-approval-1",
    state: "PENDING",
    resource: "my-app",
    action: "deploy",
    parameters: { 
      environment: "staging",
      image: "my-app:v1.2.0",
      replicas: 3,
    },
    diff: `+ Deploy my-app:v1.2.0 to staging
+ Scale to 3 replicas
+ Add PostgreSQL database connection`,
    explanation: "Deploy new version of my-app to staging environment with database connection",
    rollbackPlan: "Use kubectl rollout undo deployment/my-app to roll back to previous version",
    riskLevel: "medium",
    estimatedImpact: "Temporary downtime during deployment (~30 seconds), affects staging users only",
    confidence: 0.95,
    createdAt: new Date().toISOString(),
    createdBy: "web-user",
  },
  {
    id: "demo-approval-2", 
    state: "APPROVED",
    resource: "payment-service",
    action: "scale",
    parameters: {
      environment: "production",
      replicas: 5,
    },
    diff: `+ Scale payment-service from 3 to 5 replicas
+ Update HPA maxReplicas to 10`,
    explanation: "Scale payment service to handle increased traffic during Black Friday",
    rollbackPlan: "Scale back to 3 replicas: kubectl scale deployment payment-service --replicas=3",
    riskLevel: "low", 
    estimatedImpact: "Improved performance, no downtime expected",
    confidence: 0.98,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    createdBy: "prod-user",
    reviewedAt: new Date().toISOString(),
    reviewedBy: "ops-team",
    reviewNotes: "Approved for Black Friday traffic scaling",
  },
];

export async function GET() {
  try {
    // Sort by creation date, newest first
    const sortedApprovals = [...approvals].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return NextResponse.json(sortedApprovals);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch approvals", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Create new approval
    const newApproval: Approval = {
      id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      state: "PENDING",
      createdAt: new Date().toISOString(),
      createdBy: body.createdBy || "web-user",
      ...body,
    };

    // Validate the approval object
    const validatedApproval = ApprovalSchema.parse(newApproval);
    
    // Add to store
    approvals.unshift(validatedApproval);
    
    return NextResponse.json(validatedApproval, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create approval:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid approval data", details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to create approval", message: error.message },
      { status: 500 }
    );
  }
}

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
    
    // Find and update approval
    const approvalIndex = approvals.findIndex(a => a.id === id);
    if (approvalIndex === -1) {
      return NextResponse.json(
        { error: "Approval not found" },
        { status: 404 }
      );
    }
    
    // Update the approval
    approvals[approvalIndex] = {
      ...approvals[approvalIndex],
      state: state || approvals[approvalIndex].state,
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewedBy || "web-user",
      reviewNotes: reviewNotes || approvals[approvalIndex].reviewNotes,
    };
    
    // Validate updated approval
    const updatedApproval = ApprovalSchema.parse(approvals[approvalIndex]);
    approvals[approvalIndex] = updatedApproval;
    
    return NextResponse.json(updatedApproval);
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
    
    // Find and remove approval
    const approvalIndex = approvals.findIndex(a => a.id === id);
    if (approvalIndex === -1) {
      return NextResponse.json(
        { error: "Approval not found" },
        { status: 404 }
      );
    }
    
    const deletedApproval = approvals.splice(approvalIndex, 1)[0];
    
    return NextResponse.json({ 
      message: "Approval deleted successfully",
      approval: deletedApproval,
    });
  } catch (error: any) {
    console.error("Failed to delete approval:", error);
    
    return NextResponse.json(
      { error: "Failed to delete approval", message: error.message },
      { status: 500 }
    );
  }
}