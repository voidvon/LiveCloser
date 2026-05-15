'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteJson, getJson, patchJson, postJson } from '@/lib/api';
import type { Product, ProductPayload } from '@/types';

export type ProductFilters = {
  query: string;
  category: string;
  brand: string;
  status: string;
};

export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  query: '',
  category: '',
  brand: '',
  status: 'all',
};

function buildProductsUrl(filters: ProductFilters) {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('query', filters.query.trim());
  if (filters.category.trim()) params.set('category', filters.category.trim());
  if (filters.brand.trim()) params.set('brand', filters.brand.trim());
  if (filters.status !== 'all') params.set('status', filters.status);
  params.set('limit', '300');
  return `/api/kb/products?${params.toString()}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useProducts(initialFilters: ProductFilters = DEFAULT_PRODUCT_FILTERS) {
  const lastFiltersRef = useRef(initialFilters);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (filters: ProductFilters = lastFiltersRef.current) => {
    lastFiltersRef.current = filters;
    try {
      setLoading(true);
      setError(null);
      const data = await getJson<Product[]>(buildProductsUrl(filters));
      setProducts(data);
      return data;
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载产品列表失败'));
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (payload: ProductPayload) => {
      try {
        setError(null);
        await postJson<Product>('/api/kb/products', payload);
        return await refresh();
      } catch (error: unknown) {
        setError(getErrorMessage(error, '保存产品失败'));
        throw error;
      }
    },
    [refresh]
  );

  const update = useCallback(
    async (productId: string, payload: ProductPayload) => {
      try {
        setError(null);
        await patchJson<Product>(`/api/kb/products/${productId}`, payload);
        return await refresh();
      } catch (error: unknown) {
        setError(getErrorMessage(error, '保存产品失败'));
        throw error;
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (productId: string) => {
      try {
        setError(null);
        await deleteJson(`/api/kb/products/${productId}`);
        return await refresh();
      } catch (error: unknown) {
        setError(getErrorMessage(error, '删除产品失败'));
        throw error;
      }
    },
    [refresh]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    void refresh(initialFilters).catch(() => undefined);
  }, [initialFilters, refresh]);

  return {
    products,
    loading,
    error,
    refresh,
    create,
    update,
    remove,
    clearError,
  };
}
