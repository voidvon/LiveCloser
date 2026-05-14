import { headers } from 'next/headers';
import { App } from '@/components/app/app';
import { getAppConfig } from '@/lib/utils';

interface WorkspaceLayoutProps {
  children: React.ReactNode;
}

export default async function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);

  return (
    <>
      <App appConfig={appConfig} />
      {children}
    </>
  );
}
