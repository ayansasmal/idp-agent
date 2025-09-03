"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { WebSocketMessage, ActionUpdate, ActionRecord } from '@/lib/types';

interface WebSocketContextType {
  // Connection state
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  
  // Action tracking
  activeActions: Map<string, ActionRecord>;
  
  // Methods
  connect: () => void;
  disconnect: () => void;
  subscribeToAction: (actionId: string, callback: (update: ActionUpdate) => void) => () => void;
  subscribeToUserActions: (userId: string, callback: (actions: ActionRecord[]) => void) => () => void;
  sendMessage: (message: WebSocketMessage) => void;
  
  // Statistics
  stats: {
    totalActions: number;
    pendingActions: number;
    runningActions: number;
    completedActions: number;
    failedActions: number;
  };
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
  metaAgentUrl?: string;
  userId?: string;
  sessionId?: string;
  autoConnect?: boolean;
}

export function WebSocketProvider({ 
  children, 
  metaAgentUrl = process.env.NEXT_PUBLIC_META_AGENT_URL || 'ws://localhost:3000',
  userId = 'web-user',
  sessionId,
  autoConnect = true
}: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [activeActions, setActiveActions] = useState<Map<string, ActionRecord>>(new Map());
  const [stats, setStats] = useState({
    totalActions: 0,
    pendingActions: 0,
    runningActions: 0,
    completedActions: 0,
    failedActions: 0
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const actionSubscribersRef = useRef<Map<string, Set<(update: ActionUpdate) => void>>>(new Map());
  const userActionSubscribersRef = useRef<Map<string, Set<(actions: ActionRecord[]) => void>>>(new Map());

  const calculateStats = useCallback((actions: Map<string, ActionRecord>) => {
    const actionArray = Array.from(actions.values());
    
    return {
      totalActions: actionArray.length,
      pendingActions: actionArray.filter(a => a.status === 'pending').length,
      runningActions: actionArray.filter(a => a.status === 'running').length,
      completedActions: actionArray.filter(a => a.status === 'completed').length,
      failedActions: actionArray.filter(a => a.status === 'failed').length,
    };
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'action-update':
          const actionUpdate = message.payload as ActionUpdate;
          
          // Update active actions
          setActiveActions(prev => {
            const newActions = new Map(prev);
            const existing = newActions.get(actionUpdate.actionId);
            
            if (existing) {
              const updated = {
                ...existing,
                status: actionUpdate.status || existing.status,
                progress: actionUpdate.progress ?? existing.progress,
                lastUpdate: new Date().toISOString(),
                ...(actionUpdate.result && { result: actionUpdate.result }),
                ...(actionUpdate.status === 'completed' && { completedTime: new Date().toISOString() })
              };
              newActions.set(actionUpdate.actionId, updated);
            }
            
            return newActions;
          });
          
          // Notify action subscribers
          const actionCallbacks = actionSubscribersRef.current.get(actionUpdate.actionId);
          if (actionCallbacks) {
            actionCallbacks.forEach(callback => callback(actionUpdate));
          }
          break;
          
        case 'action-complete':
          const completedAction = message.payload as ActionRecord;
          
          setActiveActions(prev => {
            const newActions = new Map(prev);
            newActions.set(completedAction.actionId, completedAction);
            return newActions;
          });
          break;
          
        case 'system-message':
          console.log('System message:', message.payload);
          break;
          
        case 'error':
          console.error('WebSocket error message:', message.payload);
          break;
          
        default:
          console.warn('Unknown WebSocket message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setConnectionStatus('connecting');
    
    try {
      const wsUrl = `${metaAgentUrl}/ws?userId=${userId}&sessionId=${sessionId || 'default'}`;
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        setConnectionStatus('connected');
        console.log('WebSocket connected to Meta-Agent');
        
        // Clear reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        
        // Request initial action list
        sendMessage({
          type: 'system-message',
          payload: { action: 'get-user-actions', userId },
          timestamp: new Date().toISOString(),
          userId,
          sessionId
        });
      };
      
      wsRef.current.onmessage = handleMessage;
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };
      
      wsRef.current.onclose = (event) => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        console.log('WebSocket disconnected:', event.code, event.reason);
        
        // Attempt to reconnect after 3 seconds if not intentionally closed
        if (event.code !== 1000 && autoConnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };
      
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, [metaAgentUrl, userId, sessionId, autoConnect, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User initiated disconnect');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message:', message);
    }
  }, []);

  const subscribeToAction = useCallback((actionId: string, callback: (update: ActionUpdate) => void) => {
    if (!actionSubscribersRef.current.has(actionId)) {
      actionSubscribersRef.current.set(actionId, new Set());
    }
    actionSubscribersRef.current.get(actionId)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = actionSubscribersRef.current.get(actionId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          actionSubscribersRef.current.delete(actionId);
        }
      }
    };
  }, []);

  const subscribeToUserActions = useCallback((userId: string, callback: (actions: ActionRecord[]) => void) => {
    if (!userActionSubscribersRef.current.has(userId)) {
      userActionSubscribersRef.current.set(userId, new Set());
    }
    userActionSubscribersRef.current.get(userId)!.add(callback);
    
    return () => {
      const callbacks = userActionSubscribersRef.current.get(userId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          userActionSubscribersRef.current.delete(userId);
        }
      }
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Update stats when actions change
  useEffect(() => {
    setStats(calculateStats(activeActions));
  }, [activeActions, calculateStats]);

  const contextValue: WebSocketContextType = {
    isConnected,
    connectionStatus,
    activeActions,
    stats,
    connect,
    disconnect,
    subscribeToAction,
    subscribeToUserActions,
    sendMessage
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Hook for tracking a specific action
export function useActionTracking(actionId?: string) {
  const { subscribeToAction, activeActions } = useWebSocket();
  const [actionData, setActionData] = useState<ActionRecord | null>(null);
  const [updates, setUpdates] = useState<ActionUpdate[]>([]);

  useEffect(() => {
    if (!actionId) return;

    // Get initial data
    const existing = activeActions.get(actionId);
    if (existing) {
      setActionData(existing);
    }

    // Subscribe to updates
    const unsubscribe = subscribeToAction(actionId, (update) => {
      setUpdates(prev => [...prev, update]);
      
      // Update action data if available
      if (existing) {
        const updated = {
          ...existing,
          status: update.status || existing.status,
          progress: update.progress ?? existing.progress,
          lastUpdate: new Date().toISOString(),
          ...(update.result && { result: update.result })
        };
        setActionData(updated);
      }
    });

    return unsubscribe;
  }, [actionId, subscribeToAction, activeActions]);

  return {
    actionData,
    updates,
    isTracking: !!actionId && !!actionData,
  };
}