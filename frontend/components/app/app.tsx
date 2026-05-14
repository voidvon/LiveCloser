'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TokenSource } from 'livekit-client';
import { useSession } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr';
import type { AppConfig } from '@/app-config';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { ViewController } from '@/components/app/view-controller';
import type { ConversationMessageRecord } from '@/components/chat/types';
import { Toaster } from '@/components/ui/sonner';
import { useAgentErrors } from '@/hooks/useAgentErrors';
import { useDebugMode } from '@/hooks/useDebug';
import { getSandboxTokenSource, requestAppConnectionDetails } from '@/lib/utils';

const IN_DEVELOPMENT = process.env.NODE_ENV !== 'production';

function AppSetup() {
  useDebugMode({ enabled: IN_DEVELOPMENT });
  useAgentErrors();

  return null;
}

interface AppProps {
  appConfig: AppConfig;
  initialConversationId?: string | null;
}

type PendingSessionConfig = {
  sessionMode: 'text' | 'voice';
  agentProfileId: string | null;
  conversationId: string | null;
  dispatchAgent: boolean;
};

export function App({ appConfig, initialConversationId = null }: AppProps) {
  const [sessionMode, setSessionMode] = useState<'text' | 'voice'>('text');
  const [activeAgentProfileId, setActiveAgentProfileId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId
  );
  const [persistedMessages, setPersistedMessages] = useState<ConversationMessageRecord[]>([]);
  const pendingSessionConfigRef = useRef<PendingSessionConfig>({
    sessionMode: 'text',
    agentProfileId: null,
    conversationId: null,
    dispatchAgent: false,
  });
  const tokenSource = useMemo(() => {
    return typeof process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT === 'string'
      ? getSandboxTokenSource(appConfig)
      : TokenSource.literal(async () => {
          const pending = pendingSessionConfigRef.current;
          const connectionDetails = await requestAppConnectionDetails(
            appConfig,
            pending.sessionMode,
            pending.agentProfileId,
            pending.conversationId,
            pending.dispatchAgent
          );
          if (pending.dispatchAgent) {
            pendingSessionConfigRef.current = {
              ...pending,
              dispatchAgent: false,
            };
          }
          return connectionDetails;
        });
  }, [appConfig]);

  const session = useSession(
    tokenSource,
    appConfig.agentName ? { agentName: appConfig.agentName } : undefined
  );

  useEffect(() => {
    setActiveConversationId(initialConversationId);
  }, [initialConversationId]);

  return (
    <AgentSessionProvider session={session} muted={sessionMode === 'text'}>
      <AppSetup />
      <main className="min-h-svh">
        <ViewController
          appConfig={appConfig}
          sessionMode={sessionMode}
          onSessionModeChange={setSessionMode}
          activeAgentProfileId={activeAgentProfileId}
          onActiveAgentProfileIdChange={setActiveAgentProfileId}
          activeConversationId={activeConversationId}
          onActiveConversationIdChange={setActiveConversationId}
          persistedMessages={persistedMessages}
          onPersistedMessagesChange={setPersistedMessages}
          onPrepareSessionStart={(nextMode, nextAgentProfileId, nextConversationId) => {
            pendingSessionConfigRef.current = {
              sessionMode: nextMode,
              agentProfileId: nextAgentProfileId,
              conversationId: nextConversationId,
              dispatchAgent: true,
            };
          }}
        />
      </main>
      {sessionMode === 'voice' ? <StartAudioButton label="启用音频播放" /> : null}
      <Toaster
        icons={{
          warning: <WarningIcon weight="bold" />,
        }}
        position="top-center"
        className="toaster group"
        style={
          {
            '--normal-bg': 'var(--popover)',
            '--normal-text': 'var(--popover-foreground)',
            '--normal-border': 'var(--border)',
          } as React.CSSProperties
        }
      />
    </AgentSessionProvider>
  );
}
