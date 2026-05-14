'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useSessionContext } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { ChatWorkspace } from '@/components/chat/chat-workspace';
import type {
  AgentProfileOption,
  ConversationMessageRecord,
  KnowledgeBaseOption,
} from '@/components/chat/types';

interface ViewControllerProps {
  appConfig: AppConfig;
  sessionMode: 'text' | 'voice';
  onSessionModeChange: (mode: 'text' | 'voice') => void;
  activeAgentProfileId: string | null;
  onActiveAgentProfileIdChange: (agentProfileId: string | null) => void;
  activeConversationId: string | null;
  onActiveConversationIdChange: (conversationId: string | null) => void;
  persistedMessages: ConversationMessageRecord[];
  onPersistedMessagesChange: (messages: ConversationMessageRecord[]) => void;
  onPrepareSessionStart: (
    mode: 'text' | 'voice',
    agentProfileId: string | null,
    conversationId: string | null
  ) => void;
}

export function ViewController({
  appConfig,
  sessionMode,
  onSessionModeChange,
  activeAgentProfileId,
  onActiveAgentProfileIdChange,
  activeConversationId,
  onActiveConversationIdChange,
  persistedMessages,
  onPersistedMessagesChange,
  onPrepareSessionStart,
}: ViewControllerProps) {
  const { isConnected, start, end } = useSessionContext();
  const { resolvedTheme } = useTheme();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseOption[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfileOption[]>([]);

  useEffect(() => {
    void Promise.all([
      fetch('/api/kb/knowledge-bases', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return response.json() as Promise<KnowledgeBaseOption[]>;
      }),
      fetch('/api/kb/agent-profiles', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return response.json() as Promise<AgentProfileOption[]>;
      }),
    ])
      .then(([knowledgeBaseData, agentProfileData]) => {
        setKnowledgeBases(knowledgeBaseData);
        setAgentProfiles(agentProfileData);
      })
      .catch(() => {
        setKnowledgeBases([]);
        setAgentProfiles([]);
      });
  }, []);

  useEffect(() => {
    if (activeAgentProfileId || activeConversationId) {
      return;
    }
    const defaultAgent = agentProfiles.find((item) => item.is_default);
    if (defaultAgent?.id) {
      onActiveAgentProfileIdChange(defaultAgent.id);
      return;
    }
    if (agentProfiles[0]?.id) {
      onActiveAgentProfileIdChange(agentProfiles[0].id);
    }
  }, [activeAgentProfileId, activeConversationId, agentProfiles, onActiveAgentProfileIdChange]);

  const handleStartTextChat = (conversationId: string | null) => {
    if (!appConfig.sessionStartEnabled) {
      return;
    }

    onPrepareSessionStart('text', activeAgentProfileId, conversationId);
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

    onPrepareSessionStart('voice', activeAgentProfileId, conversationId);
    onSessionModeChange('voice');
    void start();
  };

  return (
    <section className="flex h-[calc(100svh-var(--app-mobile-nav-offset))] max-h-[calc(100svh-var(--app-mobile-nav-offset))] flex-col overflow-hidden px-4 py-4 md:px-6 md:py-6 lg:h-svh lg:max-h-svh">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatWorkspace
          agentProfiles={agentProfiles}
          onStartTextChat={handleStartTextChat}
          onStartVoiceChat={handleStartVoiceChat}
          onForceEndSession={end}
          knowledgeBases={knowledgeBases}
          activeAgentProfileId={activeAgentProfileId}
          onActiveAgentProfileIdChange={onActiveAgentProfileIdChange}
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
