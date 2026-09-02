"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHttpClient } from "../provider";
import * as ordersApi from "../endpoints/orders";

export function useOrdersQuery(businessId: string, date?: string) {
  const http = useHttpClient();
  return useQuery({
    queryKey: ["orders", businessId, date],
    queryFn: () => ordersApi.listOrders(http, businessId, date),
    enabled: !!businessId,
  });
}
