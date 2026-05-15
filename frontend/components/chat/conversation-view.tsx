'use client';

import {
  AgentSessionView_01,
  type AgentSessionView_01Props,
} from '@/components/agents-ui/blocks/agent-session-view-01';
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/shadcn/utils';
import { getConversationStatusBadgeClass, getConversationStatusMeta } from './conversation-status';
import type { ConversationMessageRecord, ConversationRecord } from './types';

export function ConversationView({
  mode,
  displayedConversation,
  displayedConversationId,
  displayedConversationTitle,
  displayedMessages,
  activeAgentProfileName,
  loadingMessages,
  error,
  onStartTextChat,
  onStartVoiceChat,
  startDisabled,
  startDisabledReason,
  sessionMode,
  sessionViewConfig,
}: {
  mode: 'desktop' | 'mobile-sheet';
  displayedConversation: ConversationRecord | null;
  displayedConversationId: string | null;
  displayedConversationTitle: string | null;
  displayedMessages: ConversationMessageRecord[];
  activeAgentProfileName: string | null;
  loadingMessages: boolean;
  error: string | null;
  onStartTextChat: () => void;
  onStartVoiceChat: () => void;
  startDisabled: boolean;
  startDisabledReason?: string;
  sessionMode: 'text' | 'voice';
  sessionViewConfig: ChatConversationViewConfig;
}) {
  const displayedConversationStatus = displayedConversation
    ? getConversationStatusMeta(displayedConversation)
    : null;
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
                {activeAgentProfileName || '未选择智能体'}
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
        onStartTextChat={onStartTextChat}
        onStartVoiceChat={onStartVoiceChat}
        startDisabled={startDisabled}
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
}

export type ChatConversationViewConfig = Pick<
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
