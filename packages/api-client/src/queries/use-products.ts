"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHttpClient } from "../provider";
import * as productsApi from "../endpoints/products";
import type { Product } from "../schemas/products";

export function useProductsQuery(businessId: string) {
  const http = useHttpClient();
  return useQuery({
    queryKey: ["products", businessId],
    queryFn: () => productsApi.listProducts(http, businessId),
    enabled: !!businessId,
  });
}

export function useCreateProductMutation(businessId: string) {
  const http = useHttpClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Product>) => productsApi.createProduct(http, businessId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", businessId] });
    },
  });
}
