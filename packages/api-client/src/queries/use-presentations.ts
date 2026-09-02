"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHttpClient } from "../provider";
import * as presentationsApi from "../endpoints/presentations";

export function usePresentationsQuery(businessId: string) {
  const http = useHttpClient();
  return useQuery({
    queryKey: ["presentations", businessId],
    queryFn: () => presentationsApi.listDecks(http, businessId),
    enabled: !!businessId,
  });
}
