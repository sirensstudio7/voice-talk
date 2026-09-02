"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHttpClient } from "../provider";
import * as analyticsApi from "../endpoints/analytics";

export function useAnalyticsQuery(businessId: string) {
  const http = useHttpClient();
  return useQuery({
    queryKey: ["analytics", businessId],
    queryFn: () => analyticsApi.getAnalytics(http, businessId),
    enabled: !!businessId,
  });
}
