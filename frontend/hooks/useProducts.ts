'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteJson, getJson, patchJson, postJson } from '@/lib/api';
import type { ProductCatalog, ProductCatalogPayload, ProductListItem } from '@/types';

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
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (filters: ProductFilters = lastFiltersRef.current) => {
    lastFiltersRef.current = filters;
    try {
      setLoading(true);
      setError(null);
      const data = await getJson<ProductListItem[]>(buildProductsUrl(filters));
      setProducts(data);
      return data;
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载产品列表失败'));
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const getCatalog = useCallback(async (productId: string) => {
    try {
      setError(null);
      return await getJson<ProductCatalog>(`/api/kb/products/${productId}/catalog-view`);
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载商品目录失败'));
      throw error;
    }
  }, []);

  const create = useCallback(
    async (payload: ProductCatalogPayload) => {
      try {
        setError(null);
        const data = await postJson<ProductCatalog>('/api/kb/products', payload);
        await refresh();
        return data;
      } catch (error: unknown) {
        setError(getErrorMessage(error, '保存商品失败'));
        throw error;
      }
    },
    [refresh]
  );

  const update = useCallback(
    async (productId: string, payload: ProductCatalogPayload) => {
      try {
        setError(null);
        const data = await patchJson<ProductCatalog>(`/api/kb/products/${productId}`, payload);
        await refresh();
        return data;
      } catch (error: unknown) {
        setError(getErrorMessage(error, '保存商品失败'));
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
        setError(getErrorMessage(error, '删除商品失败'));
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
    getCatalog,
    create,
    update,
    remove,
    clearError,
  };
}
