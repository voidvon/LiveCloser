import { headers } from 'next/headers';
import { App } from '@/components/app/app';
import { getAppConfig } from '@/lib/utils';

interface ConversationPageProps {
  params: Promise<{
    conversationId: string;
  }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);
  const { conversationId } = await params;

  return <App appConfig={appConfig} initialConversationId={conversationId} />;
}
