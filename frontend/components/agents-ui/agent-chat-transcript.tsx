'use client';

import { type ComponentProps } from 'react';
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
}

function renderTranscriptMessage(receivedMessage: TranscriptMessage) {
  const { id, timestamp, from, message } = receivedMessage;
  const locale = navigator?.language ?? 'en-US';
  const title = new Date(timestamp).toLocaleTimeString(locale, { timeStyle: 'full' });

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
  ...props
}: AgentChatTranscriptProps) {
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

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col-reverse overflow-y-auto px-4 py-6 md:px-6',
        className
      )}
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
