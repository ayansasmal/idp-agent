"use client";

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { IntelligentPromptsService, type IntelligentPrompt, type ObservabilityTrigger } from '@/lib/intelligent-prompts';

interface IntelligentPromptsProps {
  onActionSuggested?: (action: string) => void;
  className?: string;
}

export default function IntelligentPrompts({ onActionSuggested, className = '' }: IntelligentPromptsProps) {
  const { activeActions } = useWebSocket();
  const [prompts, setPrompts] = useState<IntelligentPrompt[]>([]);
  const [triggers, setTriggers] = useState<ObservabilityTrigger[]>([]);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [expandedTrigger, setExpandedTrigger] = useState<string | null>(null);

  const promptsService = IntelligentPromptsService.getInstance();

  // Handle new prompts
  const handleNewPrompt = useCallback((prompt: IntelligentPrompt) => {
    setPrompts(prev => {
      if (prev.find(p => p.id === prompt.id)) return prev;
      return [...prev, prompt].sort((a, b) => {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
    });
  }, []);

  // Handle new triggers  
  const handleNewTrigger = useCallback((trigger: ObservabilityTrigger) => {
    setTriggers(prev => {
      if (prev.find(t => t.id === trigger.id)) return prev;
      return [...prev, trigger].sort((a, b) => {
        const severityOrder = { critical: 4, error: 3, warning: 2, info: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });
    });
  }, []);

  // Subscribe to prompts and triggers
  useEffect(() => {
    const unsubscribePrompts = promptsService.onPrompt(handleNewPrompt);
    const unsubscribeTriggers = promptsService.onTrigger(handleNewTrigger);

    // Load existing prompts and triggers
    setPrompts(promptsService.getAllPrompts());
    setTriggers(promptsService.getAllTriggers());

    return () => {
      unsubscribePrompts();
      unsubscribeTriggers();
    };
  }, [promptsService, handleNewPrompt, handleNewTrigger]);

  // Process action updates
  useEffect(() => {
    const actions = Array.from(activeActions.values());
    if (actions.length > 0) {
      // Process each action for intelligent prompts
      actions.forEach(action => {
        promptsService.processActionUpdate(action, actions);
      });
    }
  }, [activeActions, promptsService]);

  const dismissPrompt = (promptId: string) => {
    setPrompts(prev => prev.filter(p => p.id !== promptId));
    promptsService.dismissPrompt(promptId);
  };

  const dismissTrigger = (triggerId: string) => {
    setTriggers(prev => prev.filter(t => t.id !== triggerId));
    promptsService.dismissTrigger(triggerId);
  };

  const handleSuggestedAction = (action: string) => {
    if (onActionSuggested) {
      onActionSuggested(action);
    }
  };

  const getPriorityColor = (priority: IntelligentPrompt['priority']) => {
    switch (priority) {
      case 'urgent': return 'border-red-500 bg-red-50';
      case 'high': return 'border-orange-500 bg-orange-50';
      case 'medium': return 'border-yellow-500 bg-yellow-50';
      case 'low': return 'border-blue-500 bg-blue-50';
    }
  };

  const getSeverityColor = (severity: ObservabilityTrigger['severity']) => {
    switch (severity) {
      case 'critical': return 'border-red-600 bg-red-50';
      case 'error': return 'border-red-500 bg-red-50';
      case 'warning': return 'border-yellow-500 bg-yellow-50';
      case 'info': return 'border-blue-500 bg-blue-50';
    }
  };

  const getPriorityIcon = (priority: IntelligentPrompt['priority']) => {
    switch (priority) {
      case 'urgent': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '💡';
      case 'low': return 'ℹ️';
    }
  };

  const getSeverityIcon = (severity: ObservabilityTrigger['severity']) => {
    switch (severity) {
      case 'critical': return '🔥';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return '📊';
    }
  };

  if (prompts.length === 0 && triggers.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Observability Triggers */}
      {triggers.map((trigger) => (
        <div
          key={trigger.id}
          className={`border-l-4 rounded-lg p-4 ${getSeverityColor(trigger.severity)}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <span className="text-xl">{getSeverityIcon(trigger.severity)}</span>
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="font-semibold text-gray-900">{trigger.title}</h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${{
                    critical: 'bg-red-100 text-red-800',
                    error: 'bg-red-100 text-red-700',
                    warning: 'bg-yellow-100 text-yellow-800',
                    info: 'bg-blue-100 text-blue-800'
                  }[trigger.severity]}`}>
                    {trigger.severity.toUpperCase()}
                  </span>
                </div>
                <p className="text-gray-700 text-sm mb-2">{trigger.description}</p>
                
                <div className="text-sm text-gray-600 mb-3">
                  <strong>Recommended:</strong> {trigger.recommendedAction}
                </div>

                {expandedTrigger === trigger.id && trigger.metadata && (
                  <div className="mt-3 p-3 bg-white bg-opacity-50 rounded border">
                    <h5 className="font-medium text-gray-900 mb-2">Details</h5>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                      {JSON.stringify(trigger.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="flex items-center space-x-3 mt-3">
                  <button
                    onClick={() => handleSuggestedAction(trigger.recommendedAction)}
                    className="text-xs bg-white bg-opacity-75 hover:bg-opacity-100 px-3 py-1 rounded border font-medium"
                  >
                    Take Action
                  </button>
                  <button
                    onClick={() => setExpandedTrigger(
                      expandedTrigger === trigger.id ? null : trigger.id
                    )}
                    className="text-xs text-gray-600 hover:text-gray-800"
                  >
                    {expandedTrigger === trigger.id ? 'Hide Details' : 'Show Details'}
                  </button>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => dismissTrigger(trigger.id)}
              className="text-gray-400 hover:text-gray-600 ml-4"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      {/* Intelligent Prompts */}
      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          className={`border-l-4 rounded-lg p-4 ${getPriorityColor(prompt.priority)}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <span className="text-xl">{getPriorityIcon(prompt.priority)}</span>
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="font-semibold text-gray-900">{prompt.title}</h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${{
                    urgent: 'bg-red-100 text-red-800',
                    high: 'bg-orange-100 text-orange-800',
                    medium: 'bg-yellow-100 text-yellow-800',
                    low: 'bg-blue-100 text-blue-800'
                  }[prompt.priority]}`}>
                    {prompt.priority.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">
                    {prompt.type.replace('_', ' ').replace('-', ' ')}
                  </span>
                </div>
                <p className="text-gray-700 text-sm mb-3">{prompt.message}</p>
                
                {expandedPrompt === prompt.id && prompt.suggestedActions.length > 0 && (
                  <div className="space-y-2 mb-3">
                    <h5 className="font-medium text-gray-900 text-sm">Suggested Actions:</h5>
                    <div className="grid gap-2">
                      {prompt.suggestedActions.map((action, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestedAction(action)}
                          className="text-left text-sm bg-white bg-opacity-75 hover:bg-opacity-100 p-2 rounded border transition-colors"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setExpandedPrompt(
                      expandedPrompt === prompt.id ? null : prompt.id
                    )}
                    className="text-xs bg-white bg-opacity-75 hover:bg-opacity-100 px-3 py-1 rounded border font-medium"
                  >
                    {expandedPrompt === prompt.id ? 'Hide Actions' : 'Show Actions'}
                  </button>
                  <span className="text-xs text-gray-500">
                    {new Date(prompt.triggeredAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => dismissPrompt(prompt.id)}
              className="text-gray-400 hover:text-gray-600 ml-4"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}