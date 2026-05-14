'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, MessageSquarePlus, Pencil, RefreshCcw, Trash2, X } from 'lucide-react';
import {
  AgentSessionView_01,
  type AgentSessionView_01Props,
} from '@/components/agents-ui/blocks/agent-session-view-01';
import { Button } from '@/components/ui/button';
import { FieldSelect } from '@/components/ui/field-select';
import { InteractiveCard } from '@/components/ui/interactive-card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  activeAgentProfileId: string | null;
  onActiveAgentProfileIdChange: (agentProfileId: string | null) => void;
  activeConversationId: string | null;
  onActiveConversationIdChange: (conversationId: string | null) => void;
  persistedMessages: ConversationMessageRecord[];
  onPersistedMessagesChange: (messages: ConversationMessageRecord[]) => void;
  onStartTextChat: (conversationId: string | null) => void;
  onStartVoiceChat: (conversationId: string | null) => void;
  onForceEndSession?: () => Promise<void>;
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

let conversationListCache: ConversationRecord[] | null = null;
let conversationMessageCacheStore: Record<string, ConversationMessageRecord[]> = {};

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

function getConversationStatusMeta(conversation: ConversationRecord): {
  label: string;
  tone: 'muted' | 'warning' | 'danger';
  detail: string;
} | null {
  if (conversation.status !== 'ended') {
    return null;
  }

  if (conversation.end_reason === 'away_timeout') {
    return {
      label: '无人应答结束',
      tone: 'warning',
      detail: '对方长时间未回应，系统已自动收尾结束本次通话。',
    };
  }
  if (conversation.end_reason === 'user_disconnect') {
    return {
      label: '用户已断开',
      tone: 'muted',
      detail: '对方已主动断开当前会话。',
    };
  }
  if (conversation.end_reason === 'session_error') {
    return {
      label: '会话异常结束',
      tone: 'danger',
      detail: conversation.end_detail || '会话因为底层异常中断。',
    };
  }
  if (conversation.end_reason === 'completed') {
    return {
      label: '会话已结束',
      tone: 'muted',
      detail: '本次会话已正常结束。',
    };
  }

  return {
    label: '已结束',
    tone: 'muted',
    detail: conversation.end_detail || conversation.end_reason || '本次会话已结束。',
  };
}

function getConversationStatusBadgeClass(tone: 'muted' | 'warning' | 'danger'): string {
  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200';
  }
  if (tone === 'danger') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200';
  }
  return 'border-border/70 bg-background/70 text-muted-foreground';
}

export function ChatWorkspace({
  agentProfiles,
  knowledgeBases,
  activeAgentProfileId,
  onActiveAgentProfileIdChange,
  activeConversationId,
  onActiveConversationIdChange,
  onPersistedMessagesChange,
  onStartTextChat,
  onStartVoiceChat,
  onForceEndSession,
  startDisabled = false,
  startDisabledReason,
  sessionMode,
  sessionActive = false,
  sessionViewConfig,
  className,
}: ChatWorkspaceProps) {
  const hasInitialConversationListCache = conversationListCache !== null;
  const pathname = usePathname();
  const router = useRouter();
  const initialDocumentTitleRef = useRef<string>('');
  const sidebarScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sidebarScrollRestorePendingRef = useRef(true);
  const conversationListLoadedRef = useRef(hasInitialConversationListCache);
  const [conversations, setConversations] = useState<ConversationRecord[]>(
    () => conversationListCache ?? []
  );
  const [displayedConversationId, setDisplayedConversationId] = useState<string | null>(null);
  const [displayedConversationTitle, setDisplayedConversationTitle] = useState<string | null>(null);
  const [displayedMessages, setDisplayedMessages] = useState<ConversationMessageRecord[]>([]);
  const [messageCache, setMessageCache] = useState<Record<string, ConversationMessageRecord[]>>(
    () => conversationMessageCacheStore
  );
  const [loadingConversations, setLoadingConversations] = useState(
    () => !hasInitialConversationListCache
  );
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [savingConversationId, setSavingConversationId] = useState<string | null>(null);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousSessionActiveRef = useRef(sessionActive);
  const loadRequestIdRef = useRef(0);
  const autoEndingConversationIdRef = useRef<string | null>(null);
  const statusPollInFlightRef = useRef(false);

  useEffect(() => {
    initialDocumentTitleRef.current = document.title;

    return () => {
      document.title = initialDocumentTitleRef.current;
    };
  }, []);

  useEffect(() => {
    if (!conversationListLoadedRef.current) {
      return;
    }
    conversationListCache = conversations;
  }, [conversations]);

  useEffect(() => {
    conversationMessageCacheStore = messageCache;
  }, [messageCache]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleChange = (event?: MediaQueryListEvent) => {
      setIsMobileViewport(event ? event.matches : mediaQuery.matches);
    };

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  /* eslint-disable react-hooks/exhaustive-deps */
  // Intentional one-time bootstrap load for the conversation list.
  useEffect(() => {
    void loadConversations({ showLoading: !hasInitialConversationListCache });
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!activeConversationId) {
      setDisplayedConversationId(null);
      setDisplayedConversationTitle(null);
      setDisplayedMessages([]);
      onPersistedMessagesChange([]);
      return;
    }
  }, [activeConversationId, onPersistedMessagesChange]);

  const activeAgentProfile = useMemo(
    () => agentProfiles.find((item) => item.id === activeAgentProfileId) ?? null,
    [agentProfiles, activeAgentProfileId]
  );
  const activeAgentKnowledgeBaseNames = useMemo(() => {
    if (!activeAgentProfile?.knowledge_base_ids.length) {
      return [];
    }
    const knowledgeBaseNameById = new Map(knowledgeBases.map((kb) => [kb.id, kb.name]));
    return activeAgentProfile.knowledge_base_ids.flatMap((kbId) => {
      const name = knowledgeBaseNameById.get(kbId);
      return name ? [name] : [];
    });
  }, [activeAgentProfile, knowledgeBases]);
  const visibleConversations = useMemo(() => {
    if (!activeAgentProfileId) {
      return conversations;
    }
    return conversations.filter(
      (conversation) => conversation.agent_profile_id === activeAgentProfileId
    );
  }, [activeAgentProfileId, conversations]);
  const isConversationRoute = pathname.startsWith('/conversations/');
  const mobileConversationOpen =
    isMobileViewport && isConversationRoute && Boolean(activeConversationId);

  useEffect(() => {
    if (!activeConversationId || !activeAgentProfileId || sessionActive) {
      return;
    }
    const activeConversation =
      conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
    if (!activeConversation || activeConversation.agent_profile_id === activeAgentProfileId) {
      return;
    }
    onActiveConversationIdChange(null);
    setDisplayedConversationId(null);
    setDisplayedConversationTitle(null);
    setDisplayedMessages([]);
    onPersistedMessagesChange([]);
    if (renamingConversationId) {
      cancelRenameConversation();
    }
  }, [
    activeAgentProfileId,
    activeConversationId,
    conversations,
    onActiveConversationIdChange,
    onPersistedMessagesChange,
    renamingConversationId,
    sessionActive,
  ]);

  useEffect(() => {
    const visibleConversationIds = new Set(
      visibleConversations.map((conversation) => conversation.id)
    );
    if (renamingConversationId && !visibleConversationIds.has(renamingConversationId)) {
      cancelRenameConversation();
    }
  }, [renamingConversationId, visibleConversations]);

  /* eslint-disable react-hooks/exhaustive-deps */
  // Intentional session recovery refresh after the active voice session ends.
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
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!sessionActive || sessionMode !== 'voice' || !activeConversationId || !onForceEndSession) {
      autoEndingConversationIdRef.current = null;
      statusPollInFlightRef.current = false;
      return;
    }

    let cancelled = false;
    const forceEndSession = onForceEndSession;

    async function pollConversationStatus() {
      if (statusPollInFlightRef.current) {
        return;
      }
      statusPollInFlightRef.current = true;
      try {
        const data = await getJson<ConversationRecord[]>('/api/chat/conversations');
        if (cancelled) {
          return;
        }
        setConversations(data);
        const activeConversation =
          data.find((conversation) => conversation.id === activeConversationId) ?? null;
        if (
          activeConversation?.status === 'ended' &&
          activeConversation.end_reason === 'away_timeout' &&
          autoEndingConversationIdRef.current !== activeConversation.id
        ) {
          autoEndingConversationIdRef.current = activeConversation.id;
          await forceEndSession();
        }
      } catch {
        return;
      } finally {
        statusPollInFlightRef.current = false;
      }
    }

    void pollConversationStatus();
    const intervalId = window.setInterval(() => {
      void pollConversationStatus();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      statusPollInFlightRef.current = false;
    };
  }, [activeConversationId, onForceEndSession, sessionActive, sessionMode]);

  async function loadConversations(options: { showLoading?: boolean } = {}) {
    const { showLoading = false } = options;
    try {
      if (showLoading) {
        setLoadingConversations(true);
      }
      setError(null);
      const data = await getJson<ConversationRecord[]>('/api/chat/conversations');
      conversationListLoadedRef.current = true;
      setConversations(data);
      if (activeConversationId && !data.some((item) => item.id === activeConversationId)) {
        onActiveConversationIdChange(null);
        router.replace('/', { scroll: false });
      }
      if (renamingConversationId && !data.some((item) => item.id === renamingConversationId)) {
        setRenamingConversationId(null);
        setRenameDraft('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载会话列表失败');
    } finally {
      if (showLoading) {
        setLoadingConversations(false);
      }
    }
  }

  const fetchMessages = useCallback((conversationId: string) => {
    return getJson<ConversationMessageRecord[]>(
      `/api/chat/conversations/${conversationId}/messages`
    );
  }, []);

  const loadMessages = useCallback(
    async function loadMessagesCallback(
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
    },
    [conversations, fetchMessages, messageCache, onPersistedMessagesChange]
  );

  async function handleCreateConversation() {
    try {
      setCreatingConversation(true);
      setError(null);
      const conversation = await postJson<ConversationRecord>('/api/chat/conversations', {
        title: '新会话',
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
      onActiveAgentProfileIdChange(conversation.agent_profile_id ?? activeAgentProfileId);
      onPersistedMessagesChange([]);
      router.push(`/conversations/${conversation.id}`, { scroll: false });
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
    onActiveAgentProfileIdChange(conversation?.agent_profile_id ?? null);
    router.push(`/conversations/${conversationId}`, { scroll: false });
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

  function startRenameConversation(conversation: ConversationRecord) {
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
      if (displayedConversationId === conversationId) {
        setDisplayedConversationTitle(updated.title);
      }
      setRenamingConversationId(null);
      setRenameDraft('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '重命名会话失败');
    } finally {
      setSavingConversationId(null);
    }
  }

  async function handleDeleteConversation(conversation: ConversationRecord) {
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
        router.replace('/', { scroll: false });
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

  const displayedConversation = useMemo(
    () =>
      displayedConversationId
        ? (conversations.find((item) => item.id === displayedConversationId) ?? null)
        : null,
    [conversations, displayedConversationId]
  );
  const displayedConversationStatus = useMemo(
    () => (displayedConversation ? getConversationStatusMeta(displayedConversation) : null),
    [displayedConversation]
  );

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    const activeConversation =
      conversations.find((item) => item.id === activeConversationId) ?? null;
    if (!activeConversation) {
      if (!loadingConversations) {
        onActiveConversationIdChange(null);
        router.replace('/', { scroll: false });
      }
      return;
    }

    if (activeConversation.agent_profile_id !== activeAgentProfileId) {
      onActiveAgentProfileIdChange(activeConversation.agent_profile_id ?? null);
    }

    setDisplayedConversationId(activeConversation.id);
    setDisplayedConversationTitle(activeConversation.title);

    const cachedMessages = messageCache[activeConversation.id];
    if (cachedMessages) {
      setError(null);
      setLoadingMessages(false);
      setDisplayedMessages(cachedMessages);
      onPersistedMessagesChange(cachedMessages);
      return;
    }

    void loadMessages(activeConversation.id, {
      force: true,
      showLoading: true,
      updateDisplayed: true,
    });
  }, [
    activeAgentProfileId,
    activeConversationId,
    conversations,
    loadingConversations,
    messageCache,
    onActiveAgentProfileIdChange,
    onActiveConversationIdChange,
    onPersistedMessagesChange,
    router,
    loadMessages,
  ]);

  useEffect(() => {
    const baseTitle = initialDocumentTitleRef.current;
    document.title = displayedConversationTitle
      ? `${displayedConversationTitle} | ${baseTitle}`
      : baseTitle;
  }, [displayedConversationTitle]);

  useEffect(() => {
    if (!sidebarScrollRestorePendingRef.current) {
      return;
    }

    const container = sidebarScrollContainerRef.current;
    if (!container) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const storedValue = window.sessionStorage.getItem('chat-sidebar-scroll');
      container.scrollTop = storedValue ? Number(storedValue) || 0 : 0;
      sidebarScrollRestorePendingRef.current = false;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [visibleConversations.length]);
  const renderSidebarPanel = (mode: 'desktop' | 'mobile') => (
    <Surface
      className={cn(
        'flex w-full shrink-0 flex-col overflow-hidden',
        mode === 'desktop' ? 'hidden lg:flex lg:w-[320px]' : 'min-h-0 flex-1 lg:hidden'
      )}
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
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            {activeAgentKnowledgeBaseNames.length > 0
              ? `当前智能体将使用：${activeAgentKnowledgeBaseNames.join('、')}`
              : '当前智能体未绑定知识库，知识库检索不可用。'}
          </p>
        </label>
      </div>

      <div
        ref={mode === 'desktop' ? sidebarScrollContainerRef : undefined}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onScroll={(event) => {
          if (mode !== 'desktop') {
            return;
          }
          window.sessionStorage.setItem(
            'chat-sidebar-scroll',
            String(event.currentTarget.scrollTop)
          );
        }}
      >
        <div className="space-y-2">
          {loadingConversations ? (
            <Surface
              className="text-muted-foreground border-dashed px-4 py-6 text-sm"
              variant="muted"
              radius="lg"
            >
              正在加载会话列表…
            </Surface>
          ) : visibleConversations.length === 0 ? (
            <Surface
              className="text-muted-foreground border-dashed px-4 py-6 text-sm leading-6"
              variant="muted"
              radius="lg"
            >
              {activeAgentProfile
                ? `当前智能体“${activeAgentProfile.name}”下还没有历史会话。先新建一个会话，再开始对话。`
                : '还没有历史会话。先新建一个会话，再选择消息或语音方式开始。'}
            </Surface>
          ) : (
            visibleConversations.map((conversation) => {
              const statusMeta = getConversationStatusMeta(conversation);
              return renamingConversationId === conversation.id ? (
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
                  className={cn('cursor-pointer', sessionActive && 'cursor-not-allowed opacity-60')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
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
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      {statusMeta ? (
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.08em]',
                            getConversationStatusBadgeClass(statusMeta.tone)
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      ) : null}
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="rounded-full"
                          aria-label={`重命名 ${conversation.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            startRenameConversation(conversation);
                          }}
                          disabled={sessionActive}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20 rounded-full"
                          aria-label={`删除 ${conversation.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteConversation(conversation);
                          }}
                          disabled={sessionActive || savingConversationId === conversation.id}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </InteractiveCard>
              );
            })
          )}
        </div>
      </div>
    </Surface>
  );

  const renderConversationPanel = (mode: 'desktop' | 'mobile-sheet') => {
    const content = (
      <>
        {displayedConversation ? (
          <div className="border-border/70 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 pr-10">
                <p className="truncate text-sm font-medium">
                  {displayedConversationTitle || displayedConversation.title}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-xs">
                  {activeAgentProfile?.name || '未选择智能体'}
                </p>
                {displayedConversationStatus ? (
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {displayedConversationStatus.detail}
                  </p>
                ) : displayedConversation.last_message_at ? (
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    最近一条消息已同步到当前会话记录。
                  </p>
                ) : null}
              </div>
              {displayedConversationStatus ? (
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.08em]',
                    getConversationStatusBadgeClass(displayedConversationStatus.tone)
                  )}
                >
                  {displayedConversationStatus.label}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
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
          transcriptScrollStorageKey={
            displayedConversationId ? `chat-transcript-scroll:${displayedConversationId}` : null
          }
          className="h-full w-full flex-1 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
        />
      </>
    );

    if (mode === 'mobile-sheet') {
      return (
        <div className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>
              {displayedConversationTitle || displayedConversation?.title || '当前会话'}
            </SheetTitle>
            <SheetDescription>查看当前会话消息与语音交互内容。</SheetDescription>
          </SheetHeader>
          {content}
        </div>
      );
    }

    return (
      <Surface className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex" variant="panel">
        {content}
      </Surface>
    );
  };

  return (
    <section className={cn('flex h-full min-h-0 w-full gap-4', className)}>
      {renderSidebarPanel('mobile')}
      {renderSidebarPanel('desktop')}

      <Sheet
        open={mobileConversationOpen}
        onOpenChange={(open) => {
          if (open || !mobileConversationOpen) {
            return;
          }
          onActiveConversationIdChange(null);
          setDisplayedConversationId(null);
          setDisplayedConversationTitle(null);
          setDisplayedMessages([]);
          onPersistedMessagesChange([]);
          router.replace('/', { scroll: false });
        }}
      >
        <SheetContent side="right" className="w-full p-0 sm:max-w-none lg:hidden">
          {renderConversationPanel('mobile-sheet')}
        </SheetContent>
      </Sheet>

      {renderConversationPanel('desktop')}
    </section>
  );
}
