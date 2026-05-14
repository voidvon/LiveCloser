'use client';

import { type ComponentProps, useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { type AgentState, type ReceivedMessage } from '@livekit/components-react';
import { AgentChatIndicator } from '@/components/agents-ui/agent-chat-indicator';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { cn } from '@/lib/shadcn/utils';

export type TranscriptMessage = {
  id: string;
  timestamp: number;
  from: 'user' | 'assistant';
  message: string;
};

export interface AgentChatTranscriptProps extends ComponentProps<'div'> {
  agentState?: AgentState;
  messages?: ReceivedMessage[];
  persistedMessages?: TranscriptMessage[];
  className?: string;
  scrollStorageKey?: string | null;
}

function renderTranscriptMessage(receivedMessage: TranscriptMessage) {
  const { id, timestamp, from, message } = receivedMessage;
  const title = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));

  return (
    <Message key={id} title={title} from={from}>
      <MessageContent>
        <MessageResponse>{message}</MessageResponse>
      </MessageContent>
    </Message>
  );
}

export function AgentChatTranscript({
  agentState,
  messages = [],
  persistedMessages = [],
  className,
  scrollStorageKey = null,
  ...props
}: AgentChatTranscriptProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingRestoreKeyRef = useRef<string | null>(null);
  const livekitMessages: TranscriptMessage[] = messages.map((receivedMessage) => {
    const { id, timestamp, from, message, type } = receivedMessage;
    const messageOrigin =
      type === 'userTranscript'
        ? 'user'
        : type === 'agentTranscript'
          ? 'assistant'
          : from?.isLocal
            ? 'user'
            : 'assistant';

    return {
      id,
      timestamp,
      from: messageOrigin,
      message,
    };
  });

  const mergedMessages = [...persistedMessages, ...livekitMessages]
    .filter((message, index, array) => array.findIndex((item) => item.id === message.id) === index)
    .sort((a, b) => a.timestamp - b.timestamp);
  const visualMessages = [...mergedMessages].reverse();

  useEffect(() => {
    pendingRestoreKeyRef.current = scrollStorageKey;
  }, [scrollStorageKey]);

  useEffect(() => {
    if (!scrollStorageKey || pendingRestoreKeyRef.current !== scrollStorageKey) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const storedValue = window.sessionStorage.getItem(scrollStorageKey);
      container.scrollTop = storedValue ? Number(storedValue) || 0 : 0;
      pendingRestoreKeyRef.current = null;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [scrollStorageKey, visualMessages.length]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full min-h-0 flex-col-reverse overflow-y-auto px-4 py-6 md:px-6',
        className
      )}
      onScroll={(event) => {
        if (!scrollStorageKey) {
          return;
        }
        window.sessionStorage.setItem(scrollStorageKey, String(event.currentTarget.scrollTop));
      }}
      {...props}
    >
      <div className="flex flex-col-reverse gap-8">
        {visualMessages.map(renderTranscriptMessage)}
        <AnimatePresence>
          {agentState === 'thinking' && <AgentChatIndicator size="sm" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
