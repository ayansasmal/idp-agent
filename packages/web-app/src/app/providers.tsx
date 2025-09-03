"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WebSocketProvider } from "@/contexts/WebSocketContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  }));
  
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider
        metaAgentUrl={process.env.NEXT_PUBLIC_META_AGENT_URL || 'ws://localhost:3000'}
        userId="web-user" // TODO: Get from auth context
        autoConnect={true}
      >
        {children}
      </WebSocketProvider>
    </QueryClientProvider>
  );
}