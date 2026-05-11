'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCcw, Save, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InteractiveCard } from '@/components/ui/interactive-card';
import { Surface } from '@/components/ui/surface';

type EmbeddingProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string;
  api_key_env: string;
  created_at: string;
  updated_at: string;
};

type KnowledgeBase = {
  id: string;
  name: string;
  embedding_profile_id: string | null;
};

type ProfileForm = {
  name: string;
  provider: string;
  model: string;
  base_url: string;
  api_key_env: string;
};

type LoadState = 'idle' | 'loading' | 'error';
type EditorMode = 'create' | 'edit';

const DEFAULT_PROFILE_FORM: ProfileForm = {
  name: '',
  provider: 'openai_compatible',
  model: '',
  base_url: '',
  api_key_env: '',
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function sendJson<T>(url: string, method: 'POST' | 'PATCH', payload: object): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function deleteJson(url: string): Promise<void> {
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function toForm(profile: EmbeddingProfile | null): ProfileForm {
  if (!profile) return DEFAULT_PROFILE_FORM;
  return {
    name: profile.name,
    provider: profile.provider,
    model: profile.model,
    base_url: profile.base_url,
    api_key_env: profile.api_key_env,
  };
}

function isFormEqual(left: ProfileForm, right: ProfileForm) {
  return (
    left.name === right.name &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.base_url === right.base_url &&
    left.api_key_env === right.api_key_env
  );
}

export function SettingsPageClient() {
  const [profiles, setProfiles] = useState<EmbeddingProfile[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('create');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [profileForm, setProfileForm] = useState<ProfileForm>(DEFAULT_PROFILE_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((item) => item.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  const snapshot = useMemo(
    () => (mode === 'edit' ? toForm(selectedProfile) : DEFAULT_PROFILE_FORM),
    [mode, selectedProfile]
  );
  const isDirty = !isFormEqual(profileForm, snapshot);

  const loadData = useCallback(async () => {
    try {
      setState('loading');
      setError(null);
      const [nextProfiles, nextKnowledgeBases] = await Promise.all([
        getJson<EmbeddingProfile[]>('/api/kb/embedding-profiles'),
        getJson<KnowledgeBase[]>('/api/kb/knowledge-bases'),
      ]);
      setProfiles(nextProfiles);
      setKnowledgeBases(nextKnowledgeBases);

      if (nextProfiles.length === 0) {
        setMode('create');
        setSelectedProfileId('');
        setProfileForm(DEFAULT_PROFILE_FORM);
      } else {
        let nextSelectedId = nextProfiles[0].id;
        setSelectedProfileId((current) => {
          nextSelectedId = nextProfiles.some((item) => item.id === current)
            ? current
            : nextProfiles[0].id;
          return nextSelectedId;
        });
        const nextSelected = nextProfiles.find((item) => item.id === nextSelectedId) ?? null;
        setMode('edit');
        setProfileForm(toForm(nextSelected));
      }

      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载 Embedding 模型失败');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleSelectProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId) ?? null;
    setMode('edit');
    setSelectedProfileId(profileId);
    setProfileForm(toForm(profile));
    setError(null);
  }

  function handleStartCreate() {
    setMode('create');
    setSelectedProfileId('');
    setProfileForm(DEFAULT_PROFILE_FORM);
    setError(null);
  }

  async function handleSave() {
    if (!profileForm.name.trim()) {
      setError('模型名称不能为空');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: profileForm.name.trim(),
        provider: profileForm.provider.trim() || 'openai_compatible',
        model: profileForm.model.trim(),
        base_url: profileForm.base_url.trim(),
        api_key_env: profileForm.api_key_env.trim(),
      };

      if (mode === 'create') {
        const record = await sendJson<EmbeddingProfile>(
          '/api/kb/embedding-profiles',
          'POST',
          payload
        );
        setProfiles((current) => [record, ...current]);
        setMode('edit');
        setSelectedProfileId(record.id);
        setProfileForm(toForm(record));
      } else if (selectedProfile) {
        const record = await sendJson<EmbeddingProfile>(
          `/api/kb/embedding-profiles/${selectedProfile.id}`,
          'PATCH',
          payload
        );
        setProfiles((current) => current.map((item) => (item.id === record.id ? record : item)));
        setProfileForm(toForm(record));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存 Embedding 模型失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedProfile) return;
    if (!window.confirm(`确认删除模型“${selectedProfile.name}”吗？`)) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await deleteJson(`/api/kb/embedding-profiles/${selectedProfile.id}`);

      const remaining = profiles.filter((item) => item.id !== selectedProfile.id);
      setProfiles(remaining);

      if (remaining.length === 0) {
        setMode('create');
        setSelectedProfileId('');
        setProfileForm(DEFAULT_PROFILE_FORM);
      } else {
        setMode('edit');
        setSelectedProfileId(remaining[0].id);
        setProfileForm(toForm(remaining[0]));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除 Embedding 模型失败');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_28%),linear-gradient(180deg,_transparent,_rgba(15,23,42,0.03))] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">设置</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Embedding 模型中心</h1>
            <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6 md:text-base">
              这里维护全局 Embedding
              模型配置，可创建多个。具体知识库只在知识库页选择“使用哪一个模型”。
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => void loadData()}>
              <RefreshCcw className="mr-2 size-4" />
              刷新
            </Button>
            <Button variant="outline" className="rounded-full" asChild>
              <Link href="/kb">回到知识库</Link>
            </Button>
          </div>
        </div>

        {error ? (
          <Surface
            className="mb-6 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            variant="muted"
            radius="lg"
          >
            {error}
          </Surface>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <Surface padding="md">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">模型列表</h2>
                <p className="text-muted-foreground text-sm">全局维护，可被多个知识库复用。</p>
              </div>
              <span className="font-mono text-xs">{profiles.length}</span>
            </div>

            <Button
              variant="outline"
              className="mb-4 w-full rounded-full"
              onClick={handleStartCreate}
            >
              <Plus className="mr-2 size-4" />
              新建模型
            </Button>

            {state === 'loading' ? <SettingsGhost lines={4} /> : null}

            {state !== 'loading' && profiles.length === 0 ? (
              <EmptyBlock
                title="还没有 Embedding 模型"
                description="先新建一个全局模型配置，之后再到知识库页面把它分配给具体知识库。"
              />
            ) : null}

            <div className="space-y-3">
              {profiles.map((profile) => {
                const usageCount = knowledgeBases.filter(
                  (kb) => kb.embedding_profile_id === profile.id
                ).length;
                const active = mode === 'edit' && profile.id === selectedProfileId;

                return (
                  <InteractiveCard
                    key={profile.id}
                    onClick={() => handleSelectProfile(profile.id)}
                    role="button"
                    tabIndex={0}
                    variant={active ? 'selected' : 'default'}
                    radius="lg"
                    padding="lg"
                    className="cursor-pointer"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectProfile(profile.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{profile.name}</p>
                        <p className="text-muted-foreground mt-2 text-sm leading-5">
                          {profile.model || '未配置具体模型'}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] uppercase">{profile.provider}</span>
                    </div>
                    <div className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
                      <span>被 {usageCount} 个知识库使用</span>
                      <span>{new Date(profile.updated_at).toLocaleDateString()}</span>
                    </div>
                  </InteractiveCard>
                );
              })}
            </div>
          </Surface>

          <Surface padding="md">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  {mode === 'create' ? '新建 Embedding 模型' : '编辑 Embedding 模型'}
                </h2>
                <p className="text-muted-foreground text-sm">
                  这里只配置模型本身，不绑定具体知识库。
                </p>
              </div>

              <div className="flex gap-2">
                {mode === 'edit' && selectedProfile ? (
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                  >
                    <Trash2 className="mr-2 size-4" />
                    {deleting ? '删除中...' : '删除'}
                  </Button>
                ) : null}
                <Button
                  className="rounded-full"
                  onClick={() => void handleSave()}
                  disabled={saving || !isDirty}
                >
                  <Save className="mr-2 size-4" />
                  {saving ? '保存中...' : mode === 'create' ? '创建模型' : '保存修改'}
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <LabeledField label="模型名称">
                <Input
                  value={profileForm.name}
                  onChange={(e) =>
                    setProfileForm((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                  placeholder="例如 OpenAI Large Embedding"
                />
              </LabeledField>

              <LabeledField label="提供方">
                <Input
                  value={profileForm.provider}
                  onChange={(e) =>
                    setProfileForm((current) => ({
                      ...current,
                      provider: e.target.value,
                    }))
                  }
                  placeholder="openai_compatible"
                />
              </LabeledField>

              <LabeledField label="模型 ID">
                <Input
                  value={profileForm.model}
                  onChange={(e) =>
                    setProfileForm((current) => ({
                      ...current,
                      model: e.target.value,
                    }))
                  }
                  placeholder="例如 text-embedding-3-large"
                />
              </LabeledField>

              <LabeledField label="Base URL">
                <Input
                  value={profileForm.base_url}
                  onChange={(e) =>
                    setProfileForm((current) => ({
                      ...current,
                      base_url: e.target.value,
                    }))
                  }
                  placeholder="例如 https://api.openai.com/v1"
                />
              </LabeledField>

              <LabeledField label="API Key 环境变量">
                <Input
                  value={profileForm.api_key_env}
                  onChange={(e) =>
                    setProfileForm((current) => ({
                      ...current,
                      api_key_env: e.target.value,
                    }))
                  }
                  placeholder="例如 OPENAI_API_KEY"
                />
              </LabeledField>

              <Surface className="border-dashed px-4 py-4" variant="muted" radius="lg">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/12 text-primary rounded-2xl p-2">
                    <Settings2 className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">使用方式</p>
                    <p className="text-muted-foreground mt-2 text-sm leading-6">
                      模型在这里定义一次，然后到 <span className="font-mono">/kb</span>{' '}
                      给具体知识库选择使用。一个模型可以复用到多个知识库。
                    </p>
                  </div>
                </div>
              </Surface>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function EmptyBlock({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Surface className="border-dashed px-4 py-8 text-center" variant="muted" radius="lg">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-6">{description}</p>
      {action}
    </Surface>
  );
}

function SettingsGhost({ lines }: { lines: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, index) => (
        <Surface key={index} className="h-20 animate-pulse" variant="muted" radius="lg" />
      ))}
    </div>
  );
}
