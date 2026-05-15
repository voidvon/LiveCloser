'use client';

import type { RefObject } from 'react';
import { Check, MessageSquarePlus, Pencil, RefreshCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldSelect } from '@/components/ui/field-select';
import { InteractiveCard } from '@/components/ui/interactive-card';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/shadcn/utils';
import { getConversationStatusBadgeClass, getConversationStatusMeta } from './conversation-status';
import type { AgentProfileOption, ConversationRecord } from './types';

export function ConversationSidebar({
  mode,
  agentProfiles,
  activeAgentProfile,
  activeAgentProfileId,
  activeAgentKnowledgeBaseNames,
  visibleConversations,
  activeConversationId,
  loadingConversations,
  sessionActive,
  creatingConversation,
  savingConversationId,
  renamingConversationId,
  renameDraft,
  sidebarScrollContainerRef,
  onSidebarScroll,
  onRefresh,
  onCreateConversation,
  onActiveAgentProfileIdChange,
  onRenameDraftChange,
  onSelectConversation,
  onStartRename,
  onCancelRename,
  onSubmitRename,
  onDeleteConversation,
}: {
  mode: 'desktop' | 'mobile';
  agentProfiles: AgentProfileOption[];
  activeAgentProfile: AgentProfileOption | null;
  activeAgentProfileId: string | null;
  activeAgentKnowledgeBaseNames: string[];
  visibleConversations: ConversationRecord[];
  activeConversationId: string | null;
  loadingConversations: boolean;
  sessionActive: boolean;
  creatingConversation: boolean;
  savingConversationId: string | null;
  renamingConversationId: string | null;
  renameDraft: string;
  sidebarScrollContainerRef: RefObject<HTMLDivElement | null>;
  onSidebarScroll: (scrollTop: number) => void;
  onRefresh: () => void;
  onCreateConversation: () => void;
  onActiveAgentProfileIdChange: (agentProfileId: string | null) => void;
  onRenameDraftChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onStartRename: (conversation: ConversationRecord) => void;
  onCancelRename: () => void;
  onSubmitRename: (conversationId: string) => void;
  onDeleteConversation: (conversation: ConversationRecord) => void;
}) {
  return (
    <Surface
      className={cn(
        'flex w-full shrink-0 flex-col overflow-hidden',
        mode === 'desktop' ? 'hidden lg:flex lg:w-[320px]' : 'min-h-0 flex-1 lg:hidden'
      )}
      variant="sidebar"
    >
      <div className="border-border/70 flex items-center justify-between border-b px-4 py-4">
        <div>
          <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.22em] uppercase">
            会话列表
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">历史与继续对话</h2>
        </div>
        <div className="flex gap-2">
          <Button size="icon-sm" variant="outline" onClick={onRefresh} disabled={sessionActive}>
            <RefreshCcw className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            onClick={onCreateConversation}
            disabled={creatingConversation || sessionActive}
          >
            <MessageSquarePlus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="border-border/70 space-y-4 border-b px-4 py-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">当前会话智能体</span>
          <FieldSelect
            value={activeAgentProfileId ?? ''}
            onValueChange={(value) => onActiveAgentProfileIdChange(value || null)}
            disabled={sessionActive}
            placeholder="系统默认智能体"
            options={agentProfiles.map((profile) => ({
              value: profile.id,
              label: profile.name,
            }))}
          />
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            {activeAgentKnowledgeBaseNames.length > 0
              ? `当前智能体将使用：${activeAgentKnowledgeBaseNames.join('、')}`
              : '当前智能体未绑定知识库，知识库检索不可用。'}
          </p>
        </label>
      </div>

      <div
        ref={mode === 'desktop' ? sidebarScrollContainerRef : undefined}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onScroll={(event) => {
          if (mode !== 'desktop') {
            return;
          }
          onSidebarScroll(event.currentTarget.scrollTop);
        }}
      >
        <div className="space-y-2">
          {loadingConversations ? (
            <Surface
              className="text-muted-foreground border-dashed px-4 py-6 text-sm"
              variant="muted"
              radius="lg"
            >
              正在加载会话列表…
            </Surface>
          ) : visibleConversations.length === 0 ? (
            <Surface
              className="text-muted-foreground border-dashed px-4 py-6 text-sm leading-6"
              variant="muted"
              radius="lg"
            >
              {activeAgentProfile
                ? `当前智能体“${activeAgentProfile.name}”下还没有历史会话。先新建一个会话，再开始对话。`
                : '还没有历史会话。先新建一个会话，再选择消息或语音方式开始。'}
            </Surface>
          ) : (
            visibleConversations.map((conversation) => {
              const statusMeta = getConversationStatusMeta(conversation);
              return renamingConversationId === conversation.id ? (
                <InteractiveCard
                  key={conversation.id}
                  variant={activeConversationId === conversation.id ? 'selected' : 'default'}
                >
                  <div className="space-y-3">
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(event) => onRenameDraftChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          onSubmitRename(conversation.id);
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          onCancelRename();
                        }
                      }}
                      className={cn(
                        'bg-background/70 w-full rounded-xl border px-3 py-2 text-sm outline-none',
                        activeConversationId === conversation.id
                          ? 'border-primary/30 text-foreground'
                          : 'border-border/60'
                      )}
                      placeholder="输入会话名称"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCancelRename();
                        }}
                        disabled={savingConversationId === conversation.id}
                      >
                        <X className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSubmitRename(conversation.id);
                        }}
                        disabled={savingConversationId === conversation.id}
                      >
                        <Check className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </InteractiveCard>
              ) : (
                <InteractiveCard
                  key={conversation.id}
                  onClick={() => onSelectConversation(conversation.id)}
                  role="button"
                  tabIndex={sessionActive ? -1 : 0}
                  aria-disabled={sessionActive}
                  onKeyDown={(event) => {
                    if (sessionActive) {
                      return;
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectConversation(conversation.id);
                    }
                  }}
                  variant={activeConversationId === conversation.id ? 'selected' : 'default'}
                  className={cn('cursor-pointer', sessionActive && 'cursor-not-allowed opacity-60')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{conversation.title}</p>
                      <p
                        className={cn(
                          'mt-2 line-clamp-2 text-xs leading-5',
                          activeConversationId === conversation.id
                            ? 'text-foreground/75'
                            : 'text-muted-foreground'
                        )}
                      >
                        {conversation.last_message_preview || '还没有消息'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      {statusMeta ? (
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.08em]',
                            getConversationStatusBadgeClass(statusMeta.tone)
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      ) : null}
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="rounded-full"
                          aria-label={`重命名 ${conversation.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onStartRename(conversation);
                          }}
                          disabled={sessionActive}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20 rounded-full"
                          aria-label={`删除 ${conversation.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteConversation(conversation);
                          }}
                          disabled={sessionActive || savingConversationId === conversation.id}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </InteractiveCard>
              );
            })
          )}
        </div>
      </div>
    </Surface>
  );
}
