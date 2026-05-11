'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageSquarePlus, Pencil, RefreshCcw, Trash2, X } from 'lucide-react';
import {
  AgentSessionView_01,
  type AgentSessionView_01Props,
} from '@/components/agents-ui/blocks/agent-session-view-01';
import { Button } from '@/components/ui/button';
import { FieldSelect } from '@/components/ui/field-select';
import { InteractiveCard } from '@/components/ui/interactive-card';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/shadcn/utils';
import type {
  AgentProfileOption,
  ConversationMessageRecord,
  ConversationRecord,
  KnowledgeBaseOption,
} from './types';

interface ChatWorkspaceProps {
  agentProfiles: AgentProfileOption[];
  knowledgeBases: KnowledgeBaseOption[];
  activeKnowledgeBaseId: string | null;
  onActiveKnowledgeBaseIdChange: (kbId: string | null) => void;
  activeAgentProfileId: string | null;
  onActiveAgentProfileIdChange: (agentProfileId: string | null) => void;
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

async function patchJson<T>(url: string, payload: object): Promise<T> {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function deleteJson(url: string): Promise<void> {
  const response = await fetch(url, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

type ContextMenuState = {
  conversationId: string;
  x: number;
  y: number;
} | null;

export function ChatWorkspace({
  agentProfiles,
  knowledgeBases,
  activeKnowledgeBaseId,
  onActiveKnowledgeBaseIdChange,
  activeAgentProfileId,
  onActiveAgentProfileIdChange,
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
  const [displayedConversationId, setDisplayedConversationId] = useState<string | null>(null);
  const [displayedConversationTitle, setDisplayedConversationTitle] = useState<string | null>(null);
  const [displayedMessages, setDisplayedMessages] = useState<ConversationMessageRecord[]>([]);
  const [messageCache, setMessageCache] = useState<Record<string, ConversationMessageRecord[]>>({});
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [savingConversationId, setSavingConversationId] = useState<string | null>(null);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [error, setError] = useState<string | null>(null);
  const previousSessionActiveRef = useRef(sessionActive);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setDisplayedConversationId(null);
      setDisplayedConversationTitle(null);
      setDisplayedMessages([]);
      onPersistedMessagesChange([]);
      return;
    }
  }, [activeConversationId]);

  const activeAgentProfile = useMemo(
    () => agentProfiles.find((item) => item.id === activeAgentProfileId) ?? null,
    [agentProfiles, activeAgentProfileId]
  );
  const visibleKnowledgeBases = useMemo(() => {
    const allowedKbIds = activeAgentProfile?.knowledge_base_ids ?? [];
    if (allowedKbIds.length === 0) {
      return knowledgeBases;
    }
    const allowedSet = new Set(allowedKbIds);
    return knowledgeBases.filter((kb) => allowedSet.has(kb.id));
  }, [activeAgentProfile, knowledgeBases]);

  useEffect(() => {
    if (!activeKnowledgeBaseId) {
      return;
    }
    if (visibleKnowledgeBases.some((item) => item.id === activeKnowledgeBaseId)) {
      return;
    }
    onActiveKnowledgeBaseIdChange(visibleKnowledgeBases[0]?.id ?? null);
  }, [activeKnowledgeBaseId, onActiveKnowledgeBaseIdChange, visibleKnowledgeBases]);

  useEffect(() => {
    const previousSessionActive = previousSessionActiveRef.current;
    previousSessionActiveRef.current = sessionActive;

    if (previousSessionActive && !sessionActive) {
      void loadConversations();
      if (activeConversationId) {
        void loadMessages(activeConversationId, {
          force: true,
          showLoading: false,
          updateDisplayed: true,
        });
      }
    }
  }, [activeConversationId, sessionActive]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (contextMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setContextMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  async function loadConversations() {
    try {
      setLoadingConversations(true);
      setError(null);
      const data = await getJson<ConversationRecord[]>('/api/chat/conversations');
      setConversations(data);
      if (activeConversationId && !data.some((item) => item.id === activeConversationId)) {
        onActiveConversationIdChange(null);
      }
      if (renamingConversationId && !data.some((item) => item.id === renamingConversationId)) {
        setRenamingConversationId(null);
        setRenameDraft('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载会话列表失败');
    } finally {
      setLoadingConversations(false);
    }
  }

  async function fetchMessages(conversationId: string) {
    return getJson<ConversationMessageRecord[]>(
      `/api/chat/conversations/${conversationId}/messages`
    );
  }

  async function loadMessages(
    conversationId: string,
    options: {
      force?: boolean;
      showLoading?: boolean;
      updateDisplayed?: boolean;
    } = {}
  ) {
    const { force = false, showLoading = true, updateDisplayed = true } = options;
    const cachedMessages = messageCache[conversationId];
    if (!force && cachedMessages) {
      if (updateDisplayed) {
        setDisplayedMessages(cachedMessages);
        onPersistedMessagesChange(cachedMessages);
      }
      return cachedMessages;
    }

    const requestId = ++loadRequestIdRef.current;
    try {
      if (showLoading) {
        setLoadingMessages(true);
      }
      setError(null);
      const data = await fetchMessages(conversationId);
      if (requestId !== loadRequestIdRef.current) {
        return data;
      }
      setMessageCache((current) => ({
        ...current,
        [conversationId]: data,
      }));
      if (updateDisplayed) {
        const conversation = conversations.find((item) => item.id === conversationId) ?? null;
        setDisplayedConversationId(conversationId);
        setDisplayedConversationTitle(conversation?.title ?? null);
        setDisplayedMessages(data);
        onPersistedMessagesChange(data);
      }
      return data;
    } catch (err: unknown) {
      if (requestId === loadRequestIdRef.current) {
        setError(err instanceof Error ? err.message : '加载会话消息失败');
      }
      throw err;
    } finally {
      if (showLoading && requestId === loadRequestIdRef.current) {
        setLoadingMessages(false);
      }
    }
  }

  async function handleCreateConversation() {
    try {
      setCreatingConversation(true);
      setError(null);
      setContextMenu(null);
      const conversation = await postJson<ConversationRecord>('/api/chat/conversations', {
        title: '新会话',
        knowledge_base_id: activeKnowledgeBaseId,
        agent_profile_id: activeAgentProfileId,
        last_mode: 'text',
      });
      setConversations((current) => [conversation, ...current]);
      setMessageCache((current) => ({
        ...current,
        [conversation.id]: [],
      }));
      setDisplayedConversationId(conversation.id);
      setDisplayedConversationTitle(conversation.title);
      setDisplayedMessages([]);
      onActiveConversationIdChange(conversation.id);
      onPersistedMessagesChange([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建会话失败');
    } finally {
      setCreatingConversation(false);
    }
  }

  function handleSelectConversation(conversationId: string) {
    if (sessionActive || activeConversationId === conversationId) {
      return;
    }
    const conversation = conversations.find((item) => item.id === conversationId) ?? null;
    onActiveConversationIdChange(conversationId);
    onActiveKnowledgeBaseIdChange(conversation?.knowledge_base_id ?? null);
    onActiveAgentProfileIdChange(conversation?.agent_profile_id ?? null);
    const cachedMessages = messageCache[conversationId];
    if (cachedMessages) {
      setError(null);
      setLoadingMessages(false);
      setDisplayedConversationId(conversationId);
      setDisplayedConversationTitle(conversation?.title ?? null);
      setDisplayedMessages(cachedMessages);
      onPersistedMessagesChange(cachedMessages);
      return;
    }
    void loadMessages(conversationId, {
      force: true,
      showLoading: true,
      updateDisplayed: true,
    });
  }

  function handleConversationContextMenu(
    event: React.MouseEvent<HTMLElement>,
    conversation: ConversationRecord
  ) {
    if (sessionActive) {
      return;
    }
    event.preventDefault();
    const menuWidth = 184;
    const menuHeight = 112;
    setContextMenu({
      conversationId: conversation.id,
      x: Math.min(event.clientX, window.innerWidth - menuWidth),
      y: Math.min(event.clientY, window.innerHeight - menuHeight),
    });
  }

  function startRenameConversation(conversation: ConversationRecord) {
    setContextMenu(null);
    setRenamingConversationId(conversation.id);
    setRenameDraft(conversation.title);
  }

  function cancelRenameConversation() {
    setRenamingConversationId(null);
    setRenameDraft('');
  }

  async function submitRenameConversation(conversationId: string) {
    const title = renameDraft.trim();
    if (!title) {
      setError('会话名称不能为空');
      return;
    }

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
      setRenamingConversationId(null);
      setRenameDraft('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重命名会话失败');
    } finally {
      setSavingConversationId(null);
    }
  }

  async function handleDeleteConversation(conversation: ConversationRecord) {
    setContextMenu(null);
    const confirmed = window.confirm(`确认删除会话“${conversation.title}”吗？删除后不可恢复。`);
    if (!confirmed) {
      return;
    }

    try {
      setSavingConversationId(conversation.id);
      setError(null);
      await deleteJson(`/api/chat/conversations/${conversation.id}`);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      setMessageCache((current) => {
        const next = { ...current };
        delete next[conversation.id];
        return next;
      });
      if (activeConversationId === conversation.id) {
        onActiveConversationIdChange(null);
        setDisplayedConversationId(null);
        setDisplayedConversationTitle(null);
        setDisplayedMessages([]);
        onPersistedMessagesChange([]);
      }
      if (renamingConversationId === conversation.id) {
        cancelRenameConversation();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除会话失败');
    } finally {
      setSavingConversationId(null);
    }
  }

  const contextMenuConversation = useMemo(
    () =>
      contextMenu
        ? (conversations.find((item) => item.id === contextMenu.conversationId) ?? null)
        : null,
    [contextMenu, conversations]
  );

  return (
    <section className={cn('flex h-full min-h-0 w-full gap-4', className)}>
      <Surface
        className="flex w-full shrink-0 flex-col overflow-hidden lg:w-[320px]"
        variant="sidebar"
      >
        <div className="border-border/70 flex items-center justify-between border-b px-4 py-4">
          <div>
            <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.22em] uppercase">
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

        <div className="border-border/70 space-y-4 border-b px-4 py-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">当前会话智能体</span>
            <FieldSelect
              value={activeAgentProfileId ?? ''}
              onValueChange={(value) => onActiveAgentProfileIdChange(value || null)}
              disabled={sessionActive}
              placeholder="系统默认智能体"
              options={agentProfiles.map((profile) => ({
                value: profile.id,
                label: profile.name,
              }))}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">当前会话知识库</span>
            <FieldSelect
              value={activeKnowledgeBaseId ?? ''}
              onValueChange={(value) => onActiveKnowledgeBaseIdChange(value || null)}
              disabled={sessionActive}
              placeholder="不绑定知识库"
              options={visibleKnowledgeBases.map((kb) => ({
                value: kb.id,
                label: kb.name,
              }))}
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-2">
            {loadingConversations ? (
              <Surface
                className="text-muted-foreground border-dashed px-4 py-6 text-sm"
                variant="muted"
                radius="lg"
              >
                正在加载会话列表…
              </Surface>
            ) : conversations.length === 0 ? (
              <Surface
                className="text-muted-foreground border-dashed px-4 py-6 text-sm leading-6"
                variant="muted"
                radius="lg"
              >
                还没有历史会话。先新建一个会话，再选择消息或语音方式开始。
              </Surface>
            ) : (
              conversations.map((conversation) =>
                renamingConversationId === conversation.id ? (
                  <InteractiveCard
                    key={conversation.id}
                    variant={activeConversationId === conversation.id ? 'selected' : 'default'}
                  >
                    <div className="space-y-3">
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void submitRenameConversation(conversation.id);
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelRenameConversation();
                          }
                        }}
                        className={cn(
                          'bg-background/70 w-full rounded-xl border px-3 py-2 text-sm outline-none',
                          activeConversationId === conversation.id
                            ? 'border-primary/30 text-foreground'
                            : 'border-border/60'
                        )}
                        placeholder="输入会话名称"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            cancelRenameConversation();
                          }}
                          disabled={savingConversationId === conversation.id}
                        >
                          <X className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            void submitRenameConversation(conversation.id);
                          }}
                          disabled={savingConversationId === conversation.id}
                        >
                          <Check className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </InteractiveCard>
                ) : (
                  <InteractiveCard
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation.id)}
                    onContextMenu={(event) => handleConversationContextMenu(event, conversation)}
                    role="button"
                    tabIndex={sessionActive ? -1 : 0}
                    aria-disabled={sessionActive}
                    onKeyDown={(event) => {
                      if (sessionActive) {
                        return;
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectConversation(conversation.id);
                      }
                    }}
                    variant={activeConversationId === conversation.id ? 'selected' : 'default'}
                    className={cn(
                      'cursor-pointer',
                      sessionActive && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <p className="truncate font-medium">{conversation.title}</p>
                    <p
                      className={cn(
                        'mt-2 line-clamp-2 text-xs leading-5',
                        activeConversationId === conversation.id
                          ? 'text-foreground/75'
                          : 'text-muted-foreground'
                      )}
                    >
                      {conversation.last_message_preview || '还没有消息'}
                    </p>
                  </InteractiveCard>
                )
              )
            )}
          </div>
        </div>
      </Surface>

      <Surface className="flex min-h-0 flex-1 flex-col overflow-hidden" variant="panel">
        <AgentSessionView_01
          {...sessionViewConfig}
          initialChatOpen
          sessionMode={sessionMode}
          persistedMessages={displayedMessages}
          activeConversationId={displayedConversationId}
          activeConversationTitle={displayedConversationTitle}
          loadingMessages={loadingMessages}
          viewError={error}
          onStartTextChat={() => onStartTextChat(displayedConversationId)}
          onStartVoiceChat={() => onStartVoiceChat(displayedConversationId)}
          startDisabled={startDisabled || !displayedConversationId || loadingMessages}
          startDisabledReason={startDisabledReason}
          className="h-full w-full flex-1 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
        />
      </Surface>

      {contextMenu && contextMenuConversation ? (
        <Surface
          ref={contextMenuRef}
          className="fixed z-50 min-w-[168px] p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
          variant="overlay"
          radius="lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            type="button"
            className="hover:bg-accent/80 hover:text-accent-foreground flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors"
            onClick={() => startRenameConversation(contextMenuConversation)}
          >
            <Pencil className="size-4" />
            <span>重命名会话</span>
          </button>
          <button
            type="button"
            className="hover:bg-destructive/10 text-destructive flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors"
            onClick={() => void handleDeleteConversation(contextMenuConversation)}
          >
            <Trash2 className="size-4" />
            <span>删除会话</span>
          </button>
        </Surface>
      ) : null}
    </section>
  );
}
