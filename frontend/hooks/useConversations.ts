'use client';

import { useCallback, useState } from 'react';
import { deleteJson, getJson, patchJson, postJson } from '@/lib/api';
import type { ConversationRecord } from '@/types';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [savingConversationId, setSavingConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshConversations = useCallback(async (options: { showLoading?: boolean } = {}) => {
    const { showLoading = false } = options;
    try {
      if (showLoading) {
        setLoadingConversations(true);
      }
      setError(null);
      const data = await getJson<ConversationRecord[]>('/api/chat/conversations');
      setConversations(data);
      return data;
    } catch (error: unknown) {
      setError(getErrorMessage(error, '加载会话列表失败'));
      throw error;
    } finally {
      if (showLoading) {
        setLoadingConversations(false);
      }
    }
  }, []);

  const createConversation = useCallback(
    async (payload: {
      title: string;
      agent_profile_id: string | null;
      last_mode: 'text' | 'voice';
    }) => {
      try {
        setCreatingConversation(true);
        setError(null);
        const conversation = await postJson<ConversationRecord>('/api/chat/conversations', payload);
        setConversations((current) => [conversation, ...current]);
        return conversation;
      } catch (error: unknown) {
        setError(getErrorMessage(error, '创建会话失败'));
        throw error;
      } finally {
        setCreatingConversation(false);
      }
    },
    []
  );

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    try {
      setSavingConversationId(conversationId);
      setError(null);
      const updated = await patchJson<ConversationRecord>(
        `/api/chat/conversations/${conversationId}`,
        {
          title,
        }
      );
      setConversations((current) =>
        current.map((item) => (item.id === conversationId ? updated : item))
      );
      return updated;
    } catch (error: unknown) {
      setError(getErrorMessage(error, '重命名会话失败'));
      throw error;
    } finally {
      setSavingConversationId(null);
    }
  }, []);

  const removeConversation = useCallback(async (conversationId: string) => {
    try {
      setSavingConversationId(conversationId);
      setError(null);
      await deleteJson(`/api/chat/conversations/${conversationId}`);
      setConversations((current) => current.filter((item) => item.id !== conversationId));
    } catch (error: unknown) {
      setError(getErrorMessage(error, '删除会话失败'));
      throw error;
    } finally {
      setSavingConversationId(null);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    conversations,
    loadingConversations,
    creatingConversation,
    savingConversationId,
    error,
    setConversations,
    refreshConversations,
    createConversation,
    renameConversation,
    removeConversation,
    clearError,
  };
}
