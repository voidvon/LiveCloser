'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from '@/lib/api';
import type { ChatModelProfile, EmbeddingProfile, KnowledgeBase } from '@/types';

export type KnowledgeBaseListState = 'idle' | 'loading' | 'error';

export type CreateKnowledgeBasePayload = {
  name: string;
  description: string;
  embedding_profile_id: string;
  embedding_provider: string;
  embedding_model: string;
  embedding_base_url: string;
  embedding_api_key_env: string;
  chunk_size: number;
  chunk_overlap: number;
  retrieval_top_k: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useKnowledgeBases() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [chatModelProfiles, setChatModelProfiles] = useState<ChatModelProfile[]>([]);
  const [state, setState] = useState<KnowledgeBaseListState>('loading');
  const [creatingKb, setCreatingKb] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshChatModelProfiles = useCallback(async () => {
    try {
      const nextProfiles = await getJson<ChatModelProfile[]>('/api/kb/chat-model-profiles');
      setChatModelProfiles(nextProfiles);
    } catch {
      setChatModelProfiles([]);
    }
  }, []);

  const refreshKnowledgeBases = useCallback(async () => {
    try {
      setState('loading');
      setError(null);
      const [nextKnowledgeBases, nextProfiles] = await Promise.all([
        getJson<KnowledgeBase[]>('/api/kb/knowledge-bases'),
        getJson<EmbeddingProfile[]>('/api/kb/embedding-profiles'),
      ]);
      setKnowledgeBases(nextKnowledgeBases);
      setEmbeddingProfiles(nextProfiles);
      setState('idle');
      return nextKnowledgeBases;
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载知识库列表失败'));
      setState('error');
      throw error;
    }
  }, []);

  const createKnowledgeBase = useCallback(async (payload: CreateKnowledgeBasePayload) => {
    try {
      setCreatingKb(true);
      setError(null);
      const record = await postJson<KnowledgeBase>('/api/kb/knowledge-bases', payload);
      setKnowledgeBases((current) => [record, ...current]);
      return record;
    } catch (error: unknown) {
      setError(getErrorMessage(error, '创建知识库失败'));
      throw error;
    } finally {
      setCreatingKb(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    void refreshKnowledgeBases().catch(() => undefined);
    void refreshChatModelProfiles();
  }, [refreshChatModelProfiles, refreshKnowledgeBases]);

  return {
    knowledgeBases,
    embeddingProfiles,
    chatModelProfiles,
    state,
    creatingKb,
    error,
    refreshKnowledgeBases,
    refreshChatModelProfiles,
    createKnowledgeBase,
    clearError,
  };
}
