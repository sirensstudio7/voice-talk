"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHttpClient } from "../provider";
import * as appointmentsApi from "../endpoints/appointments";

export function useAppointmentsQuery(businessId: string, date?: string) {
  const http = useHttpClient();
  return useQuery({
    queryKey: ["appointments", businessId, date],
    queryFn: () => appointmentsApi.listAppointments(http, businessId, date),
    enabled: !!businessId,
  });
}
