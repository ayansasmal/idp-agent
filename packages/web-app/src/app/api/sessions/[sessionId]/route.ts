import { NextRequest, NextResponse } from "next/server";
import { sessionManager } from "@/lib/session-manager";

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    const session = await sessionManager.getSession(sessionId, 'web-user');

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        title: session.title,
        messages: session.messages,
        deployedResources: session.deployedResources,
        lastActivity: session.lastActivity,
        createdAt: session.createdAt,
        messageCount: session.messageCount,
        resourceCount: session.resourceCount,
        isActive: session.isActive,
        environment: session.environment,
        permissions: session.permissions
      }
    });
  } catch (error) {
    console.error("Failed to get session:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to retrieve session",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}