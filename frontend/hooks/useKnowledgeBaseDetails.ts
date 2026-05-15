'use client';

import { useCallback, useEffect, useState } from 'react';
import { deleteJson, getJson, patchJson, postJson } from '@/lib/api';
import type { Category, KbFile, KbJob } from '@/types';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useKnowledgeBaseDetails(selectedKbId: string | null) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [files, setFiles] = useState<KbFile[]>([]);
  const [jobs, setJobs] = useState<KbJob[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [updatingCategoryFileId, setUpdatingCategoryFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSelectedCategoryId(null);
    setCategories([]);
    setFiles([]);
    setJobs([]);
    setDetailsLoading(false);
    setCreatingCategory(false);
    setUploading(false);
    setUpdatingCategoryFileId(null);
    setDeletingFileId(null);
    setError(null);
  }, []);

  const refreshDetails = useCallback(
    async (kbId: string = selectedKbId ?? '') => {
      if (!kbId) {
        reset();
        return null;
      }

      try {
        setDetailsLoading(true);
        setError(null);
        const [nextCategories, nextFiles, nextJobs] = await Promise.all([
          getJson<Category[]>(`/api/kb/knowledge-bases/${kbId}/categories`),
          getJson<KbFile[]>(`/api/kb/knowledge-bases/${kbId}/files`),
          getJson<KbJob[]>(`/api/kb/knowledge-bases/${kbId}/jobs`),
        ]);
        setCategories(nextCategories);
        setFiles(nextFiles);
        setJobs(nextJobs);
        setSelectedCategoryId((current) =>
          current && nextCategories.some((item) => item.id === current) ? current : null
        );
        return {
          categories: nextCategories,
          files: nextFiles,
          jobs: nextJobs,
        };
      } catch (error: unknown) {
        setError(getErrorMessage(error, '加载知识库数据失败'));
        throw error;
      } finally {
        setDetailsLoading(false);
      }
    },
    [reset, selectedKbId]
  );

  const createCategory = useCallback(
    async (parentId: string | null, name: string) => {
      if (!selectedKbId) {
        throw new Error('请先选择知识库');
      }

      try {
        setCreatingCategory(true);
        setError(null);
        const siblingCount = categories.filter(
          (category) => (category.parent_id ?? null) === (parentId ?? null)
        ).length;
        const record = await postJson<Category>(
          `/api/kb/knowledge-bases/${selectedKbId}/categories`,
          {
            name: name.trim(),
            parent_id: parentId,
            sort_order: siblingCount,
          }
        );
        setSelectedCategoryId(record.id);
        await refreshDetails(selectedKbId);
        return record;
      } catch (error: unknown) {
        setError(getErrorMessage(error, '创建分类失败'));
        throw error;
      } finally {
        setCreatingCategory(false);
      }
    },
    [categories, refreshDetails, selectedKbId]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!selectedKbId) {
        throw new Error('请先选择知识库');
      }
      if (!selectedCategoryId) {
        throw new Error('请先在左侧选择一个分类');
      }

      try {
        setUploading(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category_id', selectedCategoryId);
        const response = await fetch(`/api/kb/knowledge-bases/${selectedKbId}/files`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await refreshDetails(selectedKbId);
      } catch (error: unknown) {
        setError(getErrorMessage(error, '上传文件失败'));
        throw error;
      } finally {
        setUploading(false);
      }
    },
    [refreshDetails, selectedCategoryId, selectedKbId]
  );

  const updateFileCategory = useCallback(
    async (file: KbFile, nextCategoryId: string) => {
      if (!selectedKbId) {
        throw new Error('请先选择知识库');
      }

      const normalizedCategoryId = nextCategoryId || null;
      if ((file.category_id ?? null) === normalizedCategoryId) {
        return;
      }

      try {
        setUpdatingCategoryFileId(file.id);
        setError(null);
        await patchJson<{ file: KbFile; job: KbJob | null }>(
          `/api/kb/knowledge-bases/${selectedKbId}/files/${file.id}`,
          {
            category_id: normalizedCategoryId,
          }
        );
        await refreshDetails(selectedKbId);
      } catch (error: unknown) {
        setError(getErrorMessage(error, '更新分类失败'));
        throw error;
      } finally {
        setUpdatingCategoryFileId(null);
      }
    },
    [refreshDetails, selectedKbId]
  );

  const deleteFile = useCallback(
    async (file: KbFile) => {
      if (!selectedKbId) {
        throw new Error('请先选择知识库');
      }

      try {
        setDeletingFileId(file.id);
        setError(null);
        await deleteJson(`/api/kb/knowledge-bases/${selectedKbId}/files/${file.id}`);
        await refreshDetails(selectedKbId);
      } catch (error: unknown) {
        setError(getErrorMessage(error, '删除文档失败'));
        throw error;
      } finally {
        setDeletingFileId(null);
      }
    },
    [refreshDetails, selectedKbId]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    if (!selectedKbId) {
      reset();
      return;
    }

    void refreshDetails(selectedKbId).catch(() => undefined);
  }, [refreshDetails, reset, selectedKbId]);

  return {
    selectedCategoryId,
    setSelectedCategoryId,
    categories,
    files,
    jobs,
    detailsLoading,
    creatingCategory,
    uploading,
    updatingCategoryFileId,
    deletingFileId,
    error,
    refreshDetails,
    createCategory,
    uploadFile,
    updateFileCategory,
    deleteFile,
    clearError,
    reset,
  };
}
