import { nanoid } from "nanoid";
import type { ChatMessage } from "@/lib/types";

interface MessageListProps {
  messages: ChatMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
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