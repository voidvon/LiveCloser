import { Surface } from '@/components/ui/surface';

export default function SettingsPage() {
  return (
    <div className="min-h-svh px-6 py-10 md:px-10">
      <Surface
        className="mx-auto max-w-5xl border-dashed p-10"
        variant="muted"
        radius="xl"
      >
        <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">设置</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">设置工作区预留中</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
          等第一阶段知识库流程完全接通后，运行时参数、模型凭证和环境级配置会统一放到这里。
        </p>
      </Surface>
    </div>
  );
}
