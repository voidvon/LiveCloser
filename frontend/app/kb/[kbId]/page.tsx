import { KbPageClient } from '@/components/kb/kb-page-client';

export default async function KnowledgeBaseDetailPage({
  params,
}: {
  params: Promise<{ kbId: string }>;
}) {
  const { kbId } = await params;
  return <KbPageClient selectedKbId={kbId} />;
}
