'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Pencil, Plus, RefreshCcw, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldSelect } from '@/components/ui/field-select';
import { Input } from '@/components/ui/input';
import { InteractiveCard } from '@/components/ui/interactive-card';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { deleteJson, getJson, patchJson, postJson } from '@/lib/api';
import { cn } from '@/lib/shadcn/utils';
import type { AgentProfile, ChatModelProfile, KnowledgeBase } from '@/types';

type AgentProfileForm = {
  name: string;
  description: string;
  opening_message: string;
  idle_timeout_seconds: string;
  max_idle_reminders: string;
  idle_reminder_message: string;
  idle_goodbye_message: string;
  system_prompt: string;
  fallback_prompt: string;
  chat_model_profile_id: string;
  retrieval_top_k: string;
  knowledge_base_ids: string[];
};

type AgentEditorSection = 'general' | 'model' | 'voice' | 'idle' | 'prompt';

const DEFAULT_FORM: AgentProfileForm = {
  name: '',
  description: '',
  opening_message:
    '你好，我是你的 AI 销售助理。我可以介绍产品、套餐、标准价格和购买流程。你可以直接问我具体需求。',
  idle_timeout_seconds: '10',
  max_idle_reminders: '1',
  idle_reminder_message: '喂，您还在吗？如果现在方便，我可以先简单了解一下您的需求。',
  idle_goodbye_message: '看起来您现在可能不太方便，我先不打扰您了。您方便的时候，我们再继续聊。',
  system_prompt: '',
  fallback_prompt: '',
  chat_model_profile_id: '',
  retrieval_top_k: '5',
  knowledge_base_ids: [],
};

const EDITOR_SECTIONS: Array<{
  id: AgentEditorSection;
  label: string;
  description: string;
}> = [
  {
    id: 'general',
    label: '基本信息',
    description: '名称、描述和这个智能体负责的场景。',
  },
  {
    id: 'model',
    label: '模型与检索',
    description: '绑定专属模型，限制召回数量和知识库范围。',
  },
  {
    id: 'voice',
    label: '语音开场',
    description: '控制电话接通后的第一句自动话术。',
  },
  {
    id: 'idle',
    label: '无人应答',
    description: '超时、提醒和结束话术统一在这里设置。',
  },
  {
    id: 'prompt',
    label: '提示词',
    description: '角色约束、兜底策略和知识缺失时的处理方式。',
  },
];

export function AgentPageClient() {
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [chatModels, setChatModels] = useState<ChatModelProfile[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AgentProfileForm>(DEFAULT_FORM);
  const [activeSection, setActiveSection] = useState<AgentEditorSection>('general');

  useEffect(() => {
    void loadData();
  }, []);

  const editingProfile = useMemo(
    () => agentProfiles.find((item) => item.id === editingProfileId) ?? null,
    [agentProfiles, editingProfileId]
  );
  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [agentData, chatModelData, kbData] = await Promise.all([
        getJson<AgentProfile[]>('/api/kb/agent-profiles'),
        getJson<ChatModelProfile[]>('/api/kb/chat-model-profiles'),
        getJson<KnowledgeBase[]>('/api/kb/knowledge-bases'),
      ]);
      setAgentProfiles(agentData);
      setChatModels(chatModelData);
      setKnowledgeBases(kbData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载智能体列表失败');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingProfileId(null);
    setActiveSection('general');
    setForm({
      ...DEFAULT_FORM,
      chat_model_profile_id: chatModels[0]?.id ?? '',
    });
    setDialogOpen(true);
  }

  function openEditDialog(profile: AgentProfile) {
    setEditingProfileId(profile.id);
    setActiveSection('general');
    setForm({
      name: profile.name,
      description: profile.description,
      opening_message: profile.opening_message,
      idle_timeout_seconds: String(profile.idle_timeout_seconds),
      max_idle_reminders: String(profile.max_idle_reminders),
      idle_reminder_message: profile.idle_reminder_message,
      idle_goodbye_message: profile.idle_goodbye_message,
      system_prompt: profile.system_prompt,
      fallback_prompt: profile.fallback_prompt,
      chat_model_profile_id: profile.chat_model_profile_id ?? '',
      retrieval_top_k: String(profile.retrieval_top_k),
      knowledge_base_ids: profile.knowledge_base_ids,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingProfileId(null);
    setActiveSection('general');
    setForm(DEFAULT_FORM);
  }

  function toggleKnowledgeBase(kbId: string) {
    setForm((current) => {
      const exists = current.knowledge_base_ids.includes(kbId);
      return {
        ...current,
        knowledge_base_ids: exists
          ? current.knowledge_base_ids.filter((item) => item !== kbId)
          : [...current.knowledge_base_ids, kbId],
      };
    });
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('智能体名称不能为空');
      return;
    }
    const retrievalTopK = Number(form.retrieval_top_k);
    if (!Number.isFinite(retrievalTopK) || retrievalTopK <= 0) {
      setError('向量数据库召回数量必须大于 0');
      return;
    }
    const idleTimeoutSeconds = Number(form.idle_timeout_seconds);
    if (!Number.isFinite(idleTimeoutSeconds) || idleTimeoutSeconds < 0) {
      setError('无人应答超时时间不能小于 0');
      return;
    }
    const maxIdleReminders = Number(form.max_idle_reminders);
    if (!Number.isInteger(maxIdleReminders) || maxIdleReminders < 0) {
      setError('无人应答提醒次数必须是大于等于 0 的整数');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        opening_message: form.opening_message.trim(),
        idle_timeout_seconds: idleTimeoutSeconds,
        max_idle_reminders: maxIdleReminders,
        idle_reminder_message: form.idle_reminder_message.trim(),
        idle_goodbye_message: form.idle_goodbye_message.trim(),
        system_prompt: form.system_prompt.trim(),
        fallback_prompt: form.fallback_prompt.trim(),
        chat_model_profile_id: form.chat_model_profile_id || null,
        retrieval_top_k: retrievalTopK,
        knowledge_base_ids: form.knowledge_base_ids,
        is_default: editingProfile?.is_default ? true : false,
      };
      if (editingProfileId) {
        await patchJson(`/api/kb/agent-profiles/${editingProfileId}`, payload);
      } else {
        await postJson('/api/kb/agent-profiles', payload);
      }
      closeDialog();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存智能体失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(profile: AgentProfile) {
    if (!window.confirm(`确认删除智能体“${profile.name}”吗？删除后不可恢复。`)) {
      return;
    }
    try {
      setDeletingId(profile.id);
      setError(null);
      await deleteJson(`/api/kb/agent-profiles/${profile.id}`);
      setAgentProfiles((current) => current.filter((item) => item.id !== profile.id));
      if (editingProfileId === profile.id) {
        closeDialog();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除智能体失败');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_26%),linear-gradient(180deg,_transparent,_rgba(15,23,42,0.03))]">
      <div className="px-4 py-6 md:px-8 md:py-8">
        {error ? (
          <Surface
            className="mb-6 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            variant="muted"
            radius="lg"
          >
            {error}
          </Surface>
        ) : null}

        <div className="mb-6 space-y-4">
          <div>
            <p className="font-mono text-[11px] font-bold tracking-[0.24em] uppercase">智能体</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">智能体列表</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-6 md:text-base">
              在这里维护系统提示词、兜底提示词、专属模型，以及智能体允许检索的知识库范围。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={openCreateDialog}
              aria-label="新增智能体"
            >
              <Plus className="size-4" />
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => void loadData()}>
              <RefreshCcw className="mr-2 size-4" />
              刷新
            </Button>
          </div>
        </div>

        {loading ? <AgentGhost /> : null}
        {!loading && agentProfiles.length === 0 ? (
          <Surface className="border-dashed px-4 py-8 text-center" variant="muted" radius="lg">
            <p className="font-medium">还没有智能体</p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              点击左上角的 + 创建第一个智能体，开始拆分不同话术、模型和知识库策略。
            </p>
          </Surface>
        ) : null}
        {!loading && agentProfiles.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {agentProfiles.map((profile) => {
              const model =
                chatModels.find((item) => item.id === profile.chat_model_profile_id) ?? null;

              return (
                <InteractiveCard key={profile.id} radius="lg" padding="lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-lg font-medium">{profile.name}</p>
                        {profile.is_default ? (
                          <span className="border-primary/18 bg-primary/10 rounded-full border px-2.5 py-1 text-[11px] tracking-[0.18em] uppercase">
                            默认
                          </span>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground mt-2 text-sm leading-6">
                        {profile.description || '暂无描述。'}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="rounded-full"
                        onClick={() => openEditDialog(profile)}
                        aria-label={`编辑 ${profile.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="rounded-full text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300"
                        onClick={() => void handleDelete(profile)}
                        disabled={deletingId === profile.id}
                        aria-label={`删除 ${profile.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] tracking-[0.2em] uppercase">
                    <span className="border-primary/18 bg-primary/10 rounded-full border px-3 py-1">
                      {model?.name || '全局默认模型'}
                    </span>
                    <span className="border-border/70 rounded-full border px-3 py-1">
                      召回 {profile.retrieval_top_k}
                    </span>
                    <span className="border-border/70 rounded-full border px-3 py-1">
                      知识库 {profile.knowledge_base_ids.length}
                    </span>
                  </div>
                </InteractiveCard>
              );
            })}
          </div>
        ) : null}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setDialogOpen(true);
            return;
          }
          closeDialog();
        }}
      >
        <DialogContent className="h-[min(90vh,720px)] max-h-[90vh] max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingProfileId ? '编辑智能体' : '新增智能体'}</DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
            <Surface
              className="hidden h-fit p-2 lg:block lg:h-full lg:overflow-y-auto"
              variant="muted"
              radius="lg"
            >
              <div className="mb-2 px-2 pt-2">
                <p className="text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
                  配置分类
                </p>
              </div>
              <nav className="grid gap-1" aria-label="智能体配置分类">
                {EDITOR_SECTIONS.map((section) => {
                  const active = section.id === activeSection;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                        active
                          ? 'border-primary/30 bg-primary/10 text-foreground shadow-sm'
                          : 'text-muted-foreground hover:border-border/70 hover:bg-background/70 hover:text-foreground border-transparent'
                      )}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </nav>
            </Surface>

            <div className="flex min-h-0 flex-col gap-4">
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 lg:hidden">
                {EDITOR_SECTIONS.map((section) => {
                  const active = section.id === activeSection;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                        active
                          ? 'border-primary/30 bg-primary/10 text-foreground'
                          : 'text-muted-foreground border-border/70 bg-background/70'
                      )}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </div>
              <Surface className="min-h-0 overflow-y-auto px-5 py-5" radius="lg">
                {activeSection === 'general' ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">智能体名称</span>
                      <Input
                        value={form.name}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="例如：售前顾问、续费顾问、渠道助手"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">智能体描述</span>
                      <Textarea
                        value={form.description}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, description: event.target.value }))
                        }
                        placeholder="描述这个智能体负责什么场景、采用什么话术。"
                        className="min-h-28"
                      />
                    </label>
                  </div>
                ) : null}

                {activeSection === 'model' ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium">智能体模型</span>
                        <FieldSelect
                          value={form.chat_model_profile_id}
                          onValueChange={(value) =>
                            setForm((current) => ({ ...current, chat_model_profile_id: value }))
                          }
                          placeholder={
                            chatModels.length === 0
                              ? '请先到 /settings 添加模型'
                              : '使用全局默认模型'
                          }
                          options={chatModels.map((model) => ({
                            value: model.id,
                            label: `${model.name}${model.model ? ` · ${model.model}` : ''}`,
                          }))}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium">向量数据库召回数量</span>
                        <Input
                          type="number"
                          min={1}
                          value={form.retrieval_top_k}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              retrieval_top_k: event.target.value,
                            }))
                          }
                          placeholder="5"
                        />
                      </label>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">可检索知识库</span>
                        <span className="text-muted-foreground text-xs">
                          已选择 {form.knowledge_base_ids.length} 个
                        </span>
                      </div>
                      {knowledgeBases.length === 0 ? (
                        <Surface className="px-4 py-3 text-sm" variant="muted" radius="lg">
                          还没有知识库。先去 <span className="font-mono">/kb</span>{' '}
                          创建资料库，再回来限制智能体检索范围。
                        </Surface>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {knowledgeBases.map((kb) => {
                            const selected = form.knowledge_base_ids.includes(kb.id);
                            return (
                              <button
                                key={kb.id}
                                type="button"
                                onClick={() => toggleKnowledgeBase(kb.id)}
                                className={
                                  selected
                                    ? 'border-primary/30 bg-primary/12 rounded-full border px-3 py-1.5 text-sm transition-colors'
                                    : 'border-border/70 hover:border-primary/20 rounded-full border px-3 py-1.5 text-sm transition-colors'
                                }
                              >
                                {kb.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {activeSection === 'voice' ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium">语音开场白</span>
                    <Textarea
                      value={form.opening_message}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, opening_message: event.target.value }))
                      }
                      placeholder="语音会话刚开始时自动播报的欢迎语。留空则不自动开场。"
                      className="min-h-32"
                    />
                  </label>
                ) : null}

                {activeSection === 'idle' ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium">无人应答超时（秒）</span>
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          value={form.idle_timeout_seconds}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              idle_timeout_seconds: event.target.value,
                            }))
                          }
                          placeholder="10"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-medium">无人应答提醒次数</span>
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          value={form.max_idle_reminders}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              max_idle_reminders: event.target.value,
                            }))
                          }
                          placeholder="1"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">无人应答提醒话术</span>
                      <Textarea
                        value={form.idle_reminder_message}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            idle_reminder_message: event.target.value,
                          }))
                        }
                        placeholder="第一次长时间没说话时的提醒文案。留空则静音时不提醒，直接按次数规则继续等待。"
                        className="min-h-28"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">无人应答结束话术</span>
                      <Textarea
                        value={form.idle_goodbye_message}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            idle_goodbye_message: event.target.value,
                          }))
                        }
                        placeholder="超过提醒次数后，结束会话前播报的礼貌收尾文案。留空则直接结束。"
                        className="min-h-28"
                      />
                    </label>
                  </div>
                ) : null}

                {activeSection === 'prompt' ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">系统提示词</span>
                      <Textarea
                        value={form.system_prompt}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, system_prompt: event.target.value }))
                        }
                        placeholder="定义这个智能体的角色、语气、流程约束和销售策略。留空则走系统默认提示词。"
                        className="min-h-48"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-medium">兜底提示词</span>
                      <Textarea
                        value={form.fallback_prompt}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            fallback_prompt: event.target.value,
                          }))
                        }
                        placeholder="当知识库没有找到答案时，引导模型如何安全回复、如何转人工、如何让用户补充信息。"
                        className="min-h-36"
                      />
                    </label>
                  </div>
                ) : null}
              </Surface>

              <DialogFooter className="items-center justify-between sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                  {activeSection === 'model' ? (
                    <>
                      <Button asChild variant="outline" className="rounded-full">
                        <Link href="/settings">
                          <Settings2 className="mr-2 size-4" />
                          管理模型
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="rounded-full">
                        <Link href="/kb">
                          <BookOpen className="mr-2 size-4" />
                          管理知识库
                        </Link>
                      </Button>
                    </>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={closeDialog}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full"
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? '保存中...' : editingProfileId ? '保存修改' : '创建智能体'}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgentGhost() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <Surface key={index} className="animate-pulse px-5 py-4" variant="muted" radius="lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="bg-foreground/8 h-6 w-1/2 rounded-full" />
              <div className="mt-3 space-y-2">
                <div className="bg-foreground/7 h-4 w-full rounded-full" />
                <div className="bg-foreground/7 h-4 w-4/5 rounded-full" />
              </div>
            </div>
            <div className="bg-foreground/8 h-8 w-16 rounded-full" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="bg-foreground/8 h-6 w-24 rounded-full" />
            <div className="bg-foreground/8 h-6 w-20 rounded-full" />
          </div>
        </Surface>
      ))}
    </div>
  );
}
