'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ConversationSidebar } from '@/components/chat/conversation-sidebar';
import {
  type ChatConversationViewConfig,
  ConversationView,
} from '@/components/chat/conversation-view';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useConversationMessages } from '@/hooks/useConversationMessages';
import { useConversations } from '@/hooks/useConversations';
import { getJson } from '@/lib/api';
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
  sessionViewConfig: ChatConversationViewConfig;
  className?: string;
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
  const pathname = usePathname();
  const router = useRouter();
  const initialDocumentTitleRef = useRef<string>('');
  const sidebarScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sidebarScrollRestorePendingRef = useRef(true);
  const previousSessionActiveRef = useRef(sessionActive);
  const autoEndingConversationIdRef = useRef<string | null>(null);
  const statusPollInFlightRef = useRef(false);
  const {
    conversations,
    loadingConversations,
    creatingConversation,
    savingConversationId,
    error: conversationsError,
    setConversations,
    refreshConversations,
    createConversation,
    renameConversation,
    removeConversation,
    clearError: clearConversationsError,
  } = useConversations();
  const {
    loadingMessages,
    error: messagesError,
    getCachedMessages,
    loadMessages,
    primeMessages,
    removeConversationMessages,
    clearError: clearMessagesError,
  } = useConversationMessages();
  const [displayedConversationId, setDisplayedConversationId] = useState<string | null>(null);
  const [displayedConversationTitle, setDisplayedConversationTitle] = useState<string | null>(null);
  const [displayedMessages, setDisplayedMessages] = useState<ConversationMessageRecord[]>([]);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const error = viewError ?? messagesError ?? conversationsError;

  const clearDisplayedConversation = useCallback(() => {
    setDisplayedConversationId(null);
    setDisplayedConversationTitle(null);
    setDisplayedMessages([]);
    onPersistedMessagesChange([]);
  }, [onPersistedMessagesChange]);

  const cancelRenameConversation = useCallback(() => {
    setRenamingConversationId(null);
    setRenameDraft('');
  }, []);

  const activeAgentProfile = useMemo(
    () => agentProfiles.find((item) => item.id === activeAgentProfileId) ?? null,
    [activeAgentProfileId, agentProfiles]
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
  const displayedConversation = useMemo(
    () =>
      displayedConversationId
        ? (conversations.find((item) => item.id === displayedConversationId) ?? null)
        : null,
    [conversations, displayedConversationId]
  );
  const isConversationRoute = pathname.startsWith('/conversations/');
  const mobileConversationOpen =
    isMobileViewport && isConversationRoute && Boolean(activeConversationId);

  const handleRefreshConversations = useCallback(
    async (options: { showLoading?: boolean } = {}) => {
      try {
        setViewError(null);
        clearConversationsError();
        const data = await refreshConversations(options);
        if (activeConversationId && !data.some((item) => item.id === activeConversationId)) {
          onActiveConversationIdChange(null);
          router.replace('/', { scroll: false });
        }
        if (renamingConversationId && !data.some((item) => item.id === renamingConversationId)) {
          cancelRenameConversation();
        }
        return data;
      } catch {
        return null;
      }
    },
    [
      activeConversationId,
      cancelRenameConversation,
      clearConversationsError,
      onActiveConversationIdChange,
      refreshConversations,
      renamingConversationId,
      router,
    ]
  );

  const handleLoadMessages = useCallback(
    async (
      conversationId: string,
      options: {
        force?: boolean;
        showLoading?: boolean;
        updateDisplayed?: boolean;
      } = {}
    ) => {
      const { updateDisplayed = true, ...loadOptions } = options;
      try {
        setViewError(null);
        clearMessagesError();
        const data = await loadMessages(conversationId, loadOptions);
        if (updateDisplayed) {
          const conversation = conversations.find((item) => item.id === conversationId) ?? null;
          setDisplayedConversationId(conversationId);
          setDisplayedConversationTitle(conversation?.title ?? null);
          setDisplayedMessages(data);
          onPersistedMessagesChange(data);
        }
        return data;
      } catch {
        return null;
      }
    },
    [clearMessagesError, conversations, loadMessages, onPersistedMessagesChange]
  );

  const handleCreateConversation = useCallback(async () => {
    try {
      setViewError(null);
      clearConversationsError();
      clearMessagesError();
      const conversation = await createConversation({
        title: '新会话',
        agent_profile_id: activeAgentProfileId,
        last_mode: 'text',
      });
      primeMessages(conversation.id, []);
      setDisplayedConversationId(conversation.id);
      setDisplayedConversationTitle(conversation.title);
      setDisplayedMessages([]);
      onActiveConversationIdChange(conversation.id);
      onActiveAgentProfileIdChange(conversation.agent_profile_id ?? activeAgentProfileId);
      onPersistedMessagesChange([]);
      router.push(`/conversations/${conversation.id}`, { scroll: false });
    } catch {}
  }, [
    activeAgentProfileId,
    clearConversationsError,
    clearMessagesError,
    createConversation,
    onActiveAgentProfileIdChange,
    onActiveConversationIdChange,
    onPersistedMessagesChange,
    primeMessages,
    router,
  ]);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      if (sessionActive || activeConversationId === conversationId) {
        return;
      }
      const conversation = conversations.find((item) => item.id === conversationId) ?? null;
      onActiveConversationIdChange(conversationId);
      onActiveAgentProfileIdChange(conversation?.agent_profile_id ?? null);
      router.push(`/conversations/${conversationId}`, { scroll: false });

      const cachedMessages = getCachedMessages(conversationId);
      if (cachedMessages) {
        setViewError(null);
        setDisplayedConversationId(conversationId);
        setDisplayedConversationTitle(conversation?.title ?? null);
        setDisplayedMessages(cachedMessages);
        onPersistedMessagesChange(cachedMessages);
        return;
      }

      void handleLoadMessages(conversationId, {
        force: true,
        showLoading: true,
        updateDisplayed: true,
      });
    },
    [
      activeConversationId,
      conversations,
      getCachedMessages,
      handleLoadMessages,
      onActiveAgentProfileIdChange,
      onActiveConversationIdChange,
      onPersistedMessagesChange,
      router,
      sessionActive,
    ]
  );

  const handleSubmitRenameConversation = useCallback(
    async (conversationId: string) => {
      const title = renameDraft.trim();
      if (!title) {
        setViewError('会话名称不能为空');
        return;
      }

      try {
        setViewError(null);
        clearConversationsError();
        const updated = await renameConversation(conversationId, title);
        if (displayedConversationId === conversationId) {
          setDisplayedConversationTitle(updated.title);
        }
        cancelRenameConversation();
      } catch {}
    },
    [
      cancelRenameConversation,
      clearConversationsError,
      displayedConversationId,
      renameConversation,
      renameDraft,
    ]
  );

  const handleDeleteConversation = useCallback(
    async (conversation: ConversationRecord) => {
      const confirmed = window.confirm(`确认删除会话“${conversation.title}”吗？删除后不可恢复。`);
      if (!confirmed) {
        return;
      }

      try {
        setViewError(null);
        clearConversationsError();
        await removeConversation(conversation.id);
        removeConversationMessages(conversation.id);
        if (activeConversationId === conversation.id) {
          onActiveConversationIdChange(null);
          clearDisplayedConversation();
          router.replace('/', { scroll: false });
        }
        if (renamingConversationId === conversation.id) {
          cancelRenameConversation();
        }
      } catch {}
    },
    [
      activeConversationId,
      cancelRenameConversation,
      clearConversationsError,
      clearDisplayedConversation,
      onActiveConversationIdChange,
      removeConversation,
      removeConversationMessages,
      renamingConversationId,
      router,
    ]
  );

  const handleCloseMobileConversation = useCallback(() => {
    onActiveConversationIdChange(null);
    clearDisplayedConversation();
    router.replace('/', { scroll: false });
  }, [clearDisplayedConversation, onActiveConversationIdChange, router]);

  useEffect(() => {
    initialDocumentTitleRef.current = document.title;

    return () => {
      document.title = initialDocumentTitleRef.current;
    };
  }, []);

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
  useEffect(() => {
    void handleRefreshConversations({ showLoading: true });
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!activeConversationId) {
      clearDisplayedConversation();
    }
  }, [activeConversationId, clearDisplayedConversation]);

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
    clearDisplayedConversation();
    if (renamingConversationId) {
      cancelRenameConversation();
    }
  }, [
    activeAgentProfileId,
    activeConversationId,
    cancelRenameConversation,
    clearDisplayedConversation,
    conversations,
    onActiveConversationIdChange,
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
  }, [cancelRenameConversation, renamingConversationId, visibleConversations]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    const previousSessionActive = previousSessionActiveRef.current;
    previousSessionActiveRef.current = sessionActive;

    if (previousSessionActive && !sessionActive) {
      void handleRefreshConversations();
      if (activeConversationId) {
        void handleLoadMessages(activeConversationId, {
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
  }, [activeConversationId, onForceEndSession, sessionActive, sessionMode, setConversations]);

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

    const cachedMessages = getCachedMessages(activeConversation.id);
    if (cachedMessages) {
      setViewError(null);
      setDisplayedMessages(cachedMessages);
      onPersistedMessagesChange(cachedMessages);
      return;
    }

    void handleLoadMessages(activeConversation.id, {
      force: true,
      showLoading: true,
      updateDisplayed: true,
    });
  }, [
    activeAgentProfileId,
    activeConversationId,
    conversations,
    getCachedMessages,
    handleLoadMessages,
    loadingConversations,
    onActiveAgentProfileIdChange,
    onActiveConversationIdChange,
    onPersistedMessagesChange,
    router,
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

  return (
    <section className={cn('flex h-full min-h-0 w-full gap-4', className)}>
      <ConversationSidebar
        mode="mobile"
        agentProfiles={agentProfiles}
        activeAgentProfile={activeAgentProfile}
        activeAgentProfileId={activeAgentProfileId}
        activeAgentKnowledgeBaseNames={activeAgentKnowledgeBaseNames}
        visibleConversations={visibleConversations}
        activeConversationId={activeConversationId}
        loadingConversations={loadingConversations}
        sessionActive={sessionActive}
        creatingConversation={creatingConversation}
        savingConversationId={savingConversationId}
        renamingConversationId={renamingConversationId}
        renameDraft={renameDraft}
        sidebarScrollContainerRef={sidebarScrollContainerRef}
        onSidebarScroll={() => undefined}
        onRefresh={() => void handleRefreshConversations()}
        onCreateConversation={() => void handleCreateConversation()}
        onActiveAgentProfileIdChange={onActiveAgentProfileIdChange}
        onRenameDraftChange={setRenameDraft}
        onSelectConversation={handleSelectConversation}
        onStartRename={(conversation) => {
          setRenamingConversationId(conversation.id);
          setRenameDraft(conversation.title);
        }}
        onCancelRename={cancelRenameConversation}
        onSubmitRename={(conversationId) => void handleSubmitRenameConversation(conversationId)}
        onDeleteConversation={(conversation) => void handleDeleteConversation(conversation)}
      />
      <ConversationSidebar
        mode="desktop"
        agentProfiles={agentProfiles}
        activeAgentProfile={activeAgentProfile}
        activeAgentProfileId={activeAgentProfileId}
        activeAgentKnowledgeBaseNames={activeAgentKnowledgeBaseNames}
        visibleConversations={visibleConversations}
        activeConversationId={activeConversationId}
        loadingConversations={loadingConversations}
        sessionActive={sessionActive}
        creatingConversation={creatingConversation}
        savingConversationId={savingConversationId}
        renamingConversationId={renamingConversationId}
        renameDraft={renameDraft}
        sidebarScrollContainerRef={sidebarScrollContainerRef}
        onSidebarScroll={(scrollTop) =>
          window.sessionStorage.setItem('chat-sidebar-scroll', String(scrollTop))
        }
        onRefresh={() => void handleRefreshConversations()}
        onCreateConversation={() => void handleCreateConversation()}
        onActiveAgentProfileIdChange={onActiveAgentProfileIdChange}
        onRenameDraftChange={setRenameDraft}
        onSelectConversation={handleSelectConversation}
        onStartRename={(conversation) => {
          setRenamingConversationId(conversation.id);
          setRenameDraft(conversation.title);
        }}
        onCancelRename={cancelRenameConversation}
        onSubmitRename={(conversationId) => void handleSubmitRenameConversation(conversationId)}
        onDeleteConversation={(conversation) => void handleDeleteConversation(conversation)}
      />

      <Sheet
        open={mobileConversationOpen}
        onOpenChange={(open) => {
          if (open || !mobileConversationOpen) {
            return;
          }
          handleCloseMobileConversation();
        }}
      >
        <SheetContent side="right" className="w-full p-0 sm:max-w-none lg:hidden">
          <ConversationView
            mode="mobile-sheet"
            displayedConversation={displayedConversation}
            displayedConversationId={displayedConversationId}
            displayedConversationTitle={displayedConversationTitle}
            displayedMessages={displayedMessages}
            activeAgentProfileName={activeAgentProfile?.name ?? null}
            loadingMessages={loadingMessages}
            error={error}
            onStartTextChat={() => onStartTextChat(displayedConversationId)}
            onStartVoiceChat={() => onStartVoiceChat(displayedConversationId)}
            startDisabled={startDisabled || !displayedConversationId || loadingMessages}
            startDisabledReason={startDisabledReason}
            sessionMode={sessionMode}
            sessionViewConfig={sessionViewConfig}
          />
        </SheetContent>
      </Sheet>

      <ConversationView
        mode="desktop"
        displayedConversation={displayedConversation}
        displayedConversationId={displayedConversationId}
        displayedConversationTitle={displayedConversationTitle}
        displayedMessages={displayedMessages}
        activeAgentProfileName={activeAgentProfile?.name ?? null}
        loadingMessages={loadingMessages}
        error={error}
        onStartTextChat={() => onStartTextChat(displayedConversationId)}
        onStartVoiceChat={() => onStartVoiceChat(displayedConversationId)}
        startDisabled={startDisabled || !displayedConversationId || loadingMessages}
        startDisabledReason={startDisabledReason}
        sessionMode={sessionMode}
        sessionViewConfig={sessionViewConfig}
      />
    </section>
  );
}
