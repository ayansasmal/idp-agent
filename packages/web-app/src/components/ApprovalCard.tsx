"use client";

import { useState } from "react";
import { useApprovalActions } from "@/app/approvals/hooks";
import { type Approval } from "@/lib/types";

interface ApprovalCardProps {
  approval: Approval;
}

export default function ApprovalCard({ approval }: ApprovalCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);
  const { approve, reject, deleteApproval } = useApprovalActions();

  const isLoading = approve.isPending || reject.isPending || deleteApproval.isPending;

  const handleApprove = () => {
    approve.mutate({ id: approval.id, reviewNotes: reviewNotes || undefined });
    setShowReviewForm(false);
    setReviewNotes("");
  };

  const handleReject = () => {
    reject.mutate({ id: approval.id, reviewNotes: reviewNotes || undefined });
    setShowReviewForm(false);
    setReviewNotes("");
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this approval request?")) {
      deleteApproval.mutate(approval.id);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low": return "text-green-600 bg-green-50 border-green-200";
      case "medium": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "high": return "text-orange-600 bg-orange-50 border-orange-200";
      case "critical": return "text-red-600 bg-red-50 border-red-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case "PENDING": return "text-amber-600 bg-amber-50 border-amber-200";
      case "APPROVED": return "text-green-600 bg-green-50 border-green-200";
      case "REJECTED": return "text-red-600 bg-red-50 border-red-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {approval.resource}
            </h3>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStateColor(approval.state)}`}>
              {approval.state}
            </span>
          </div>
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span>Action: <span className="font-medium text-gray-900">{approval.action}</span></span>
            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getRiskColor(approval.riskLevel)}`}>
              {approval.riskLevel} risk
            </span>
            <span>Confidence: {Math.round(approval.confidence * 100)}%</span>
          </div>
        </div>
        
        {approval.state === "PENDING" && (
          <button
            onClick={handleDelete}
            className="text-gray-400 hover:text-red-500 ml-4"
            disabled={isLoading}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Explanation */}
      <p className="text-gray-700 mb-4">{approval.explanation}</p>

      {/* Parameters */}
      {Object.keys(approval.parameters).length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            {showDetails ? "Hide" : "Show"} parameters
          </button>
          {showDetails && (
            <div className="mt-2 bg-gray-50 rounded-lg p-3">
              <pre className="text-xs text-gray-600 overflow-x-auto">
                {JSON.stringify(approval.parameters, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Diff */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Changes:</h4>
        <div className="bg-gray-50 rounded-lg p-3 border">
          <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
            {approval.diff}
          </pre>
        </div>
      </div>

      {/* Impact and Rollback */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-1">Estimated Impact:</h4>
          <p className="text-sm text-gray-600">{approval.estimatedImpact}</p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-900 mb-1">Rollback Plan:</h4>
          <p className="text-sm text-gray-600">{approval.rollbackPlan}</p>
        </div>
      </div>

      {/* Review Notes */}
      {approval.reviewNotes && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-1">Review Notes:</h4>
          <p className="text-sm text-blue-700">{approval.reviewNotes}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
        <span>Created by {approval.createdBy} on {new Date(approval.createdAt).toLocaleString()}</span>
        {approval.reviewedAt && (
          <span>Reviewed by {approval.reviewedBy} on {new Date(approval.reviewedAt).toLocaleString()}</span>
        )}
      </div>

      {/* Actions */}
      {approval.state === "PENDING" && (
        <div className="border-t pt-4">
          {showReviewForm ? (
            <div className="space-y-3">
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add review notes (optional)..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                rows={3}
              />
              <div className="flex space-x-3">
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {approve.isPending ? "Approving..." : "Approve"}
                </button>
                <button
                  onClick={handleReject}
                  disabled={isLoading}
                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reject.isPending ? "Rejecting..." : "Reject"}
                </button>
                <button
                  onClick={() => {
                    setShowReviewForm(false);
                    setReviewNotes("");
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex space-x-3">
              <button
                onClick={() => setShowReviewForm(true)}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Review
              </button>
              <button
                onClick={handleApprove}
                disabled={isLoading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Quick Approve
              </button>
              <button
                onClick={handleReject}
                disabled={isLoading}
                className="px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Quick Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}