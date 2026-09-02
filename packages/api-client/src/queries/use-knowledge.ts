"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHttpClient } from "../provider";
import * as knowledgeApi from "../endpoints/knowledge";

export function useKnowledgeQuery(businessId: string) {
  const http = useHttpClient();
  return useQuery({
    queryKey: ["knowledge", businessId],
    queryFn: () => knowledgeApi.listKnowledge(http, businessId),
    enabled: !!businessId,
  });
}
