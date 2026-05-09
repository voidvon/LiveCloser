'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useSessionContext } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { ChatWorkspace } from '@/components/chat/chat-workspace';
import type { ConversationMessageRecord } from '@/components/chat/types';

interface ViewControllerProps {
  appConfig: AppConfig;
  sessionMode: 'text' | 'voice';
  onSessionModeChange: (mode: 'text' | 'voice') => void;
  activeKnowledgeBaseId: string | null;
  onActiveKnowledgeBaseIdChange: (kbId: string | null) => void;
  activeConversationId: string | null;
  onActiveConversationIdChange: (conversationId: string | null) => void;
  persistedMessages: ConversationMessageRecord[];
  onPersistedMessagesChange: (messages: ConversationMessageRecord[]) => void;
  onPrepareSessionStart: (
    mode: 'text' | 'voice',
    kbId: string | null,
    conversationId: string | null
  ) => void;
}

export function ViewController({
  appConfig,
  sessionMode,
  onSessionModeChange,
  activeKnowledgeBaseId,
  onActiveKnowledgeBaseIdChange,
  activeConversationId,
  onActiveConversationIdChange,
  persistedMessages,
  onPersistedMessagesChange,
  onPrepareSessionStart,
}: ViewControllerProps) {
  const { isConnected, start } = useSessionContext();
  const { resolvedTheme } = useTheme();
  const [knowledgeBases, setKnowledgeBases] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    void fetch('/api/kb/knowledge-bases', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return response.json() as Promise<Array<{ id: string; name: string }>>;
      })
      .then((data) => {
        setKnowledgeBases(data);
        if (!activeKnowledgeBaseId && data[0]?.id) {
          onActiveKnowledgeBaseIdChange(data[0].id);
        }
      })
      .catch(() => {
        setKnowledgeBases([]);
      });
  }, [activeKnowledgeBaseId, onActiveKnowledgeBaseIdChange]);

  const handleStartTextChat = (conversationId: string | null) => {
    if (!appConfig.sessionStartEnabled) {
      return;
    }

    onPrepareSessionStart('text', activeKnowledgeBaseId, conversationId);
    onSessionModeChange('text');
    void start({
      tracks: {
        microphone: { enabled: false },
        camera: { enabled: false },
        screenShare: { enabled: false },
      },
    });
  };

  const handleStartVoiceChat = (conversationId: string | null) => {
    if (!appConfig.sessionStartEnabled) {
      return;
    }

    onPrepareSessionStart('voice', activeKnowledgeBaseId, conversationId);
    onSessionModeChange('voice');
    void start();
  };

  return (
    <section className="flex h-svh max-h-svh flex-col overflow-hidden px-4 py-4 md:px-6 md:py-6">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatWorkspace
          onStartTextChat={handleStartTextChat}
          onStartVoiceChat={handleStartVoiceChat}
          knowledgeBases={knowledgeBases}
          activeKnowledgeBaseId={activeKnowledgeBaseId}
          onActiveKnowledgeBaseIdChange={onActiveKnowledgeBaseIdChange}
          activeConversationId={activeConversationId}
          onActiveConversationIdChange={onActiveConversationIdChange}
          persistedMessages={persistedMessages}
          onPersistedMessagesChange={onPersistedMessagesChange}
          startDisabled={!appConfig.sessionStartEnabled}
          startDisabledReason={appConfig.sessionStartDisabledReason}
          sessionMode={sessionMode}
          sessionActive={isConnected}
          sessionViewConfig={{
            supportsChatInput: appConfig.supportsChatInput,
            supportsVideoInput: appConfig.supportsVideoInput,
            supportsScreenShare: appConfig.supportsScreenShare,
            isPreConnectBufferEnabled: appConfig.isPreConnectBufferEnabled,
            audioVisualizerType: appConfig.audioVisualizerType,
            audioVisualizerColor:
              resolvedTheme === 'dark'
                ? appConfig.audioVisualizerColorDark
                : appConfig.audioVisualizerColor,
            audioVisualizerColorShift: appConfig.audioVisualizerColorShift,
            audioVisualizerBarCount: appConfig.audioVisualizerBarCount,
            audioVisualizerGridRowCount: appConfig.audioVisualizerGridRowCount,
            audioVisualizerGridColumnCount: appConfig.audioVisualizerGridColumnCount,
            audioVisualizerRadialBarCount: appConfig.audioVisualizerRadialBarCount,
            audioVisualizerRadialRadius: appConfig.audioVisualizerRadialRadius,
            audioVisualizerWaveLineWidth: appConfig.audioVisualizerWaveLineWidth,
          }}
          className="flex h-full w-full flex-1 overflow-hidden"
        />
      </div>
    </section>
  );
}
