'use client';

import { useCallback, useRef, useState } from 'react';
import { getJson } from '@/lib/api';
import type { ConversationMessageRecord } from '@/types';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useConversationMessages() {
  const [messageCache, setMessageCache] = useState<Record<string, ConversationMessageRecord[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const getCachedMessages = useCallback(
    (conversationId: string) => messageCache[conversationId] ?? null,
    [messageCache]
  );

  const loadMessages = useCallback(
    async (
      conversationId: string,
      options: {
        force?: boolean;
        showLoading?: boolean;
      } = {}
    ) => {
      const { force = false, showLoading = true } = options;
      const cachedMessages = messageCache[conversationId];
      if (!force && cachedMessages) {
        return cachedMessages;
      }

      const requestId = ++loadRequestIdRef.current;
      try {
        if (showLoading) {
          setLoadingMessages(true);
        }
        setError(null);
        const data = await getJson<ConversationMessageRecord[]>(
          `/api/chat/conversations/${conversationId}/messages`
        );
        if (requestId !== loadRequestIdRef.current) {
          return data;
        }
        setMessageCache((current) => ({
          ...current,
          [conversationId]: data,
        }));
        return data;
      } catch (error: unknown) {
        if (requestId === loadRequestIdRef.current) {
          setError(getErrorMessage(error, '加载会话消息失败'));
        }
        throw error;
      } finally {
        if (showLoading && requestId === loadRequestIdRef.current) {
          setLoadingMessages(false);
        }
      }
    },
    [messageCache]
  );

  const primeMessages = useCallback(
    (conversationId: string, messages: ConversationMessageRecord[]) => {
      setMessageCache((current) => ({
        ...current,
        [conversationId]: messages,
      }));
    },
    []
  );

  const removeConversationMessages = useCallback((conversationId: string) => {
    setMessageCache((current) => {
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messageCache,
    loadingMessages,
    error,
    getCachedMessages,
    loadMessages,
    primeMessages,
    removeConversationMessages,
    clearError,
  };
}
