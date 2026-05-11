'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
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

type SttModelProfile = {
  id: string;
  name: string;
  provider: string;
  auth_mode: string;
  api_key: string;
  app_id: string;
  access_token: string;
  uid: string;
  resource_id: string;
  cluster: string;
  ws_url: string;
  language: string;
  is_default: number;
  created_at: string;
  updated_at: string;
};

type TtsModelProfile = {
  id: string;
  name: string;
  provider: string;
  auth_mode: string;
  api_key: string;
  app_id: string;
  access_token: string;
  uid: string;
  resource_id: string;
  cluster: string;
  http_url: string;
  voice_type: string;
  encoding: string;
  sample_rate: number;
  speed_ratio: number;
  volume_ratio: number;
  pitch_ratio: number;
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
type ProfileKind = 'chat' | 'embedding' | 'stt' | 'tts';
type VoiceAuthMode = 'api_key' | 'legacy';

type ManagedChatModel = ChatModelProfile & {
  kind: 'chat';
};

type ManagedEmbeddingProfile = EmbeddingProfile & {
  kind: 'embedding';
};

type ManagedSttModel = SttModelProfile & {
  kind: 'stt';
};

type ManagedTtsModel = TtsModelProfile & {
  kind: 'tts';
};

type ManagedModel = ManagedChatModel | ManagedEmbeddingProfile | ManagedSttModel | ManagedTtsModel;

type ProfileForm = {
  kind: ProfileKind;
  name: string;
  model: string;
  base_url: string;
  api_key: string;
  api_key_env: string;
  auth_mode: VoiceAuthMode;
  app_id: string;
  access_token: string;
  uid: string;
  resource_id: string;
  cluster: string;
  ws_url: string;
  language: string;
  http_url: string;
  voice_type: string;
  encoding: string;
  sample_rate: string;
  speed_ratio: string;
  volume_ratio: string;
  pitch_ratio: string;
};

const DEFAULT_PROFILE_FORM: ProfileForm = {
  kind: 'chat',
  name: '',
  model: '',
  base_url: '',
  api_key: '',
  api_key_env: '',
  auth_mode: 'api_key',
  app_id: '',
  access_token: '',
  uid: 'livekit-sales-user',
  resource_id: '',
  cluster: '',
  ws_url: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
  language: 'zh-CN',
  http_url: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
  voice_type: '',
  encoding: 'mp3',
  sample_rate: '24000',
  speed_ratio: '1.0',
  volume_ratio: '1.0',
  pitch_ratio: '1.0',
};

const SETTINGS_NAV: Array<{
  id: SettingsSection;
  label: string;
}> = [{ id: 'models', label: '模型管理' }];

const MODEL_TABS: Array<{
  id: ModelTab;
  label: string;
  icon: LucideIcon;
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
      ...DEFAULT_PROFILE_FORM,
      kind: 'chat',
      name: profile.name,
      model: profile.model,
      base_url: profile.base_url,
      api_key: profile.api_key,
    };
  }

  if (profile.kind === 'embedding') {
    return {
      ...DEFAULT_PROFILE_FORM,
      kind: 'embedding',
      name: profile.name,
      model: profile.model,
      base_url: profile.base_url,
      api_key_env: profile.api_key_env,
    };
  }

  if (profile.kind === 'stt') {
    return {
      ...DEFAULT_PROFILE_FORM,
      kind: 'stt',
      name: profile.name,
      auth_mode: (profile.auth_mode as VoiceAuthMode) || 'api_key',
      api_key: profile.api_key,
      app_id: profile.app_id,
      access_token: profile.access_token,
      uid: profile.uid,
      resource_id: profile.resource_id,
      cluster: profile.cluster,
      ws_url: profile.ws_url,
      language: profile.language,
    };
  }

  return {
    ...DEFAULT_PROFILE_FORM,
    kind: 'tts',
    name: profile.name,
    auth_mode: (profile.auth_mode as VoiceAuthMode) || 'api_key',
    api_key: profile.api_key,
    app_id: profile.app_id,
    access_token: profile.access_token,
    uid: profile.uid,
    resource_id: profile.resource_id,
    cluster: profile.cluster,
    http_url: profile.http_url,
    voice_type: profile.voice_type,
    encoding: profile.encoding,
    sample_rate: String(profile.sample_rate),
    speed_ratio: String(profile.speed_ratio),
    volume_ratio: String(profile.volume_ratio),
    pitch_ratio: String(profile.pitch_ratio),
  };
}

function isFormEqual(left: ProfileForm, right: ProfileForm) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getTabCount(
  tab: ModelTab,
  chatProfiles: ChatModelProfile[],
  embeddingProfiles: EmbeddingProfile[],
  sttProfiles: SttModelProfile[],
  ttsProfiles: TtsModelProfile[]
) {
  if (tab === 'all') {
    return chatProfiles.length + embeddingProfiles.length + sttProfiles.length + ttsProfiles.length;
  }
  if (tab === 'chat') return chatProfiles.length;
  if (tab === 'embedding') return embeddingProfiles.length;
  if (tab === 'stt') return sttProfiles.length;
  return ttsProfiles.length;
}

function getKindLabel(kind: ProfileKind) {
  if (kind === 'chat') return '对话';
  if (kind === 'embedding') return 'Embedding';
  if (kind === 'stt') return 'STT';
  return 'TTS';
}

function getCreateKind(activeTab: ModelTab): ProfileKind {
  if (activeTab === 'embedding') return 'embedding';
  if (activeTab === 'stt') return 'stt';
  if (activeTab === 'tts') return 'tts';
  return 'chat';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN');
}

function hasDefaultFlag(model: ManagedModel) {
  return model.kind !== 'embedding';
}

function isDefaultModel(model: ManagedModel) {
  return hasDefaultFlag(model) && Boolean(model.is_default);
}

function supportsDefault(kind: ProfileKind) {
  return kind !== 'embedding';
}

function sortManagedModels(left: ManagedModel, right: ManagedModel) {
  const leftDefault = isDefaultModel(left) ? 1 : 0;
  const rightDefault = isDefaultModel(right) ? 1 : 0;
  if (leftDefault !== rightDefault) {
    return rightDefault - leftDefault;
  }
  return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
}

function getRouteBase(kind: ProfileKind) {
  if (kind === 'chat') return '/api/kb/chat-model-profiles';
  if (kind === 'embedding') return '/api/kb/embedding-profiles';
  if (kind === 'stt') return '/api/kb/stt-model-profiles';
  return '/api/kb/tts-model-profiles';
}

function getDialogDescription(kind: ProfileKind) {
  if (kind === 'chat') return '维护 Agent 使用的全局对话模型。';
  if (kind === 'embedding') return '维护知识库可绑定的 Embedding 模型。';
  if (kind === 'stt') return '维护语音识别配置，默认项会用于语音输入。';
  return '维护语音播报配置，默认项会用于语音输出。';
}

function getModelHeadline(model: ManagedModel) {
  if (model.kind === 'chat' || model.kind === 'embedding') {
    return model.model || '未配置模型 ID';
  }
  if (model.kind === 'stt') {
    return model.resource_id || model.cluster || '未配置资源';
  }
  return model.voice_type || model.resource_id || model.cluster || '未配置音色';
}

function getModelSubline(model: ManagedModel) {
  if (model.kind === 'stt') {
    return model.ws_url || '未配置接入地址';
  }
  if (model.kind === 'tts') {
    return model.http_url || '未配置接入地址';
  }
  return model.base_url || '未配置 Base URL';
}

function getModelFootnote(model: ManagedModel, usageCountMap: Map<string, number>) {
  if (model.kind === 'embedding') {
    return `被 ${usageCountMap.get(model.id) ?? 0} 个知识库使用`;
  }
  if (isDefaultModel(model)) {
    return `当前默认${getKindLabel(model.kind)}模型`;
  }
  return `可切换为默认${getKindLabel(model.kind)}模型`;
}

function parseNumberField(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label}格式不正确`);
  }
  return parsed;
}

export function SettingsPageClient() {
  const [embeddingProfiles, setEmbeddingProfiles] = useState<EmbeddingProfile[]>([]);
  const [chatProfiles, setChatProfiles] = useState<ChatModelProfile[]>([]);
  const [sttProfiles, setSttProfiles] = useState<SttModelProfile[]>([]);
  const [ttsProfiles, setTtsProfiles] = useState<TtsModelProfile[]>([]);
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      ...sttProfiles.map((profile) => ({ ...profile, kind: 'stt' as const })),
      ...ttsProfiles.map((profile) => ({ ...profile, kind: 'tts' as const })),
    ];
    return models.sort(sortManagedModels);
  }, [chatProfiles, embeddingProfiles, sttProfiles, ttsProfiles]);

  const editingModel = useMemo(
    () => allModels.find((item) => `${item.kind}:${item.id}` === editingKey) ?? null,
    [allModels, editingKey]
  );

  const snapshot = useMemo(
    () =>
      mode === 'edit'
        ? toForm(editingModel)
        : profileForm.kind === 'chat'
          ? DEFAULT_PROFILE_FORM
          : { ...DEFAULT_PROFILE_FORM, kind: profileForm.kind },
    [editingModel, mode, profileForm.kind]
  );

  const isDirty = !isFormEqual(profileForm, snapshot);

  const visibleModels = useMemo(() => {
    if (activeTab === 'all') return allModels;
    return allModels.filter((item) => item.kind === activeTab);
  }, [activeTab, allModels]);

  const loadData = useCallback(async () => {
    try {
      setState('loading');
      setPageError(null);
      const [
        nextEmbeddingProfiles,
        nextChatProfiles,
        nextSttProfiles,
        nextTtsProfiles,
        nextKnowledgeBases,
      ] = await Promise.all([
        getJson<EmbeddingProfile[]>('/api/kb/embedding-profiles'),
        getJson<ChatModelProfile[]>('/api/kb/chat-model-profiles'),
        getJson<SttModelProfile[]>('/api/kb/stt-model-profiles'),
        getJson<TtsModelProfile[]>('/api/kb/tts-model-profiles'),
        getJson<KnowledgeBase[]>('/api/kb/knowledge-bases'),
      ]);
      setEmbeddingProfiles(nextEmbeddingProfiles);
      setChatProfiles(nextChatProfiles);
      setSttProfiles(nextSttProfiles);
      setTtsProfiles(nextTtsProfiles);
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
    setAdvancedOpen(false);
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      resetEditor();
    }
  }

  function handleStartCreate() {
    const kind = getCreateKind(activeTab);
    setMode('create');
    setEditingKey(null);
    setProfileForm({ ...DEFAULT_PROFILE_FORM, kind });
    setFormError(null);
    setMenuOpenKey(null);
    setAdvancedOpen(kind === 'tts');
    setDialogOpen(true);
  }

  function handleStartEdit(model: ManagedModel) {
    setMode('edit');
    setEditingKey(`${model.kind}:${model.id}`);
    setProfileForm(toForm(model));
    setFormError(null);
    setMenuOpenKey(null);
    setAdvancedOpen(model.kind === 'tts');
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
          await sendJson<ChatModelProfile>(getRouteBase('chat'), 'POST', payload);
        } else if (editingModel?.kind === 'chat') {
          await sendJson<ChatModelProfile>(
            `${getRouteBase('chat')}/${editingModel.id}`,
            'PATCH',
            payload
          );
        }
      } else if (profileForm.kind === 'embedding') {
        const payload = {
          name: profileForm.name.trim(),
          provider: 'openai_compatible',
          model: profileForm.model.trim(),
          base_url: profileForm.base_url.trim(),
          api_key_env: profileForm.api_key_env.trim(),
        };

        if (mode === 'create') {
          await sendJson<EmbeddingProfile>(getRouteBase('embedding'), 'POST', payload);
        } else if (editingModel?.kind === 'embedding') {
          await sendJson<EmbeddingProfile>(
            `${getRouteBase('embedding')}/${editingModel.id}`,
            'PATCH',
            payload
          );
        }
      } else if (profileForm.kind === 'stt') {
        if (!profileForm.resource_id.trim() && !profileForm.cluster.trim()) {
          throw new Error('STT 资源 ID 和 Cluster 至少填写一个');
        }
        if (profileForm.auth_mode === 'api_key' && !profileForm.api_key.trim()) {
          throw new Error('请输入 STT API Key');
        }
        if (
          profileForm.auth_mode === 'legacy' &&
          (!profileForm.app_id.trim() || !profileForm.access_token.trim())
        ) {
          throw new Error('请输入 STT 的 App ID 和 Access Token');
        }

        const payload = {
          name: profileForm.name.trim(),
          provider: 'doubao',
          auth_mode: profileForm.auth_mode,
          api_key: profileForm.auth_mode === 'api_key' ? profileForm.api_key.trim() : '',
          app_id: profileForm.auth_mode === 'legacy' ? profileForm.app_id.trim() : '',
          access_token: profileForm.auth_mode === 'legacy' ? profileForm.access_token.trim() : '',
          uid: profileForm.uid.trim() || 'livekit-sales-user',
          resource_id: profileForm.resource_id.trim(),
          cluster: profileForm.cluster.trim(),
          ws_url: profileForm.ws_url.trim(),
          language: profileForm.language.trim(),
          is_default: false,
        };

        if (mode === 'create') {
          await sendJson<SttModelProfile>(getRouteBase('stt'), 'POST', payload);
        } else if (editingModel?.kind === 'stt') {
          await sendJson<SttModelProfile>(
            `${getRouteBase('stt')}/${editingModel.id}`,
            'PATCH',
            payload
          );
        }
      } else {
        if (!profileForm.resource_id.trim() && !profileForm.cluster.trim()) {
          throw new Error('TTS 资源 ID 和 Cluster 至少填写一个');
        }
        if (!profileForm.voice_type.trim()) {
          throw new Error('请输入 TTS 音色');
        }
        if (profileForm.auth_mode === 'api_key' && !profileForm.api_key.trim()) {
          throw new Error('请输入 TTS API Key');
        }
        if (
          profileForm.auth_mode === 'legacy' &&
          (!profileForm.app_id.trim() || !profileForm.access_token.trim())
        ) {
          throw new Error('请输入 TTS 的 App ID 和 Access Token');
        }

        const payload = {
          name: profileForm.name.trim(),
          provider: 'doubao',
          auth_mode: profileForm.auth_mode,
          api_key: profileForm.auth_mode === 'api_key' ? profileForm.api_key.trim() : '',
          app_id: profileForm.auth_mode === 'legacy' ? profileForm.app_id.trim() : '',
          access_token: profileForm.auth_mode === 'legacy' ? profileForm.access_token.trim() : '',
          uid: profileForm.uid.trim() || 'livekit-sales-user',
          resource_id: profileForm.resource_id.trim(),
          cluster: profileForm.cluster.trim(),
          http_url: profileForm.http_url.trim(),
          voice_type: profileForm.voice_type.trim(),
          encoding: profileForm.encoding.trim() || 'mp3',
          sample_rate: parseNumberField(profileForm.sample_rate, '采样率'),
          speed_ratio: parseNumberField(profileForm.speed_ratio, '语速倍率'),
          volume_ratio: parseNumberField(profileForm.volume_ratio, '音量倍率'),
          pitch_ratio: parseNumberField(profileForm.pitch_ratio, '音高倍率'),
          is_default: false,
        };

        if (mode === 'create') {
          await sendJson<TtsModelProfile>(getRouteBase('tts'), 'POST', payload);
        } else if (editingModel?.kind === 'tts') {
          await sendJson<TtsModelProfile>(
            `${getRouteBase('tts')}/${editingModel.id}`,
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
      await deleteJson(`${getRouteBase(model.kind)}/${model.id}`);
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

  async function handleSetDefault(model: ManagedChatModel | ManagedSttModel | ManagedTtsModel) {
    try {
      const key = `${model.kind}:${model.id}`;
      setSettingDefaultKey(key);
      setPageError(null);
      setMenuOpenKey(null);
      await postJson(`${getRouteBase(model.kind)}/${model.id}/default`);
      await loadData();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : '设置默认模型失败');
    } finally {
      setSettingDefaultKey(null);
    }
  }

  const emptyTitle = (() => {
    if (activeTab === 'chat') return '还没有对话模型';
    if (activeTab === 'embedding') return '还没有 Embedding 模型';
    if (activeTab === 'stt') return '还没有 STT 模型';
    if (activeTab === 'tts') return '还没有 TTS 模型';
    return '还没有模型配置';
  })();

  const emptyDescription = (() => {
    if (activeTab === 'chat') return '先添加一个默认对话模型，Agent 才能正常发起对话。';
    if (activeTab === 'embedding') return '先添加一个 Embedding 模型，之后就可以在知识库里绑定。';
    if (activeTab === 'stt') return '先添加一个默认 STT 模型，语音输入才会启用。';
    if (activeTab === 'tts') return '先添加一个默认 TTS 模型，语音播报才会启用。';
    return '先添加模型配置，统一在这里管理。';
  })();

  return (
    <>
      <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.12),_transparent_28%),linear-gradient(180deg,_transparent,_rgba(15,23,42,0.03))] px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6">
          <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">设置</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">配置中心</h1>
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

        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
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
                  </InteractiveCard>
                );
              })}
            </div>
          </Surface>

          <Surface padding="md">
            <div className="mb-6 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button className="rounded-full" onClick={handleStartCreate}>
                  <Plus className="mr-2 size-4" />
                  添加模型
                </Button>
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
                        {getTabCount(
                          tab.id,
                          chatProfiles,
                          embeddingProfiles,
                          sttProfiles,
                          ttsProfiles
                        )}
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
                  <div className="mt-4">
                    <Button variant="outline" className="rounded-full" onClick={handleStartCreate}>
                      <Plus className="mr-2 size-4" />
                      添加模型
                    </Button>
                  </div>
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

                  return (
                    <InteractiveCard
                      key={key}
                      radius="lg"
                      padding="md"
                      className="relative min-h-[156px]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{model.name}</p>
                            <span
                              className={
                                model.kind === 'chat'
                                  ? 'rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300'
                                  : model.kind === 'embedding'
                                    ? 'rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300'
                                    : model.kind === 'stt'
                                      ? 'rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-700 dark:text-orange-300'
                                      : 'rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300'
                              }
                            >
                              {getKindLabel(model.kind)}
                            </span>
                            {isDefaultModel(model) ? (
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                默认
                              </span>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground mt-2 text-sm leading-6">
                            {getModelHeadline(model)}
                          </p>
                          <p className="text-muted-foreground mt-1 truncate text-sm leading-6">
                            {getModelSubline(model)}
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
                              {supportsDefault(model.kind) && !isDefaultModel(model) ? (
                                <button
                                  type="button"
                                  className="hover:bg-accent/80 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors"
                                  onClick={() =>
                                    void handleSetDefault(
                                      model as ManagedChatModel | ManagedSttModel | ManagedTtsModel
                                    )
                                  }
                                  disabled={settingDefault}
                                >
                                  <Settings2 className="size-4" />
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
                        <span>{getModelFootnote(model, usageCountMap)}</span>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? '添加模型' : '编辑模型'}</DialogTitle>
            <DialogDescription>{getDialogDescription(profileForm.kind)}</DialogDescription>
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
                  onValueChange={(value) => {
                    const kind = value as ProfileKind;
                    setProfileForm({
                      ...DEFAULT_PROFILE_FORM,
                      kind,
                    });
                    setAdvancedOpen(kind === 'tts');
                  }}
                >
                  <SelectTrigger className="w-full rounded-2xl">
                    <SelectValue placeholder="选择模型分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">对话</SelectItem>
                    <SelectItem value="embedding">Embedding</SelectItem>
                    <SelectItem value="stt">STT</SelectItem>
                    <SelectItem value="tts">TTS</SelectItem>
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
                placeholder="输入模型名称"
              />
            </LabeledField>

            {(profileForm.kind === 'chat' || profileForm.kind === 'embedding') && (
              <>
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
              </>
            )}

            {(profileForm.kind === 'stt' || profileForm.kind === 'tts') && (
              <>
                <LabeledField label="鉴权方式">
                  <Select
                    value={profileForm.auth_mode}
                    onValueChange={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        auth_mode: value as VoiceAuthMode,
                        api_key: value === 'api_key' ? current.api_key : '',
                        app_id: value === 'legacy' ? current.app_id : '',
                        access_token: value === 'legacy' ? current.access_token : '',
                      }))
                    }
                  >
                    <SelectTrigger className="w-full rounded-2xl">
                      <SelectValue placeholder="选择鉴权方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="legacy">Legacy</SelectItem>
                    </SelectContent>
                  </Select>
                </LabeledField>

                {profileForm.auth_mode === 'api_key' ? (
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
                      placeholder="输入豆包 API Key"
                    />
                  </LabeledField>
                ) : (
                  <>
                    <LabeledField label="App ID">
                      <Input
                        value={profileForm.app_id}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            app_id: event.target.value,
                          }))
                        }
                        placeholder="输入 Legacy App ID"
                      />
                    </LabeledField>

                    <LabeledField label="Access Token">
                      <Input
                        type="password"
                        value={profileForm.access_token}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            access_token: event.target.value,
                          }))
                        }
                        placeholder="输入 Legacy Access Token"
                      />
                    </LabeledField>
                  </>
                )}

                <LabeledField label="UID">
                  <Input
                    value={profileForm.uid}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        uid: event.target.value,
                      }))
                    }
                    placeholder="例如 livekit-sales-user"
                  />
                </LabeledField>

                <div className="grid gap-4 md:grid-cols-2">
                  <LabeledField label="资源 ID">
                    <Input
                      value={profileForm.resource_id}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          resource_id: event.target.value,
                        }))
                      }
                      placeholder="优先填写新控制台资源 ID"
                    />
                  </LabeledField>

                  <LabeledField label="Cluster">
                    <Input
                      value={profileForm.cluster}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          cluster: event.target.value,
                        }))
                      }
                      placeholder="旧控制台可填写 Cluster"
                    />
                  </LabeledField>
                </div>

                {profileForm.kind === 'stt' ? (
                  <>
                    <LabeledField label="WebSocket URL">
                      <Input
                        value={profileForm.ws_url}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            ws_url: event.target.value,
                          }))
                        }
                        placeholder="输入 STT WebSocket URL"
                      />
                    </LabeledField>

                    <LabeledField label="语言">
                      <Input
                        value={profileForm.language}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            language: event.target.value,
                          }))
                        }
                        placeholder="例如 zh-CN"
                      />
                    </LabeledField>
                  </>
                ) : (
                  <>
                    <LabeledField label="HTTP URL">
                      <Input
                        value={profileForm.http_url}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            http_url: event.target.value,
                          }))
                        }
                        placeholder="输入 TTS HTTP URL"
                      />
                    </LabeledField>

                    <LabeledField label="音色">
                      <Input
                        value={profileForm.voice_type}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            voice_type: event.target.value,
                          }))
                        }
                        placeholder="例如 zh_female_wenjingmaomao_uranus_bigtts"
                      />
                    </LabeledField>

                    <button
                      type="button"
                      className="border-border bg-background flex items-center justify-between rounded-2xl border px-4 py-3 text-left"
                      onClick={() => setAdvancedOpen((current) => !current)}
                    >
                      <span className="text-sm font-medium">高级参数</span>
                      {advancedOpen ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>

                    {advancedOpen ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <LabeledField label="编码">
                          <Input
                            value={profileForm.encoding}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                encoding: event.target.value,
                              }))
                            }
                            placeholder="例如 mp3"
                          />
                        </LabeledField>

                        <LabeledField label="采样率">
                          <Input
                            value={profileForm.sample_rate}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                sample_rate: event.target.value,
                              }))
                            }
                            placeholder="例如 24000"
                          />
                        </LabeledField>

                        <LabeledField label="语速倍率">
                          <Input
                            value={profileForm.speed_ratio}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                speed_ratio: event.target.value,
                              }))
                            }
                            placeholder="例如 1.0"
                          />
                        </LabeledField>

                        <LabeledField label="音量倍率">
                          <Input
                            value={profileForm.volume_ratio}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                volume_ratio: event.target.value,
                              }))
                            }
                            placeholder="例如 1.0"
                          />
                        </LabeledField>

                        <LabeledField label="音高倍率">
                          <Input
                            value={profileForm.pitch_ratio}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                pitch_ratio: event.target.value,
                              }))
                            }
                            placeholder="例如 1.0"
                          />
                        </LabeledField>
                      </div>
                    ) : null}
                  </>
                )}
              </>
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
        <Surface key={index} className="h-[156px] animate-pulse" variant="muted" radius="lg" />
      ))}
    </div>
  );
}
