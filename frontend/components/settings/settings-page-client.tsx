'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCcw,
  Settings2,
  Trash2,
  Volume2,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InteractiveCard } from '@/components/ui/interactive-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

type ChatModelProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  is_default: number;
  created_at: string;
  updated_at: string;
};

type KnowledgeBase = {
  id: string;
  name: string;
  embedding_profile_id: string | null;
};

type LoadState = 'idle' | 'loading' | 'error';
type EditorMode = 'create' | 'edit';
type SettingsSection = 'models';
type ModelTab = 'all' | 'chat' | 'embedding' | 'stt' | 'tts';
type ProfileKind = 'chat' | 'embedding';

type ManagedChatModel = ChatModelProfile & {
  kind: 'chat';
};

type ManagedEmbeddingProfile = EmbeddingProfile & {
  kind: 'embedding';
};

type ManagedModel = ManagedChatModel | ManagedEmbeddingProfile;

type ProfileForm = {
  kind: ProfileKind;
  name: string;
  model: string;
  base_url: string;
  api_key: string;
  api_key_env: string;
};

const DEFAULT_PROFILE_FORM: ProfileForm = {
  kind: 'chat',
  name: '',
  model: '',
  base_url: '',
  api_key: '',
  api_key_env: '',
};

const SETTINGS_NAV: Array<{
  id: SettingsSection;
  label: string;
  description: string;
}> = [
  {
    id: 'models',
    label: '模型管理',
    description: '统一维护全局模型配置，后续可继续扩展更多设置项。',
  },
];

const MODEL_TABS: Array<{
  id: ModelTab;
  label: string;
  icon: typeof BrainCircuit;
}> = [
  { id: 'all', label: '全部', icon: Settings2 },
  { id: 'chat', label: '对话', icon: Bot },
  { id: 'embedding', label: 'Embedding', icon: BrainCircuit },
  { id: 'stt', label: 'STT', icon: Waves },
  { id: 'tts', label: 'TTS', icon: Volume2 },
];

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

async function postJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'POST' });
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

function toForm(profile: ManagedModel | null): ProfileForm {
  if (!profile) return DEFAULT_PROFILE_FORM;
  if (profile.kind === 'chat') {
    return {
      kind: 'chat',
      name: profile.name,
      model: profile.model,
      base_url: profile.base_url,
      api_key: profile.api_key,
      api_key_env: '',
    };
  }

  return {
    kind: 'embedding',
    name: profile.name,
    model: profile.model,
    base_url: profile.base_url,
    api_key: '',
    api_key_env: profile.api_key_env,
  };
}

function isFormEqual(left: ProfileForm, right: ProfileForm) {
  return (
    left.kind === right.kind &&
    left.name === right.name &&
    left.model === right.model &&
    left.base_url === right.base_url &&
    left.api_key === right.api_key &&
    left.api_key_env === right.api_key_env
  );
}

function getTabCount(
  tab: ModelTab,
  chatProfiles: ChatModelProfile[],
  embeddingProfiles: EmbeddingProfile[]
) {
  if (tab === 'all') {
    return chatProfiles.length + embeddingProfiles.length;
  }
  if (tab === 'chat') {
    return chatProfiles.length;
  }
  if (tab === 'embedding') {
    return embeddingProfiles.length;
  }
  return 0;
}

function getKindLabel(kind: ProfileKind) {
  return kind === 'chat' ? '对话' : 'Embedding';
}

function getCreateKind(activeTab: ModelTab): ProfileKind {
  if (activeTab === 'embedding') {
    return 'embedding';
  }
  return 'chat';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN');
}

function sortManagedModels(left: ManagedModel, right: ManagedModel) {
  if (left.kind === 'chat' && right.kind === 'chat' && left.is_default !== right.is_default) {
    return right.is_default - left.is_default;
  }
  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}

export function SettingsPageClient() {
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [chatProfiles, setChatProfiles] = useState<ChatModelProfile[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('models');
  const [activeTab, setActiveTab] = useState<ModelTab>('all');
  const [mode, setMode] = useState<EditorMode>('create');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(DEFAULT_PROFILE_FORM);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [settingDefaultKey, setSettingDefaultKey] = useState<string | null>(null);

  const usageCountMap = useMemo(() => {
    const next = new Map<string, number>();
    for (const kb of knowledgeBases) {
      if (!kb.embedding_profile_id) continue;
      next.set(kb.embedding_profile_id, (next.get(kb.embedding_profile_id) ?? 0) + 1);
    }
    return next;
  }, [knowledgeBases]);

  const allModels = useMemo<ManagedModel[]>(() => {
    const models: ManagedModel[] = [
      ...chatProfiles.map((profile) => ({ ...profile, kind: 'chat' as const })),
      ...embeddingProfiles.map((profile) => ({ ...profile, kind: 'embedding' as const })),
    ];
    return models.sort(sortManagedModels);
  }, [chatProfiles, embeddingProfiles]);

  const editingModel = useMemo(
    () => allModels.find((item) => `${item.kind}:${item.id}` === editingKey) ?? null,
    [allModels, editingKey]
  );
  const snapshot = useMemo(
    () => (mode === 'edit' ? toForm(editingModel) : DEFAULT_PROFILE_FORM),
    [editingModel, mode]
  );
  const isDirty = !isFormEqual(profileForm, snapshot);

  const visibleModels = useMemo(() => {
    if (activeTab === 'all') {
      return allModels;
    }
    if (activeTab === 'chat') {
      return allModels.filter((item) => item.kind === 'chat');
    }
    if (activeTab === 'embedding') {
      return allModels.filter((item) => item.kind === 'embedding');
    }
    return [];
  }, [activeTab, allModels]);

  const loadData = useCallback(async () => {
    try {
      setState('loading');
      setPageError(null);
      const [nextEmbeddingProfiles, nextChatProfiles, nextKnowledgeBases] = await Promise.all([
        getJson<EmbeddingProfile[]>('/api/kb/embedding-profiles'),
        getJson<ChatModelProfile[]>('/api/kb/chat-model-profiles'),
        getJson<KnowledgeBase[]>('/api/kb/knowledge-bases'),
      ]);
      setEmbeddingProfiles(nextEmbeddingProfiles);
      setChatProfiles(nextChatProfiles);
      setKnowledgeBases(nextKnowledgeBases);
      setState('idle');
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : '加载模型配置失败');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!menuOpenKey) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-model-menu-root="true"]')) {
        return;
      }
      setMenuOpenKey(null);
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpenKey]);

  function resetEditor() {
    setMode('create');
    setEditingKey(null);
    setProfileForm(DEFAULT_PROFILE_FORM);
    setFormError(null);
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      resetEditor();
    }
  }

  function handleStartCreate() {
    setMode('create');
    setEditingKey(null);
    setProfileForm({
      ...DEFAULT_PROFILE_FORM,
      kind: getCreateKind(activeTab),
    });
    setFormError(null);
    setMenuOpenKey(null);
    setDialogOpen(true);
  }

  function handleStartEdit(model: ManagedModel) {
    setMode('edit');
    setEditingKey(`${model.kind}:${model.id}`);
    setProfileForm(toForm(model));
    setFormError(null);
    setMenuOpenKey(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!profileForm.name.trim()) {
      setFormError('模型名称不能为空');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      if (profileForm.kind === 'chat') {
        const payload = {
          name: profileForm.name.trim(),
          provider: 'openai_compatible',
          model: profileForm.model.trim(),
          base_url: profileForm.base_url.trim(),
          api_key: profileForm.api_key.trim(),
          is_default: false,
        };

        if (mode === 'create') {
          await sendJson<ChatModelProfile>('/api/kb/chat-model-profiles', 'POST', payload);
        } else if (editingModel?.kind === 'chat') {
          await sendJson<ChatModelProfile>(
            `/api/kb/chat-model-profiles/${editingModel.id}`,
            'PATCH',
            payload
          );
        }
      } else {
        const payload = {
          name: profileForm.name.trim(),
          provider: 'openai_compatible',
          model: profileForm.model.trim(),
          base_url: profileForm.base_url.trim(),
          api_key_env: profileForm.api_key_env.trim(),
        };

        if (mode === 'create') {
          await sendJson<EmbeddingProfile>('/api/kb/embedding-profiles', 'POST', payload);
        } else if (editingModel?.kind === 'embedding') {
          await sendJson<EmbeddingProfile>(
            `/api/kb/embedding-profiles/${editingModel.id}`,
            'PATCH',
            payload
          );
        }
      }

      await loadData();
      handleDialogChange(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : '保存模型失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(model: ManagedModel) {
    if (!window.confirm(`确认删除模型“${model.name}”吗？`)) {
      return;
    }

    try {
      const key = `${model.kind}:${model.id}`;
      setDeletingKey(key);
      setPageError(null);
      setMenuOpenKey(null);

      if (model.kind === 'chat') {
        await deleteJson(`/api/kb/chat-model-profiles/${model.id}`);
      } else {
        await deleteJson(`/api/kb/embedding-profiles/${model.id}`);
      }

      await loadData();
      if (editingKey === key) {
        handleDialogChange(false);
      }
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : '删除模型失败');
    } finally {
      setDeletingKey(null);
    }
  }

  async function handleSetDefault(model: ManagedChatModel) {
    try {
      const key = `${model.kind}:${model.id}`;
      setSettingDefaultKey(key);
      setPageError(null);
      setMenuOpenKey(null);
      await postJson(`/api/kb/chat-model-profiles/${model.id}/default`);
      await loadData();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : '设置默认对话模型失败');
    } finally {
      setSettingDefaultKey(null);
    }
  }

  const emptyTitle = (() => {
    if (activeTab === 'chat') return '还没有对话模型';
    if (activeTab === 'embedding') return '还没有 Embedding 模型';
    if (activeTab === 'all') return '还没有模型配置';
    return `暂无${MODEL_TABS.find((item) => item.id === activeTab)?.label ?? ''}模型`;
  })();

  const emptyDescription = (() => {
    if (activeTab === 'chat') {
      return '先添加一个默认对话模型，Agent 才能正常发起对话。';
    }
    if (activeTab === 'embedding') {
      return '先添加一个 Embedding 模型，之后就可以在知识库里选择具体使用哪一个。';
    }
    if (activeTab === 'all') {
      return '先添加对话模型或 Embedding 模型，统一在这里维护。';
    }
    return '这个分类当前还没有接入可管理的数据。';
  })();

  const canCreateModel = activeTab === 'all' || activeTab === 'chat' || activeTab === 'embedding';

  return (
    <>
      <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_28%),linear-gradient(180deg,_transparent,_rgba(15,23,42,0.03))] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">设置</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">配置中心</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-6 md:text-base">
              设置页按配置项拆分管理。当前先提供模型管理，后续可继续扩展更多全局配置。
            </p>
          </div>
        </div>

        {pageError ? (
          <Surface
            className="mb-6 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            variant="muted"
            radius="lg"
          >
            {pageError}
          </Surface>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <Surface variant="sidebar" padding="md" className="h-fit">
            <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">配置项</p>
            <div className="mt-4 space-y-3">
              {SETTINGS_NAV.map((item) => {
                const active = item.id === activeSection;
                return (
                  <InteractiveCard
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    variant={active ? 'selected' : 'default'}
                    radius="lg"
                    padding="md"
                    className="cursor-pointer"
                    onClick={() => setActiveSection(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setActiveSection(item.id);
                      }
                    }}
                  >
                    <p className="font-medium">{item.label}</p>
                    <p className="text-muted-foreground mt-2 text-sm leading-6">
                      {item.description}
                    </p>
                  </InteractiveCard>
                );
              })}
            </div>
          </Surface>

          <Surface padding="md">
            <div className="mb-6 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {canCreateModel ? (
                  <Button className="rounded-full" onClick={handleStartCreate}>
                    <Plus className="mr-2 size-4" />
                    添加模型
                  </Button>
                ) : null}
                <Button variant="outline" className="rounded-full" onClick={() => void loadData()}>
                  <RefreshCcw className="mr-2 size-4" />
                  刷新
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {MODEL_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;

                  return (
                    <Button
                      key={tab.id}
                      variant={active ? 'default' : 'outline'}
                      className="rounded-full"
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon className="size-4" />
                      {tab.label}
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] dark:bg-white/10">
                        {getTabCount(tab.id, chatProfiles, embeddingProfiles)}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {state === 'loading' ? <SettingsGhost lines={1} /> : null}

            {state !== 'loading' && visibleModels.length === 0 ? (
              <EmptyBlock
                title={emptyTitle}
                description={emptyDescription}
                action={
                  canCreateModel ? (
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={handleStartCreate}
                      >
                        <Plus className="mr-2 size-4" />
                        添加模型
                      </Button>
                    </div>
                  ) : null
                }
              />
            ) : null}

            {state !== 'loading' && visibleModels.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleModels.map((model) => {
                  const key = `${model.kind}:${model.id}`;
                  const deleting = deletingKey === key;
                  const settingDefault = settingDefaultKey === key;
                  const menuOpen = menuOpenKey === key;
                  const usageCount =
                    model.kind === 'embedding' ? (usageCountMap.get(model.id) ?? 0) : null;

                  return (
                    <InteractiveCard
                      key={key}
                      radius="lg"
                      padding="md"
                      className="relative min-h-[168px]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{model.name}</p>
                            <span
                              className={
                                model.kind === 'chat'
                                  ? 'rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300'
                                  : 'rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300'
                              }
                            >
                              {getKindLabel(model.kind)}
                            </span>
                            {model.kind === 'chat' && model.is_default ? (
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                默认
                              </span>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground mt-2 text-sm leading-6">
                            {model.model || '未配置模型 ID'}
                          </p>
                          <p className="text-muted-foreground mt-1 truncate text-sm leading-6">
                            {model.base_url || '未配置 Base URL'}
                          </p>
                        </div>

                        <div className="relative shrink-0" data-model-menu-root="true">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-full"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={() =>
                              setMenuOpenKey((current) => (current === key ? null : key))
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>

                          {menuOpen ? (
                            <Surface
                              variant="overlay"
                              radius="lg"
                              className="absolute top-10 right-0 z-20 w-40 p-1"
                            >
                              {model.kind === 'chat' && !model.is_default ? (
                                <button
                                  type="button"
                                  className="hover:bg-accent/80 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors"
                                  onClick={() => void handleSetDefault(model)}
                                  disabled={settingDefault}
                                >
                                  <Bot className="size-4" />
                                  {settingDefault ? '设置中...' : '设为默认'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="hover:bg-accent/80 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors"
                                onClick={() => handleStartEdit(model)}
                              >
                                <PencilLine className="size-4" />
                                编辑
                              </button>
                              <button
                                type="button"
                                className="hover:bg-accent/80 text-destructive flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors"
                                onClick={() => void handleDelete(model)}
                                disabled={deleting}
                              >
                                <Trash2 className="size-4" />
                                {deleting ? '删除中...' : '删除'}
                              </button>
                            </Surface>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-muted-foreground mt-4 flex items-center justify-between gap-3 text-xs">
                        <span>
                          {model.kind === 'chat'
                            ? model.is_default
                              ? '当前 Agent 默认模型'
                              : '可切换为默认对话模型'
                            : `被 ${usageCount} 个知识库使用`}
                        </span>
                        <span>{formatDate(model.updated_at)}</span>
                      </div>
                    </InteractiveCard>
                  );
                })}
              </div>
            ) : null}
          </Surface>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? '添加模型' : '编辑模型'}</DialogTitle>
            <DialogDescription>
              对话模型会被 Agent 直接使用；Embedding 模型由知识库按需绑定。
            </DialogDescription>
          </DialogHeader>

          {formError ? (
            <Surface
              className="px-4 py-3 text-sm text-red-700 dark:text-red-300"
              variant="muted"
              radius="lg"
            >
              {formError}
            </Surface>
          ) : null}

          <div className="grid gap-4">
            <LabeledField label="模型分类">
              {mode === 'create' ? (
                <Select
                  value={profileForm.kind}
                  onValueChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      kind: value as ProfileKind,
                    }))
                  }
                >
                  <SelectTrigger className="w-full rounded-2xl">
                    <SelectValue placeholder="选择模型分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">对话</SelectItem>
                    <SelectItem value="embedding">Embedding</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Surface
                  variant="muted"
                  radius="lg"
                  className="flex h-11 items-center px-3 text-sm font-medium"
                >
                  {getKindLabel(profileForm.kind)}
                </Surface>
              )}
            </LabeledField>

            <LabeledField label="模型名称">
              <Input
                value={profileForm.name}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="例如 GPT-5.4 主对话模型"
              />
            </LabeledField>

            <LabeledField label="模型 ID">
              <Input
                value={profileForm.model}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    model: event.target.value,
                  }))
                }
                placeholder={
                  profileForm.kind === 'chat' ? '例如 gpt-5.4' : '例如 text-embedding-3-large'
                }
              />
            </LabeledField>

            <LabeledField label="Base URL">
              <Input
                value={profileForm.base_url}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    base_url: event.target.value,
                  }))
                }
                placeholder="例如 https://api.openai.com/v1"
              />
            </LabeledField>

            {profileForm.kind === 'chat' ? (
              <LabeledField label="API Key">
                <Input
                  type="password"
                  value={profileForm.api_key}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      api_key: event.target.value,
                    }))
                  }
                  placeholder="输入对话模型的 API Key"
                />
              </LabeledField>
            ) : (
              <LabeledField label="API Key 环境变量">
                <Input
                  value={profileForm.api_key_env}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      api_key_env: event.target.value,
                    }))
                  }
                  placeholder="例如 OPENAI_API_KEY"
                />
              </LabeledField>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => handleDialogChange(false)}
            >
              取消
            </Button>
            <Button
              className="rounded-full"
              onClick={() => void handleSave()}
              disabled={saving || !isDirty}
            >
              {saving ? '保存中...' : mode === 'create' ? '创建模型' : '保存修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    <Surface className="border-dashed px-4 py-10 text-center" variant="muted" radius="lg">
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground mt-2 text-sm leading-6">{description}</p>
      {action}
    </Surface>
  );
}

function SettingsGhost({ lines }: { lines: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: lines }).map((_, index) => (
        <Surface key={index} className="h-[168px] animate-pulse" variant="muted" radius="lg" />
      ))}
    </div>
  );
}
