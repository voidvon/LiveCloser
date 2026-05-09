'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useSessionContext } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { WelcomeView } from '@/components/app/welcome-view';

interface ViewControllerProps {
  appConfig: AppConfig;
  sessionMode: 'text' | 'voice';
  onSessionModeChange: (mode: 'text' | 'voice') => void;
  activeKnowledgeBaseId: string | null;
  onActiveKnowledgeBaseIdChange: (kbId: string | null) => void;
  onPrepareSessionStart: (mode: 'text' | 'voice', kbId: string | null) => void;
}

export function ViewController({
  appConfig,
  sessionMode,
  onSessionModeChange,
  activeKnowledgeBaseId,
  onActiveKnowledgeBaseIdChange,
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

  const handleStartTextChat = () => {
    if (!appConfig.sessionStartEnabled) {
      return;
    }

    onPrepareSessionStart('text', activeKnowledgeBaseId);
    onSessionModeChange('text');
    void start({
      tracks: {
        microphone: { enabled: false },
        camera: { enabled: false },
        screenShare: { enabled: false },
      },
    });
  };

  const handleStartVoiceChat = () => {
    if (!appConfig.sessionStartEnabled) {
      return;
    }

    onPrepareSessionStart('voice', activeKnowledgeBaseId);
    onSessionModeChange('voice');
    void start();
  };

  return (
    <section className="flex h-svh max-h-svh flex-col overflow-hidden px-4 py-4 md:px-6 md:py-6">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isConnected ? (
          <WelcomeView
            onStartTextChat={handleStartTextChat}
            onStartVoiceChat={handleStartVoiceChat}
            knowledgeBases={knowledgeBases}
            activeKnowledgeBaseId={activeKnowledgeBaseId}
            onActiveKnowledgeBaseIdChange={onActiveKnowledgeBaseIdChange}
            startDisabled={!appConfig.sessionStartEnabled}
            startDisabledReason={appConfig.sessionStartDisabledReason}
            className="flex h-full w-full flex-1 overflow-hidden"
          />
        ) : (
          <AgentSessionView_01
            supportsChatInput={appConfig.supportsChatInput}
            supportsVideoInput={appConfig.supportsVideoInput}
            supportsScreenShare={appConfig.supportsScreenShare}
            isPreConnectBufferEnabled={appConfig.isPreConnectBufferEnabled}
            audioVisualizerType={appConfig.audioVisualizerType}
            audioVisualizerColor={
              resolvedTheme === 'dark'
                ? appConfig.audioVisualizerColorDark
                : appConfig.audioVisualizerColor
            }
            audioVisualizerColorShift={appConfig.audioVisualizerColorShift}
            audioVisualizerBarCount={appConfig.audioVisualizerBarCount}
            audioVisualizerGridRowCount={appConfig.audioVisualizerGridRowCount}
            audioVisualizerGridColumnCount={appConfig.audioVisualizerGridColumnCount}
            audioVisualizerRadialBarCount={appConfig.audioVisualizerRadialBarCount}
            audioVisualizerRadialRadius={appConfig.audioVisualizerRadialRadius}
            audioVisualizerWaveLineWidth={appConfig.audioVisualizerWaveLineWidth}
            initialChatOpen={sessionMode === 'text'}
            sessionMode={sessionMode}
            className="h-full w-full flex-1 rounded-[28px] border border-border/70 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
          />
        )}
      </div>
    </section>
  );
}
