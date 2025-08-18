import { nanoid } from "nanoid";
import type { ChatMessage } from "@/lib/types";
import { useState } from "react";
import ExpandableDetails from "./ExpandableDetails";
import JsonViewer from "./JsonViewer";

interface MessageListProps {
  messages: ChatMessage[];
  onNamespaceSelect?: (namespace: string, originalMessage: string) => void;
}

export default function MessageList({ messages, onNamespaceSelect }: MessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div key={message.id || nanoid()} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`flex max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {/* Avatar */}
            <div className={`flex-shrink-0 ${message.role === "user" ? "ml-3" : "mr-3"}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                message.role === "user" 
                  ? "bg-indigo-600 text-white" 
                  : "bg-gray-200 text-gray-600"
              }`}>
                {message.role === "user" ? "U" : "AI"}
              </div>
            </div>

            {/* Message bubble */}
            <div className={`rounded-2xl px-4 py-3 ${
              message.role === "user"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-900"
            }`}>
              <div className="whitespace-pre-wrap text-sm leading-5">
                {message.content}
              </div>

              {/* Metadata for assistant messages */}
              {message.role === "assistant" && message.metadata && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  {message.metadata.requiresApproval && (
                    <div className="flex items-center space-x-2">
                      <div className="h-2 w-2 rounded-full bg-orange-400"></div>
                      <span className="text-xs text-gray-600">
                        Requires approval ({message.metadata.riskLevel} risk)
                      </span>
                      {message.metadata.approvalId && (
                        <a 
                          href={`/approvals?id=${message.metadata.approvalId}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                        >
                          View Approval
                        </a>
                      )}
                    </div>
                  )}
                  
                  {message.metadata.confidence && (
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-gray-500">
                        Confidence: {Math.round(message.metadata.confidence * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Namespace Selection UI */}
              {message.role === "assistant" && 
               message.metadata?.requiresUserInput && 
               message.metadata?.inputType === 'namespace-selection' && 
               message.metadata?.data?.availableNamespaces && (
                <NamespaceSelector 
                  availableNamespaces={message.metadata.data.availableNamespaces}
                  requestedNamespace={message.metadata.data.requestedNamespace}
                  suggestedAction={message.metadata.data.suggestedAction}
                  onSelect={(namespace) => {
                    if (onNamespaceSelect) {
                      // Extract the original action from the message content
                      const originalAction = extractActionFromMessage(message.content);
                      onNamespaceSelect(namespace, originalAction);
                    }
                  }}
                />
              )}

              {/* Detailed Content */}
              {message.role === "assistant" && message.detailedContent && (
                <ExpandableDetails 
                  markdown={message.detailedContent}
                  title="📊 Detailed Information"
                  defaultExpanded={false}
                />
              )}

              {/* Raw Data Viewer */}
              {message.role === "assistant" && message.rawData && (
                <JsonViewer 
                  data={message.rawData}
                  title="🔍 Raw Data"
                />
              )}

              {/* Timestamp */}
              <div className={`mt-2 text-xs ${
                message.role === "user" ? "text-indigo-200" : "text-gray-500"
              }`}>
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Helper function to extract action from message content
function extractActionFromMessage(content: string): string {
  // Try to extract the original user request from the error message
  // This is a simple heuristic - in a real implementation you might want to store this more explicitly
  const lines = content.split('\n');
  const firstLine = lines[0] || content;
  return firstLine;
}

// Namespace Selector Component
interface NamespaceSelectorProps {
  availableNamespaces: string[];
  requestedNamespace?: string;
  suggestedAction?: string;
  onSelect: (namespace: string) => void;
}

function NamespaceSelector({ availableNamespaces, requestedNamespace, suggestedAction, onSelect }: NamespaceSelectorProps) {
  const [selectedNamespace, setSelectedNamespace] = useState<string>('');

  const handleSelect = () => {
    if (selectedNamespace) {
      onSelect(selectedNamespace);
    }
  };

  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="text-sm font-medium text-blue-800 mb-2">
        📋 Namespace Selection Required
      </div>
      <div className="text-xs text-blue-700 mb-3">
        {requestedNamespace ? (
          <>Requested namespace <code className="bg-blue-100 px-1 rounded">{requestedNamespace}</code> not found. Please select from available namespaces:</>
        ) : (
          <>Multiple namespaces are available. Please select which namespace to use:</>
        )}
      </div>
      
      <div className="space-y-2">
        <select 
          value={selectedNamespace} 
          onChange={(e) => setSelectedNamespace(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select a namespace...</option>
          {availableNamespaces.map((namespace) => (
            <option key={namespace} value={namespace}>
              {namespace}
            </option>
          ))}
        </select>
        
        <button
          onClick={handleSelect}
          disabled={!selectedNamespace}
          className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Continue with {selectedNamespace || 'selected'} namespace
        </button>
      </div>
      
      <div className="mt-2 text-xs text-blue-600">
        💡 Available: {availableNamespaces.join(', ')}
        {suggestedAction && (
          <div className="mt-1">
            🔄 {suggestedAction}
          </div>
        )}
      </div>
    </div>
  );
}