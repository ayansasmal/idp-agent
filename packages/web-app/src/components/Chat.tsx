"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import MessageList from "./MessageList";
import Composer from "./Composer";
import ActionStatusCard from "./ActionStatusCard";
import { nanoid } from "nanoid";
import { useWebSocket } from "@/contexts/WebSocketContext";
import IntelligentPrompts from "./IntelligentPrompts";
import type { ChatMessage, ActionRecord, ActionUpdate } from "@/lib/types";

export default function Chat() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [activeActions, setActiveActions] = useState<Map<string, ActionRecord>>(new Map());
  const sessionIdRef = useRef<string | null>(null);
  const { isConnected, connectionStatus, subscribeToAction } = useWebSocket();

  // Check for session ID in URL params
  useEffect(() => {
    const sessionId = searchParams?.get('sessionId');
    if (sessionId) {
      sessionIdRef.current = sessionId;
      loadSession(sessionId);
    } else {
      // Show welcome message for new sessions
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: "Hello! I'm your AI platform engineering assistant. You can ask me to deploy applications, scale services, check status, or perform other platform operations. Try something like:\n\n• \"Deploy my Node.js app to staging\"\n• \"Scale my payment service to 5 replicas\"\n• \"Show me the status of my production services\"\n\nWhat would you like to do?",
        timestamp: new Date().toISOString(),
      }]);
    }
  }, [searchParams]);

  // Handle action updates from WebSocket
  const handleActionUpdate = useCallback((actionId: string, update: ActionUpdate) => {
    setActiveActions(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(actionId);
      
      if (existing) {
        const updated = {
          ...existing,
          status: update.status || existing.status,
          progress: update.progress ?? existing.progress,
          lastUpdate: new Date().toISOString(),
          ...(update.result && { result: update.result }),
          ...(update.status === 'completed' && { completedTime: new Date().toISOString() })
        };
        newMap.set(actionId, updated);
        
        // Update the corresponding message
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.actionId === actionId 
              ? { ...msg, actionStatus: update.status || msg.actionStatus, progress: update.progress ?? msg.progress }
              : msg
          )
        );
      }
      
      return newMap;
    });
  }, []);

  // Subscribe to action updates for all active actions
  useEffect(() => {
    const unsubscribeFunctions: (() => void)[] = [];
    
    activeActions.forEach((action, actionId) => {
      const unsubscribe = subscribeToAction(actionId, (update) => {
        handleActionUpdate(actionId, update);
      });
      unsubscribeFunctions.push(unsubscribe);
    });
    
    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, [activeActions, subscribeToAction, handleActionUpdate]);

  const loadSession = async (sessionId: string) => {
    try {
      setIsLoadingSession(true);
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();
      
      if (data.success && data.session) {
        const session = data.session;
        setSessionTitle(session.title);
        
        // Convert session messages to ChatMessage format
        const chatMessages: ChatMessage[] = session.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata,
          detailedContent: msg.detailedContent,
          rawData: msg.rawData
        }));
        
        setMessages(chatMessages);
      } else {
        setError(new Error('Failed to load session'));
        // Fallback to welcome message
        setMessages([{
          id: "welcome",
          role: "assistant",
          content: "Hello! I'm your AI platform engineering assistant. What would you like to do?",
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      console.error('Error loading session:', err);
      setError(err instanceof Error ? err : new Error('Failed to load session'));
      // Fallback to welcome message
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: "Hello! I'm your AI platform engineering assistant. What would you like to do?",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoadingSession(false);
    }
  };
  
  const context = {
    userId: "web-user",
    environment: "development" as const,
    permissions: ["read", "write", "deploy"],
  };

  const handleNamespaceSelect = async (namespace: string, originalMessage: string) => {
    // Find the last user message to resubmit with namespace
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const messageToResubmit = lastUserMessage?.content || originalMessage;
    
    // Resubmit the original request with the selected namespace
    const enhancedMessage = `${messageToResubmit} (use namespace: ${namespace})`;
    await submitMessage(enhancedMessage);
  };

  const submitMessage = async (messageContent: string) => {
    const userMessage: ChatMessage = {
      id: nanoid(),
      role: "user",
      content: messageContent,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      // Include session ID if we have one
      if (sessionIdRef.current) {
        headers["x-session-id"] = sessionIdRef.current;
      }

      const response = await fetch("/api/agent", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context,
        }),
      });

      // Extract session ID from response headers
      const responseSessionId = response.headers.get('x-session-id');
      if (responseSessionId) {
        sessionIdRef.current = responseSessionId;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const assistantMessage = await response.json();
      
      const chatMessage: ChatMessage = {
        id: assistantMessage.id || nanoid(),
        role: "assistant",
        content: assistantMessage.content,
        timestamp: new Date().toISOString(),
        metadata: assistantMessage.metadata,
        detailedContent: assistantMessage.detailedContent,
        rawData: assistantMessage.rawData,
        // Extract action tracking info from response
        actionId: assistantMessage.rawData?.actionId || assistantMessage.metadata?.actionId,
        actionStatus: 'pending', // Initial status for tracked actions
        progress: 0,
        trackingEnabled: !!assistantMessage.rawData?.actionId,
        estimatedDuration: assistantMessage.rawData?.estimatedDuration
      };

      setMessages(prev => [...prev, chatMessage]);
      
          // If this message has an actionId, start tracking it
      if (chatMessage.actionId) {
        const actionRecord: ActionRecord = {
          actionId: chatMessage.actionId,
          status: 'pending',
          progress: 0,
          toolName: assistantMessage.metadata?.action || 'unknown',
          agentName: (assistantMessage.metadata?.agent || 'infrastructure') as any,
          startTime: new Date().toISOString(),
          lastUpdate: new Date().toISOString(),
          executionMetadata: {
            retryCount: 0,
            toolParameters: assistantMessage.rawData?.toolParameters,
            environment: context.environment,
            priority: 'normal',
            estimatedDuration: assistantMessage.rawData?.estimatedDuration
          },
          userId: context.userId || 'web-user',
          sessionId: sessionIdRef.current || 'default',
          conversationId: sessionIdRef.current || 'default',
          intent: 'deploy'
        };
        
        setActiveActions(prev => {
          const newMap = new Map(prev);
          newMap.set(chatMessage.actionId!, actionRecord);
          return newMap;
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
      
      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: nanoid(),
        role: "assistant",
        content: "Sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date().toISOString(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const messageContent = input.trim();
    setInput("");
    await submitMessage(messageContent);

  };

  return (
    <div className="flex h-[80vh] flex-col rounded-2xl border bg-white shadow-sm">
      {/* Header */}
      <div className="border-b bg-gray-50 px-6 py-4 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {sessionTitle || 'Platform Agent'}
                </h2>
                <p className="text-sm text-gray-500">Natural language platform operations</p>
              </div>
              {sessionIdRef.current && (
                <a
                  href="/sessions"
                  className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  All Sessions
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {isLoadingSession && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
            )}
            <div className={`h-2 w-2 rounded-full ${isLoading ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
            <span className="text-xs text-gray-500">
              {isLoadingSession ? 'Loading...' : isLoading ? 'Processing...' : 'Ready'}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Intelligent Prompts */}
        <IntelligentPrompts 
          onActionSuggested={(action) => {
            setInput(action);
          }}
          className="mb-6"
        />
        
        <MessageList 
          messages={messages} 
          onNamespaceSelect={handleNamespaceSelect}
          onParameterSubmit={submitMessage}
          activeActions={activeActions}
        />
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  {error.message || "Something went wrong. Please try again."}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t bg-gray-50 p-4 rounded-b-2xl">
        <Composer
          value={input}
          onChange={setInput}
          disabled={isLoading}
          onSend={handleSubmit}
        />
      </form>
    </div>
  );
}