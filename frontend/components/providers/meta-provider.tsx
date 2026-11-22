"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useApi } from "@/lib/api";
import type { ProjectMeta } from "@/lib/types";

interface MetaContextValue {
  meta: ProjectMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const MetaContext = createContext<MetaContextValue | null>(null);

export function MetaProvider({ children }: { children: ReactNode }) {
  const query = useApi<ProjectMeta>(["project-meta"], "/api/meta", undefined, {
    staleTime: 10 * 60 * 1000,
  });

  return (
    <MetaContext.Provider
      value={{
        meta: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error ?? null,
        refetch: () => void query.refetch(),
      }}
    >
      {children}
    </MetaContext.Provider>
  );
}

export function useMeta(): MetaContextValue {
  const context = useContext(MetaContext);
  if (!context) throw new Error("useMeta must be used inside MetaProvider");
  return context;
}
