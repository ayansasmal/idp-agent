"use client";

import { useState, useEffect } from 'react';
import { useActionTracking } from '@/contexts/WebSocketContext';
import type { ActionRecord, ActionStatus } from '@/lib/types';

interface ActionStatusCardProps {
  actionId?: string;
  initialData?: Partial<ActionRecord>;
  showProgress?: boolean;
  showDetails?: boolean;
  onComplete?: (actionData: ActionRecord) => void;
  className?: string;
}

export default function ActionStatusCard({
  actionId,
  initialData,
  showProgress = true,
  showDetails = false,
  onComplete,
  className = ""
}: ActionStatusCardProps) {
  const { actionData, updates, isTracking } = useActionTracking(actionId);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Use tracking data if available, otherwise use initial data
  const data = actionData || (initialData && {
    actionId: initialData.actionId || actionId || 'unknown',
    status: initialData.status || 'pending',
    progress: initialData.progress || 0,
    agentName: initialData.agentName || 'infrastructure',
    toolName: initialData.toolName || 'unknown',
    startTime: initialData.startTime || new Date().toISOString(),
    lastUpdate: initialData.lastUpdate || new Date().toISOString(),
    executionMetadata: initialData.executionMetadata || { retryCount: 0 },
    userId: initialData.userId || 'web-user',
    sessionId: initialData.sessionId || 'session',
    conversationId: initialData.conversationId || 'conv',
    intent: initialData.intent || 'deploy'
  } as ActionRecord);

  // Update last update time when we receive updates
  useEffect(() => {
    if (updates.length > 0) {
      setLastUpdate(new Date());
    }
  }, [updates]);

  // Call onComplete when action finishes
  useEffect(() => {
    if (data && (data.status === 'completed' || data.status === 'failed') && onComplete) {
      onComplete(data);
    }
  }, [data?.status, data, onComplete]);

  if (!data) {
    return (
      <div className={`p-4 border rounded-lg bg-gray-50 ${className}`}>
        <div className="text-gray-500">No action data available</div>
      </div>
    );
  }

  const getStatusColor = (status: ActionStatus) => {
    switch (status) {
      case 'pending': return 'text-gray-600 bg-gray-100';
      case 'running': return 'text-blue-600 bg-blue-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'timeout': return 'text-yellow-600 bg-yellow-100';
      case 'cancelled': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: ActionStatus) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'timeout': return '⏰';
      case 'cancelled': return '🚫';
      default: return '❓';
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end.getTime() - start.getTime();
    
    if (diffMs < 1000) return `${diffMs}ms`;
    if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s`;
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ${Math.floor((diffMs % 60000) / 1000)}s`;
    return `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`;
  };

  const getProgressWidth = () => {
    if (data.status === 'completed') return '100%';
    if (data.status === 'failed' || data.status === 'cancelled') return '0%';
    return `${Math.max(data.progress || 0, 5)}%`; // Minimum 5% for visibility
  };

  return (
    <div className={`border rounded-lg bg-white shadow-sm ${className}`}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">{getStatusIcon(data.status)}</span>
            <div>
              <h3 className="font-semibold text-gray-900">
                {data.toolName}
              </h3>
              <p className="text-sm text-gray-600">
                {data.agentName} agent • {formatDuration(data.startTime, data.completedTime)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(data.status)}`}>
              {data.status.toUpperCase()}
            </span>
            {isTracking && (
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Real-time tracking active" />
            )}
          </div>
        </div>
        
        {/* Progress Bar */}
        {showProgress && (data.status === 'pending' || data.status === 'running') && (
          <div className="mt-3">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>{data.progress || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  data.status === 'running' ? 'bg-blue-500' : 'bg-gray-400'
                }`}
                style={{ width: getProgressWidth() }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Info */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Action ID:</span>
            <p className="font-mono text-xs break-all">{data.actionId}</p>
          </div>
          <div>
            <span className="text-gray-500">Last Updated:</span>
            <p>{new Date(data.lastUpdate).toLocaleTimeString()}</p>
          </div>
        </div>
        
        {data.executionMetadata?.estimatedDuration && (
          <div className="mt-2 text-sm">
            <span className="text-gray-500">Estimated Duration: </span>
            <span>{Math.round(data.executionMetadata.estimatedDuration / 1000)}s</span>
          </div>
        )}

        {/* Error Display */}
        {data.status === 'failed' && data.result?.error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
            <h4 className="text-sm font-medium text-red-800">Error</h4>
            <p className="text-sm text-red-700 mt-1">{data.result.error}</p>
          </div>
        )}

        {/* Success Display */}
        {data.status === 'completed' && data.result?.success && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
            <h4 className="text-sm font-medium text-green-800">Completed Successfully</h4>
            {data.result.resourcesCreated?.length > 0 && (
              <div className="text-sm text-green-700 mt-1">
                <p>Resources created: {data.result.resourcesCreated.join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {/* Details Toggle */}
        {showDetails && (
          <div className="mt-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {isExpanded ? '▼ Hide Details' : '▶ Show Details'}
            </button>
            
            {isExpanded && (
              <div className="mt-2 p-3 bg-gray-50 rounded text-sm">
                <h4 className="font-medium mb-2">Execution Details</h4>
                <dl className="space-y-1">
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-gray-500">Tool Parameters:</dt>
                    <dd className="col-span-2 font-mono text-xs">
                      {data.executionMetadata?.toolParameters ? 
                        JSON.stringify(data.executionMetadata.toolParameters, null, 2) : 
                        'None'}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-gray-500">Environment:</dt>
                    <dd className="col-span-2">{data.executionMetadata?.environment || 'development'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-gray-500">Priority:</dt>
                    <dd className="col-span-2">{data.executionMetadata?.priority || 'normal'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <dt className="text-gray-500">Retry Count:</dt>
                    <dd className="col-span-2">{data.executionMetadata?.retryCount || 0}</dd>
                  </div>
                </dl>

                {/* Update History */}
                {updates.length > 0 && (
                  <div className="mt-3">
                    <h5 className="font-medium mb-1">Recent Updates</h5>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {updates.slice(-5).map((update, index) => (
                        <div key={index} className="text-xs text-gray-600">
                          Status: {update.status}, Progress: {update.progress || 0}%
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}