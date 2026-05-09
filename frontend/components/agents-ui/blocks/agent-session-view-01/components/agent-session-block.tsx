'use client';

import React, { useEffect, useState } from 'react';
import { Phone, TextCursorInput } from 'lucide-react';
import { AnimatePresence, type MotionProps, motion } from 'motion/react';
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
import { Shimmer } from '@/components/ai-elements/shimmer';
import { cn } from '@/lib/shadcn/utils';
import { TileLayout } from './tile-view';

const MotionMessage = motion.create(Shimmer);

const BOTTOM_VIEW_MOTION_PROPS: MotionProps = {
  variants: {
    visible: {
      opacity: 1,
      translateY: '0%',
    },
    hidden: {
      opacity: 0,
      translateY: '100%',
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.3,
    delay: 0.5,
    ease: 'easeOut',
  },
};

const CHAT_MOTION_PROPS: MotionProps = {
  variants: {
    hidden: {
      opacity: 0,
      transition: {
        ease: 'easeOut',
        duration: 0.3,
      },
    },
    visible: {
      opacity: 1,
      transition: {
        delay: 0.2,
        ease: 'easeOut',
        duration: 0.3,
      },
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
};

const SHIMMER_MOTION_PROPS: MotionProps = {
  variants: {
    visible: {
      opacity: 1,
      transition: {
        ease: 'easeIn',
        duration: 0.5,
        delay: 0.8,
      },
    },
    hidden: {
      opacity: 0,
      transition: {
        ease: 'easeIn',
        duration: 0.5,
        delay: 0,
      },
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
};

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
  ref,
  className,
  ...props
}: React.ComponentProps<'section'> & AgentSessionView_01Props) {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
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

  const transcriptPanelClassName =
    sessionMode === 'voice'
      ? 'mx-auto w-full max-w-2xl [&_.is-user>div]:rounded-[22px] [&>div>div]:px-4 [&>div>div]:pt-40 md:[&>div>div]:px-6'
      : 'h-full min-h-0 [&_.is-user>div]:rounded-[22px] [&>div>div]:px-4 [&>div>div]:py-6 md:[&>div>div]:px-6';

  if (sessionMode === 'text') {
    return (
      <section
        ref={ref}
        className={cn(
          'bg-background relative z-10 flex h-full min-h-0 w-full max-h-full flex-col overflow-hidden',
          className
        )}
        {...props}
      >
        <div className="border-border/70 shrink-0 border-b px-5 py-4">
          <p className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
            当前会话
          </p>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {activeConversationTitle ?? '请选择或新建会话'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {isPreSession
              ? '开始前先查看历史消息。启动后会在同一界面继续对话。'
              : '当前为纯文字会话模式，不会启用录音，也不会播放语音。'}
          </p>
          {loadingMessages ? (
            <div className="mt-3 overflow-hidden rounded-full bg-border/60">
              <motion.div
                className="h-1 w-1/3 rounded-full bg-foreground/80"
                animate={{ x: ['-20%', '260%'] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          ) : null}
        </div>

        {viewError ? (
          <div className="px-5 pt-4">
            <Alert variant="destructive">
              <AlertTitle>操作失败</AlertTitle>
              <AlertDescription>{viewError}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {startDisabledReason ? (
          <div className="px-5 pt-4">
            <Alert>
              <AlertTitle>当前无法启动会话</AlertTitle>
              <AlertDescription>{startDisabledReason}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4 md:px-8 md:pt-6">
          <div className="mb-4 shrink-0">
            <p className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              消息会话
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">消息对话</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[24px] border border-border/70 bg-accent/25">
            {!activeConversationId ? (
              <div className="text-muted-foreground flex h-full min-h-[240px] items-center justify-center px-6 text-sm">
                先从左侧新建或选择一个会话。
              </div>
            ) : loadingMessages ? (
              <div className="text-muted-foreground flex h-full min-h-[240px] items-center justify-center px-6 text-sm">
                正在加载历史消息…
              </div>
            ) : transcriptHistory.length === 0 && isPreSession ? (
              <div className="text-muted-foreground flex h-full min-h-[240px] items-center justify-center px-6 text-sm">
                当前会话还没有历史消息，点击下方按钮开始。
              </div>
            ) : isPreSession ? (
              <div className="h-full min-h-0">
                <AgentChatTranscript
                  agentState={undefined}
                  messages={[]}
                  persistedMessages={transcriptHistory}
                  className="h-full min-h-0 [&_.is-user>div]:rounded-[22px] [&>div>div]:px-4 [&>div>div]:py-6 md:[&>div>div]:px-6"
                />
              </div>
            ) : (
              <div className="h-full min-h-0">
                <AgentChatTranscript
                  agentState={agentState}
                  messages={isPreSession ? [] : messages}
                  persistedMessages={transcriptHistory}
                  className={transcriptPanelClassName}
                />
              </div>
            )}
          </div>
        </div>

        <div className="relative shrink-0 px-4 pb-4 pt-3 md:px-8 md:pb-8">
          {isPreSession ? (
            <div className="pointer-events-none absolute inset-x-4 bottom-[60px] z-[80] flex justify-center md:inset-x-8 md:bottom-[72px]">
              <div className="pointer-events-auto flex flex-col gap-2 rounded-full border border-border/70 bg-background/96 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:flex-row">
                <Button
                  variant="outline"
                  onClick={onStartTextChat}
                  disabled={startDisabled}
                  className="rounded-full"
                >
                  <TextCursorInput className="mr-2 size-4" />
                  消息对话
                </Button>
                <Button
                  onClick={onStartVoiceChat}
                  disabled={startDisabled}
                  className="rounded-full"
                >
                  <Phone className="mr-2 size-4" />
                  语音对话
                </Button>
              </div>
            </div>
          ) : null}
          <AgentControlBar
            variant="livekit"
            controls={controls}
            isChatOpen
            isConnected={session.isConnected}
            disabled={isPreSession}
            onDisconnect={session.end}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className={cn(
        'bg-background relative z-10 h-full min-h-0 w-full max-h-full overflow-hidden',
        className
      )}
      {...props}
    >
      <Fade top className="absolute inset-x-4 top-0 z-10 h-40" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <div className="border-border/70 bg-background/92 border-b px-5 py-4 backdrop-blur">
          <p className="font-mono text-[11px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
            当前会话
          </p>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {activeConversationTitle ?? '请选择或新建会话'}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {isPreSession
              ? '开始前先查看历史消息。启动后会在同一界面继续对话。'
              : '语音通话只保存最终文案，历史会和当前实时记录合并显示。'}
          </p>
          {loadingMessages ? (
            <div className="mt-3 overflow-hidden rounded-full bg-border/60">
              <motion.div
                className="h-1 w-1/3 rounded-full bg-foreground/80"
                animate={{ x: ['-20%', '260%'] }}
                transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {viewError ? (
        <div className="absolute inset-x-5 top-[104px] z-30 md:top-[112px]">
          <Alert variant="destructive">
            <AlertTitle>操作失败</AlertTitle>
            <AlertDescription>{viewError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {startDisabledReason ? (
        <div className="absolute inset-x-5 top-[104px] z-30 md:top-[112px]">
          <Alert>
            <AlertTitle>当前无法启动会话</AlertTitle>
            <AlertDescription>{startDisabledReason}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {/* transcript */}

      <div className="absolute top-0 bottom-[135px] flex w-full flex-col md:bottom-[170px]">
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              {...CHAT_MOTION_PROPS}
              className="flex h-full w-full flex-col gap-4 space-y-3 transition-opacity duration-300 ease-out"
            >
              {!activeConversationId ? (
                <div className="text-muted-foreground mx-auto flex h-full w-full max-w-2xl items-center justify-center px-6 pt-40 text-sm md:px-0">
                  先从左侧新建或选择一个会话。
                </div>
              ) : loadingMessages ? (
                <div className="text-muted-foreground mx-auto flex h-full w-full max-w-2xl items-center justify-center px-6 pt-40 text-sm md:px-0">
                  正在加载历史消息…
                </div>
              ) : transcriptHistory.length === 0 && isPreSession ? (
                <div className="text-muted-foreground mx-auto flex h-full w-full max-w-2xl items-center justify-center px-6 pt-40 text-sm md:px-0">
                  当前会话还没有历史消息，点击下方按钮开始。
                </div>
              ) : isPreSession ? (
                <div className="mx-auto h-full w-full max-w-2xl min-h-0">
                  <AgentChatTranscript
                    agentState={undefined}
                    messages={[]}
                    persistedMessages={transcriptHistory}
                    className="mx-auto h-full min-h-0 w-full max-w-2xl [&_.is-user>div]:rounded-[22px]"
                  />
                </div>
              ) : (
                <div className="mx-auto h-full w-full max-w-2xl min-h-0">
                  <AgentChatTranscript
                    agentState={agentState}
                    messages={messages}
                    persistedMessages={transcriptHistory}
                    className="mx-auto w-full max-w-2xl [&_.is-user>div]:rounded-[22px] [&>div>div]:px-4 [&>div>div]:pt-40 md:[&>div>div]:px-6"
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Tile layout */}
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
      {/* Bottom */}
      <motion.div
        {...BOTTOM_VIEW_MOTION_PROPS}
        className="absolute inset-x-3 bottom-0 z-50 md:inset-x-12"
      >
        {isPreSession ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[58px] z-[80] flex justify-center">
            <div className="pointer-events-auto flex flex-col gap-2 rounded-full border border-border/70 bg-background/96 p-2 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:flex-row">
              <Button
                variant="outline"
                onClick={onStartTextChat}
                disabled={startDisabled}
                className="rounded-full"
              >
                <TextCursorInput className="mr-2 size-4" />
                消息对话
              </Button>
              <Button onClick={onStartVoiceChat} disabled={startDisabled} className="rounded-full">
                <Phone className="mr-2 size-4" />
                语音对话
              </Button>
            </div>
          </div>
        ) : null}
        {/* Pre-connect message */}
        {!isPreSession && isPreConnectBufferEnabled && (
          <AnimatePresence>
            {messages.length === 0 && (
              <MotionMessage
                key="pre-connect-message"
                duration={2}
                aria-hidden={messages.length > 0}
                {...SHIMMER_MOTION_PROPS}
                className="pointer-events-none mx-auto block w-full max-w-2xl pb-4 text-center text-sm font-semibold"
              >
                {preConnectMessage}
              </MotionMessage>
            )}
          </AnimatePresence>
        )}
        <div className="bg-background relative mx-auto max-w-2xl pb-3 md:pb-12">
          <Fade bottom className="absolute inset-x-0 top-0 h-4 -translate-y-full" />
          <AgentControlBar
            variant="livekit"
            controls={controls}
            isChatOpen={chatOpen}
            isConnected={session.isConnected}
            disabled={isPreSession}
            onDisconnect={session.end}
            onIsChatOpenChange={setChatOpen}
          />
        </div>
      </motion.div>
    </section>
  );
}
