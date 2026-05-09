'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus, Phone, RefreshCcw, TextCursorInput } from 'lucide-react';
import {
  AgentSessionView_01,
  type AgentSessionView_01Props,
} from '@/components/agents-ui/blocks/agent-session-view-01';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/shadcn/utils';
import type {
  ConversationMessageRecord,
  ConversationRecord,
  KnowledgeBaseOption,
} from './types';

interface ChatWorkspaceProps {
  knowledgeBases: KnowledgeBaseOption[];
  activeKnowledgeBaseId: string | null;
  onActiveKnowledgeBaseIdChange: (kbId: string | null) => void;
  activeConversationId: string | null;
  onActiveConversationIdChange: (conversationId: string | null) => void;
  persistedMessages: ConversationMessageRecord[];
  onPersistedMessagesChange: (messages: ConversationMessageRecord[]) => void;
  onStartTextChat: (conversationId: string | null) => void;
  onStartVoiceChat: (conversationId: string | null) => void;
  startDisabled?: boolean;
  startDisabledReason?: string;
  sessionMode: 'text' | 'voice';
  sessionActive?: boolean;
  sessionViewConfig: Pick<
    AgentSessionView_01Props,
    | 'supportsChatInput'
    | 'supportsVideoInput'
    | 'supportsScreenShare'
    | 'isPreConnectBufferEnabled'
    | 'audioVisualizerType'
    | 'audioVisualizerColor'
    | 'audioVisualizerColorShift'
    | 'audioVisualizerBarCount'
    | 'audioVisualizerGridRowCount'
    | 'audioVisualizerGridColumnCount'
    | 'audioVisualizerRadialBarCount'
    | 'audioVisualizerRadialRadius'
    | 'audioVisualizerWaveLineWidth'
  >;
  className?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function postJson<T>(url: string, payload: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export function ChatWorkspace({
  knowledgeBases,
  activeKnowledgeBaseId,
  onActiveKnowledgeBaseIdChange,
  activeConversationId,
  onActiveConversationIdChange,
  persistedMessages,
  onPersistedMessagesChange,
  onStartTextChat,
  onStartVoiceChat,
  startDisabled = false,
  startDisabledReason,
  sessionMode,
  sessionActive = false,
  sessionViewConfig,
  className,
}: ChatWorkspaceProps) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousSessionActiveRef = useRef(sessionActive);

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      onPersistedMessagesChange([]);
      return;
    }
    void loadMessages(activeConversationId);
  }, [activeConversationId]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  useEffect(() => {
    const previousSessionActive = previousSessionActiveRef.current;
    previousSessionActiveRef.current = sessionActive;

    if (previousSessionActive && !sessionActive) {
      void loadConversations();
      if (activeConversationId) {
        void loadMessages(activeConversationId);
      }
    }
  }, [activeConversationId, sessionActive]);

  async function loadConversations() {
    try {
      setLoadingConversations(true);
      setError(null);
      const data = await getJson<ConversationRecord[]>('/api/chat/conversations');
      setConversations(data);
      if (activeConversationId && !data.some((item) => item.id === activeConversationId)) {
        onActiveConversationIdChange(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载会话列表失败');
    } finally {
      setLoadingConversations(false);
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      setLoadingMessages(true);
      setError(null);
      const data = await getJson<ConversationMessageRecord[]>(
        `/api/chat/conversations/${conversationId}/messages`
      );
      onPersistedMessagesChange(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载会话消息失败');
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleCreateConversation() {
    try {
      setCreatingConversation(true);
      setError(null);
      const conversation = await postJson<ConversationRecord>('/api/chat/conversations', {
        title: '新会话',
        knowledge_base_id: activeKnowledgeBaseId,
        last_mode: 'text',
      });
      setConversations((current) => [conversation, ...current]);
      onActiveConversationIdChange(conversation.id);
      onPersistedMessagesChange([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建会话失败');
    } finally {
      setCreatingConversation(false);
    }
  }

  return (
    <section className={cn('flex h-full min-h-0 w-full gap-4', className)}>
      <aside className="bg-background flex w-full shrink-0 flex-col overflow-hidden rounded-[28px] border border-border/70 lg:w-[320px]">
        <div className="border-border/70 flex items-center justify-between border-b px-4 py-4">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              会话列表
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">历史与继续对话</h2>
          </div>
          <div className="flex gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => void loadConversations()}
              disabled={sessionActive}
            >
              <RefreshCcw className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              onClick={() => void handleCreateConversation()}
              disabled={creatingConversation || sessionActive}
            >
              <MessageSquarePlus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="border-border/70 border-b px-4 py-4">
          <label className="mb-2 block text-sm font-medium">当前会话知识库</label>
          <select
            value={activeKnowledgeBaseId ?? ''}
            onChange={(e) => onActiveKnowledgeBaseIdChange(e.target.value || null)}
            disabled={sessionActive}
            className="bg-background w-full rounded-2xl border px-4 py-3 text-sm outline-none"
          >
            <option value="">不绑定知识库</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-2">
            {loadingConversations ? (
              <div className="text-muted-foreground rounded-2xl border border-dashed px-4 py-6 text-sm">
                正在加载会话列表…
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-muted-foreground rounded-2xl border border-dashed px-4 py-6 text-sm leading-6">
                还没有历史会话。先新建一个会话，再选择消息或语音方式开始。
              </div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onActiveConversationIdChange(conversation.id)}
                  disabled={sessionActive}
                  className={cn(
                    'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                    activeConversationId === conversation.id
                      ? 'border-foreground/15 bg-foreground text-background'
                      : 'border-border/70 bg-accent/20 hover:bg-accent',
                    sessionActive && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-medium">{conversation.title}</p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] uppercase',
                        activeConversationId === conversation.id
                          ? 'bg-background/12 text-background/80'
                          : 'bg-background text-muted-foreground'
                      )}
                    >
                      {conversation.last_mode === 'voice' ? '语音' : '消息'}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'mt-2 line-clamp-2 text-xs leading-5',
                      activeConversationId === conversation.id
                        ? 'text-background/72'
                        : 'text-muted-foreground'
                    )}
                  >
                    {conversation.last_message_preview || '还没有消息'}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-border/70">
        <AgentSessionView_01
          {...sessionViewConfig}
          initialChatOpen={sessionMode === 'text'}
          sessionMode={sessionMode}
          persistedMessages={persistedMessages}
          activeConversationId={activeConversationId}
          activeConversationTitle={activeConversation?.title ?? null}
          loadingMessages={loadingMessages}
          viewError={error}
          onStartTextChat={() => onStartTextChat(activeConversationId)}
          onStartVoiceChat={() => onStartVoiceChat(activeConversationId)}
          startDisabled={startDisabled || !activeConversationId}
          startDisabledReason={startDisabledReason}
          className="h-full w-full flex-1 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
        />
      </div>
    </section>
  );
}
