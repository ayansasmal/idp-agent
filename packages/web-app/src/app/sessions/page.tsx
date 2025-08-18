"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatBubbleLeftRightIcon, TrashIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

interface SessionSummary {
  sessionId: string;
  title: string;
  lastActivity: string;
  createdAt: string;
  messageCount: number;
  resourceCount: number;
  isActive: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sessions?userId=web-user&limit=20');
      const data = await response.json();
      
      if (data.success) {
        setSessions(data.sessions);
      } else {
        setError(data.message || 'Failed to load sessions');
      }
    } catch (err) {
      setError('Failed to load sessions');
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const resumeSession = (sessionId: string) => {
    // Redirect to chat with session ID
    router.push(`/chat?sessionId=${sessionId}`);
  };

  const deactivateSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions?sessionId=${sessionId}&action=deactivate`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setSessions(sessions.map(s => 
          s.sessionId === sessionId ? { ...s, isActive: false } : s
        ));
      } else {
        setError('Failed to deactivate session');
      }
    } catch (err) {
      setError('Failed to deactivate session');
      console.error('Error deactivating session:', err);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to permanently delete this session?')) {
      return;
    }

    try {
      const response = await fetch(`/api/sessions?sessionId=${sessionId}&action=delete`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setSessions(sessions.filter(s => s.sessionId !== sessionId));
      } else {
        setError('Failed to delete session');
      }
    } catch (err) {
      setError('Failed to delete session');
      console.error('Error deleting session:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Chat Sessions</h1>
        <p className="mt-2 text-lg text-gray-600">
          Resume previous conversations or start a new chat
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} found
        </div>
        <button
          onClick={() => router.push('/chat')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2" />
          New Chat
        </button>
      </div>

      <div className="grid gap-4">
        {sessions.map((session) => (
          <div
            key={session.sessionId}
            className={`border rounded-lg p-4 hover:shadow-md transition-shadow duration-200 ${
              session.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className={`text-lg font-medium truncate ${
                    session.isActive ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {session.title}
                  </h3>
                  {!session.isActive && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Archived
                    </span>
                  )}
                </div>
                
                <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
                  <span>{formatDate(session.lastActivity)}</span>
                  <span>•</span>
                  <span>{session.messageCount} message{session.messageCount !== 1 ? 's' : ''}</span>
                  {session.resourceCount > 0 && (
                    <>
                      <span>•</span>
                      <span>{session.resourceCount} resource{session.resourceCount !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </div>
                
                <div className="mt-1 text-xs text-gray-400">
                  Session ID: {session.sessionId}
                </div>
              </div>

              <div className="flex items-center space-x-2 ml-4">
                {session.isActive ? (
                  <>
                    <button
                      onClick={() => resumeSession(session.sessionId)}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => deactivateSession(session.sessionId)}
                      className="inline-flex items-center p-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      title="Archive session"
                    >
                      <EyeSlashIcon className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => resumeSession(session.sessionId)}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    View
                  </button>
                )}
                
                <button
                  onClick={() => deleteSession(session.sessionId)}
                  className="inline-flex items-center p-1 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  title="Delete session permanently"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {sessions.length === 0 && !loading && (
          <div className="text-center py-12">
            <ChatBubbleLeftRightIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No chat sessions</h3>
            <p className="text-gray-500 mb-4">Start your first conversation with the AI platform assistant.</p>
            <button
              onClick={() => router.push('/chat')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Start New Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}