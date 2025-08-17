"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Approval } from "@/lib/types";

export const useApprovals = () =>
  useQuery<Approval[]>({
    queryKey: ["approvals"],
    queryFn: async () => {
      const response = await fetch("/api/approvals");
      if (!response.ok) {
        throw new Error("Failed to fetch approvals");
      }
      return response.json();
    },
    staleTime: 30_000,
  });

export const useApprovalActions = () => {
  const queryClient = useQueryClient();

  const approve = useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: string; reviewNotes?: string }) => {
      const response = await fetch(`/api/approvals?id=${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: "APPROVED",
          reviewNotes,
          reviewedBy: "web-user",
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to approve");
      }
      
      return response.json();
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["approvals"] });
      const previousApprovals = queryClient.getQueryData<Approval[]>(["approvals"]);
      
      if (previousApprovals) {
        queryClient.setQueryData<Approval[]>(
          ["approvals"],
          previousApprovals.map(approval =>
            approval.id === id
              ? { ...approval, state: "APPROVED" as const, reviewedAt: new Date().toISOString() }
              : approval
          )
        );
      }
      
      return { previousApprovals };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousApprovals) {
        queryClient.setQueryData(["approvals"], context.previousApprovals);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  const reject = useMutation({
    mutationFn: async ({ id, reviewNotes }: { id: string; reviewNotes?: string }) => {
      const response = await fetch(`/api/approvals?id=${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state: "REJECTED",
          reviewNotes,
          reviewedBy: "web-user",
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to reject");
      }
      
      return response.json();
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["approvals"] });
      const previousApprovals = queryClient.getQueryData<Approval[]>(["approvals"]);
      
      if (previousApprovals) {
        queryClient.setQueryData<Approval[]>(
          ["approvals"],
          previousApprovals.map(approval =>
            approval.id === id
              ? { ...approval, state: "REJECTED" as const, reviewedAt: new Date().toISOString() }
              : approval
          )
        );
      }
      
      return { previousApprovals };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousApprovals) {
        queryClient.setQueryData(["approvals"], context.previousApprovals);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  const deleteApproval = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/approvals?id=${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete approval");
      }
      
      return response.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["approvals"] });
      const previousApprovals = queryClient.getQueryData<Approval[]>(["approvals"]);
      
      if (previousApprovals) {
        queryClient.setQueryData<Approval[]>(
          ["approvals"],
          previousApprovals.filter(approval => approval.id !== id)
        );
      }
      
      return { previousApprovals };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousApprovals) {
        queryClient.setQueryData(["approvals"], context.previousApprovals);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  return {
    approve,
    reject,
    deleteApproval,
  };
};