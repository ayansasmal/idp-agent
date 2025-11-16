"use client";

import { useState, useEffect, useMemo } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import ActionStatusCard from './ActionStatusCard';
import IntelligentPrompts from './IntelligentPrompts';
import type { ActionRecord, ActionStatus, AgentName, ActionDashboardFilters } from '@/lib/types';

interface ActionDashboardProps {
  userId?: string;
  showFilters?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

export default function ActionDashboard({ 
  userId = 'web-user',
  showFilters = true,
  autoRefresh = true,
  refreshInterval = 30000,
  className = ''
}: ActionDashboardProps) {
  const { activeActions, stats, connectionStatus, subscribeToUserActions } = useWebSocket();
  const [filters, setFilters] = useState<ActionDashboardFilters>({
    status: undefined,
    agent: undefined,
    limit: 20
  });
  const [sortBy, setSortBy] = useState<'startTime' | 'lastUpdate' | 'progress'>('lastUpdate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  // Subscribe to user actions on mount
  useEffect(() => {
    const unsubscribe = subscribeToUserActions(userId, (actions) => {
      console.log('Received user actions update:', actions.length);
    });

    return unsubscribe;
  }, [userId, subscribeToUserActions]);

  // Convert Map to Array and apply filters
  const filteredActions = useMemo(() => {
    const actionsArray = Array.from(activeActions.values());
    
    let filtered = actionsArray.filter(action => {
      // Status filter
      if (filters.status && filters.status.length > 0) {
        if (!filters.status.includes(action.status)) return false;
      }
      
      // Agent filter
      if (filters.agent && filters.agent.length > 0) {
        if (!filters.agent.includes(action.agentName)) return false;
      }
      
      return true;
    });

    // Sort actions
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'startTime':
          aValue = new Date(a.startTime);
          bValue = new Date(b.startTime);
          break;
        case 'lastUpdate':
          aValue = new Date(a.lastUpdate);
          bValue = new Date(b.lastUpdate);
          break;
        case 'progress':
          aValue = a.progress;
          bValue = b.progress;
          break;
        default:
          aValue = new Date(a.lastUpdate);
          bValue = new Date(b.lastUpdate);
      }
      
      const comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Limit results
    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }, [activeActions, filters, sortBy, sortOrder]);

  const toggleActionExpansion = (actionId: string) => {
    setExpandedActions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(actionId)) {
        newSet.delete(actionId);
      } else {
        newSet.add(actionId);
      }
      return newSet;
    });
  };

  const clearFilters = () => {
    setFilters({
      status: undefined,
      agent: undefined,
      limit: 20
    });
  };

  const getStatusColor = (status: ActionStatus) => {
    switch (status) {
      case 'running': return 'text-blue-600 bg-blue-50';
      case 'completed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Action Dashboard</h2>
            <p className="text-sm text-gray-600 mt-1">
              Monitor all platform operations and their status
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' : 
                connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <span className="text-xs text-gray-500 capitalize">{connectionStatus}</span>
            </div>
            
            {/* Auto-refresh indicator */}
            {autoRefresh && (
              <div className="flex items-center space-x-1">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
                <span className="text-xs text-gray-500">Live</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.totalActions}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingActions}</div>
            <div className="text-xs text-gray-500">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.runningActions}</div>
            <div className="text-xs text-gray-500">Running</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completedActions}</div>
            <div className="text-xs text-gray-500">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failedActions}</div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border-b bg-gray-50">
          <div className="flex flex-wrap items-center gap-4">
            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Status:</label>
              <select 
                multiple
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500"
                value={filters.status || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value as ActionStatus);
                  setFilters(prev => ({ ...prev, status: selected.length > 0 ? selected : undefined }));
                }}
              >
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
                <option value="timeout">Timeout</option>
              </select>
            </div>

            {/* Agent Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Agent:</label>
              <select 
                multiple
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500"
                value={filters.agent || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value as AgentName);
                  setFilters(prev => ({ ...prev, agent: selected.length > 0 ? selected : undefined }));
                }}
              >
                <option value="infrastructure">Infrastructure</option>
                <option value="observability">Observability</option>
                <option value="meta">Meta</option>
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Sort:</label>
              <select 
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="lastUpdate">Last Update</option>
                <option value="startTime">Start Time</option>
                <option value="progress">Progress</option>
              </select>
              <select 
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>

            {/* Limit */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">Limit:</label>
              <select 
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500"
                value={filters.limit || 20}
                onChange={(e) => setFilters(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Clear Filters */}
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Intelligent Prompts */}
      <div className="p-4 border-b">
        <IntelligentPrompts 
          onActionSuggested={(action) => {
            // For dashboard, we could open a modal or navigate to chat
            console.log('Suggested action:', action);
            // TODO: Implement navigation to chat with pre-filled input
          }}
        />
      </div>

      {/* Actions List */}
      <div className="p-4">
        {filteredActions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">🔍</div>
            <h3 className="text-lg font-medium text-gray-900">No actions found</h3>
            <p className="text-gray-500 mt-1">
              {activeActions.size === 0 
                ? "No actions have been initiated yet." 
                : "No actions match the current filters."}
            </p>
            {filters.status || filters.agent ? (
              <button
                onClick={clearFilters}
                className="mt-3 text-blue-600 hover:text-blue-800 underline"
              >
                Clear filters to see all actions
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredActions.map((action) => (
              <ActionStatusCard
                key={action.actionId}
                actionId={action.actionId}
                initialData={action}
                showProgress={true}
                showDetails={expandedActions.has(action.actionId)}
                onComplete={(actionData) => {
                  console.log('Action completed:', actionData);
                }}
                className="w-full"
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {filteredActions.length > 0 && (
        <div className="p-4 border-t bg-gray-50 text-center">
          <p className="text-sm text-gray-600">
            Showing {filteredActions.length} of {activeActions.size} total actions
          </p>
        </div>
      )}
    </div>
  );
}