'use client';

import React, { useEffect, useState } from 'react';
import { Phone, TextCursorInput } from 'lucide-react';
import { useAgent, useSessionContext, useSessionMessages } from '@livekit/components-react';
import {
  AgentChatTranscript,
  type TranscriptMessage,
} from '@/components/agents-ui/agent-chat-transcript';
import {
  AgentControlBar,
  type AgentControlBarControls,
} from '@/components/agents-ui/agent-control-bar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/shadcn/utils';
import { TileLayout } from './tile-view';

interface FadeProps {
  top?: boolean;
  bottom?: boolean;
  className?: string;
}

export function Fade({ top = false, bottom = false, className }: FadeProps) {
  return (
    <div
      className={cn(
        'from-background pointer-events-none h-4 bg-linear-to-b to-transparent',
        top && 'bg-linear-to-b',
        bottom && 'bg-linear-to-t',
        className
      )}
    />
  );
}

export interface AgentSessionView_01Props {
  /**
   * Message shown above the controls before the first chat message is sent.
   *
   * @default 'Agent is listening, ask it a question'
   */
  preConnectMessage?: string;
  /**
   * Enables or disables the chat toggle and transcript input controls.
   *
   * @default true
   */
  supportsChatInput?: boolean;
  /**
   * Enables or disables camera controls in the bottom control bar.
   *
   * @default true
   */
  supportsVideoInput?: boolean;
  /**
   * Enables or disables screen sharing controls in the bottom control bar.
   *
   * @default true
   */
  supportsScreenShare?: boolean;
  /**
   * Shows a pre-connect buffer state with a shimmer message before messages appear.
   *
   * @default true
   */
  isPreConnectBufferEnabled?: boolean;

  /** Selects the visualizer style rendered in the main tile area. */
  audioVisualizerType?: 'bar' | 'wave' | 'grid' | 'radial' | 'aura';
  /** Primary hex color used by supported audio visualizer variants. */
  audioVisualizerColor?: `#${string}`;
  /** Hue shift intensity used by certain visualizers. */
  audioVisualizerColorShift?: number;
  /** Number of bars to render when `audioVisualizerType` is `bar`. */
  audioVisualizerBarCount?: number;
  /** Number of rows in the visualizer when `audioVisualizerType` is `grid`. */
  audioVisualizerGridRowCount?: number;
  /** Number of columns in the visualizer when `audioVisualizerType` is `grid`. */
  audioVisualizerGridColumnCount?: number;
  /** Number of radial bars when `audioVisualizerType` is `radial`. */
  audioVisualizerRadialBarCount?: number;
  /** Base radius of the radial visualizer when `audioVisualizerType` is `radial`. */
  audioVisualizerRadialRadius?: number;
  /** Stroke width of the wave path when `audioVisualizerType` is `wave`. */
  audioVisualizerWaveLineWidth?: number;
  /** Optional class name merged onto the outer `<section>` container. */
  className?: string;
  /** Whether the transcript panel should be open when the session view first mounts. */
  initialChatOpen?: boolean;
  /** Current session mode to allow a dedicated text-only layout. */
  sessionMode?: 'text' | 'voice';
  /** Persisted history loaded from the conversation store. */
  persistedMessages?: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system' | 'developer';
    content: string;
    created_at: string;
  }>;
  activeConversationId?: string | null;
  activeConversationTitle?: string | null;
  loadingMessages?: boolean;
  viewError?: string | null;
  onStartTextChat?: () => void;
  onStartVoiceChat?: () => void;
  startDisabled?: boolean;
  startDisabledReason?: string;
  transcriptScrollStorageKey?: string | null;
}

export function AgentSessionView_01({
  preConnectMessage = '助手正在收听，你可以直接开始提问',
  supportsChatInput = true,
  supportsVideoInput = true,
  supportsScreenShare = true,
  isPreConnectBufferEnabled = true,

  audioVisualizerType,
  audioVisualizerColor,
  audioVisualizerColorShift,
  audioVisualizerBarCount,
  audioVisualizerGridRowCount,
  audioVisualizerGridColumnCount,
  audioVisualizerRadialBarCount,
  audioVisualizerRadialRadius,
  audioVisualizerWaveLineWidth,
  initialChatOpen = false,
  sessionMode = 'voice',
  persistedMessages = [],
  activeConversationId = null,
  activeConversationTitle = null,
  loadingMessages = false,
  viewError = null,
  onStartTextChat,
  onStartVoiceChat,
  startDisabled = false,
  startDisabledReason,
  transcriptScrollStorageKey = null,
  ref,
  className,
  ...props
}: React.ComponentProps<'section'> & AgentSessionView_01Props) {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  void activeConversationTitle;
  void preConnectMessage;
  void isPreConnectBufferEnabled;
  const isConnected = session.isConnected;
  const [chatOpen, setChatOpen] = useState(initialChatOpen);
  const { state: agentState } = useAgent();
  const isPreSession = !isConnected;
  const transcriptHistory: TranscriptMessage[] = persistedMessages
    .filter(
      (message): message is typeof message & { role: 'user' | 'assistant' } =>
        message.role === 'user' || message.role === 'assistant'
    )
    .map((message) => ({
      id: message.id,
      from: message.role,
      message: message.content,
      timestamp: new Date(message.created_at).getTime(),
    }));

  useEffect(() => {
    setChatOpen(initialChatOpen);
  }, [initialChatOpen]);

  useEffect(() => {
    if (!isConnected) {
      setChatOpen(true);
    }
  }, [isConnected]);

  const controls: AgentControlBarControls =
    sessionMode === 'text'
      ? {
          leave: true,
          microphone: false,
          chat: false,
          camera: false,
          screenShare: false,
        }
      : {
          leave: true,
          microphone: true,
          chat: supportsChatInput,
          camera: supportsVideoInput,
          screenShare: supportsScreenShare,
        };

  const isVoiceMode = sessionMode === 'voice';
  const effectiveChatOpen = isVoiceMode ? chatOpen : true;

  function renderStartActions(className: string) {
    return (
      <div className={className}>
        <Surface
          className="pointer-events-auto flex min-w-0 flex-row gap-2 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
          variant="overlay"
          radius="full"
        >
          <Button
            variant="outline"
            onClick={onStartTextChat}
            disabled={startDisabled}
            className="min-w-0 flex-1 rounded-full px-3"
          >
            <TextCursorInput className="mr-2 size-4" />
            消息对话
          </Button>
          <Button
            onClick={onStartVoiceChat}
            disabled={startDisabled}
            className="min-w-0 flex-1 rounded-full px-3"
          >
            <Phone className="mr-2 size-4" />
            语音对话
          </Button>
        </Surface>
      </div>
    );
  }

  function renderTranscriptContent() {
    if (!activeConversationId) {
      return (
        <div className="text-muted-foreground flex h-full min-h-[240px] w-full items-center justify-center px-6 text-sm">
          先从左侧新建或选择一个会话。
        </div>
      );
    }

    if (loadingMessages) {
      return (
        <div className="text-muted-foreground flex h-full min-h-[240px] w-full items-center justify-center px-6 text-sm">
          正在加载历史消息…
        </div>
      );
    }

    if (transcriptHistory.length === 0 && isPreSession) {
      return (
        <div className="text-muted-foreground flex h-full min-h-[240px] w-full items-center justify-center px-6 text-sm">
          当前会话还没有历史消息，点击下方按钮开始。
        </div>
      );
    }

    return (
      <div className="h-full min-h-0 w-full">
        <AgentChatTranscript
          agentState={isPreSession ? undefined : agentState}
          messages={isPreSession ? [] : messages}
          persistedMessages={transcriptHistory}
          className="h-full min-h-0 w-full [&_.is-user>div]:rounded-[22px] [&>div>div]:px-4 [&>div>div]:py-6 md:[&>div>div]:px-6"
          scrollStorageKey={transcriptScrollStorageKey}
        />
      </div>
    );
  }

  return (
    <section
      ref={ref}
      className={cn(
        'relative z-10 flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden',
        className
      )}
      {...props}
    >
      {viewError ? (
        <div className="shrink-0 px-5 pt-4">
          <Alert variant="destructive">
            <AlertTitle>操作失败</AlertTitle>
            <AlertDescription>{viewError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {startDisabledReason ? (
        <div className="shrink-0 px-5 pt-4">
          <Alert>
            <AlertTitle>当前无法启动会话</AlertTitle>
            <AlertDescription>{startDisabledReason}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4 md:px-8 md:pt-6">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="h-full min-h-0">
            {effectiveChatOpen ? (
              <div className="h-full min-h-0 w-full">{renderTranscriptContent()}</div>
            ) : null}
          </div>

          {isVoiceMode ? (
            <TileLayout
              chatOpen={chatOpen}
              audioVisualizerType={audioVisualizerType}
              audioVisualizerColor={audioVisualizerColor}
              audioVisualizerColorShift={audioVisualizerColorShift}
              audioVisualizerBarCount={audioVisualizerBarCount}
              audioVisualizerRadialBarCount={audioVisualizerRadialBarCount}
              audioVisualizerRadialRadius={audioVisualizerRadialRadius}
              audioVisualizerGridRowCount={audioVisualizerGridRowCount}
              audioVisualizerGridColumnCount={audioVisualizerGridColumnCount}
              audioVisualizerWaveLineWidth={audioVisualizerWaveLineWidth}
            />
          ) : null}
        </div>
      </div>

      <div className="relative shrink-0 px-4 pt-3 pb-4 md:px-8 md:pb-8">
        {isPreSession
          ? renderStartActions(
              'pointer-events-none absolute inset-x-4 bottom-[60px] z-[80] flex justify-center md:inset-x-8 md:bottom-[72px]'
            )
          : null}

        <AgentControlBar
          variant="livekit"
          controls={controls}
          isChatOpen={effectiveChatOpen}
          isConnected={session.isConnected}
          disabled={isPreSession}
          onDisconnect={session.end}
          onIsChatOpenChange={isVoiceMode ? setChatOpen : undefined}
        />
      </div>
    </section>
  );
}
