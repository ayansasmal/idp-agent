import { NextRequest, NextResponse } from "next/server";
import { sessionManager } from "@/lib/session-manager";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'web-user';
    const limit = parseInt(searchParams.get('limit') || '10');

    const sessions = await sessionManager.getRecentSessions(userId, limit);

    return NextResponse.json({
      success: true,
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        title: session.title,
        lastActivity: session.lastActivity,
        createdAt: session.createdAt,
        messageCount: session.messageCount,
        resourceCount: session.resourceCount,
        isActive: session.isActive
      }))
    });
  } catch (error) {
    console.error("Failed to get sessions:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to retrieve sessions",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const action = searchParams.get('action'); // 'deactivate' or 'delete'

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    if (action === 'deactivate') {
      await sessionManager.deactivateSession(sessionId);
    } else {
      await sessionManager.deleteSession(sessionId);
    }

    return NextResponse.json({
      success: true,
      message: `Session ${action === 'deactivate' ? 'deactivated' : 'deleted'} successfully`
    });
  } catch (error) {
    console.error("Failed to delete/deactivate session:", error);
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to modify session",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}