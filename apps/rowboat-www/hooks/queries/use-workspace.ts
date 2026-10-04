"use client";

import "client-only";

import { useQuery } from "@tanstack/react-query";

import {
  fetchWorkspaceNotes,
  type WorkspaceNoteOrder,
} from "@/hooks/queries/utils/fetch-workspace-notes";
import { fetchWorkspace } from "@/hooks/queries/utils/fetch-workspace";
import { WORKSPACE_CURRENT_STALE_TIME, workspaceKeys } from "@/hooks/queries/utils/workspace-keys";

export function useWorkspace() {
  return useQuery({
    queryKey: workspaceKeys.current(),
    queryFn: ({ signal }) => fetchWorkspace(signal),
    staleTime: WORKSPACE_CURRENT_STALE_TIME,
  });
}

export function useWorkspaceNotes(order: WorkspaceNoteOrder = "newest") {
  return useQuery({
    queryKey: workspaceKeys.noteOrder(order),
    queryFn: ({ signal }) => fetchWorkspaceNotes(signal, order),
    staleTime: WORKSPACE_CURRENT_STALE_TIME,
  });
}
