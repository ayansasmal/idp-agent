"use client";

import { useApprovals } from "./hooks";
import ApprovalCard from "@/components/ApprovalCard";
import { useState } from "react";

export default function ApprovalsPage() {
  const { data: approvals, isLoading, error } = useApprovals();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const filteredApprovals = approvals?.filter(approval => {
    if (filter === "all") return true;
    return approval.state.toLowerCase() === filter;
  }) || [];

  const pendingCount = approvals?.filter(a => a.state === "PENDING").length || 0;
  const approvedCount = approvals?.filter(a => a.state === "APPROVED").length || 0;
  const rejectedCount = approvals?.filter(a => a.state === "REJECTED").length || 0;

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <div className="flex justify-center mb-4">
          <svg className="h-12 w-12 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-red-800 mb-2">Failed to load approvals</h3>
        <p className="text-red-600">Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Approval Workflow</h1>
        <p className="mt-2 text-lg text-gray-600">
          Review and approve platform operations
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{approvals?.length || 0}</div>
          <div className="text-sm text-gray-500">Total</div>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
          <div className="text-sm text-gray-500">Pending</div>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
          <div className="text-sm text-gray-500">Approved</div>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
          <div className="text-sm text-gray-500">Rejected</div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === "all"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All ({approvals?.length || 0})
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === "pending"
                ? "bg-amber-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === "approved"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setFilter("rejected")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === "rejected"
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Rejected ({rejectedCount})
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-flex items-center px-4 py-2 rounded-lg bg-white border">
            <svg className="animate-spin h-5 w-5 text-indigo-600 mr-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading approvals...
          </div>
        </div>
      )}

      {/* Approvals List */}
      {!isLoading && (
        <div className="space-y-4">
          {filteredApprovals.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <div className="flex justify-center mb-4">
                <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {filter === "all" ? "No approvals found" : `No ${filter} approvals`}
              </h3>
              <p className="text-gray-500">
                {filter === "pending" 
                  ? "All operations have been reviewed!"
                  : "Try chatting with the AI agent to create platform operations that require approval."
                }
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredApprovals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Help */}
      {!isLoading && pendingCount > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                {pendingCount} approval{pendingCount !== 1 ? "s" : ""} awaiting review
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                Review each request carefully, especially the estimated impact and rollback plan before approving.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}