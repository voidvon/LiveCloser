'use client';

import { useMemo, useRef, useState } from 'react';
import { TokenSource } from 'livekit-client';
import { useSession } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr';
import type { AppConfig } from '@/app-config';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { ViewController } from '@/components/app/view-controller';
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
}

type PendingSessionConfig = {
  sessionMode: 'text' | 'voice';
  knowledgeBaseId: string | null;
};

export function App({ appConfig }: AppProps) {
  const [sessionMode, setSessionMode] = useState<'text' | 'voice'>('voice');
  const [activeKnowledgeBaseId, setActiveKnowledgeBaseId] = useState<string | null>(null);
  const pendingSessionConfigRef = useRef<PendingSessionConfig>({
    sessionMode: 'voice',
    knowledgeBaseId: null,
  });
  const tokenSource = useMemo(() => {
    return typeof process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT === 'string'
      ? getSandboxTokenSource(appConfig)
      : TokenSource.literal(async () => {
          const pending = pendingSessionConfigRef.current;
          return requestAppConnectionDetails(
            appConfig,
            pending.sessionMode,
            pending.knowledgeBaseId
          );
        });
  }, [appConfig]);

  const session = useSession(
    tokenSource,
    appConfig.agentName ? { agentName: appConfig.agentName } : undefined
  );

  return (
    <AgentSessionProvider session={session} muted={sessionMode === 'text'}>
      <AppSetup />
      <main className="grid min-h-svh grid-cols-1 place-content-center">
        <ViewController
          appConfig={appConfig}
          sessionMode={sessionMode}
          onSessionModeChange={setSessionMode}
          activeKnowledgeBaseId={activeKnowledgeBaseId}
          onActiveKnowledgeBaseIdChange={setActiveKnowledgeBaseId}
          onPrepareSessionStart={(nextMode, nextKnowledgeBaseId) => {
            pendingSessionConfigRef.current = {
              sessionMode: nextMode,
              knowledgeBaseId: nextKnowledgeBaseId,
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
