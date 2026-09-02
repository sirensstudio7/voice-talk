"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHttpClient } from "../provider";
import * as businessApi from "../endpoints/business";

export function useUserBusinessesQuery() {
  const http = useHttpClient();
  return useQuery({
    queryKey: ["businesses"],
    queryFn: () => businessApi.listUserBusinesses(http),
  });
}
