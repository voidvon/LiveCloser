import type { ConversationRecord } from '@/types';

export function getConversationStatusMeta(conversation: ConversationRecord): {
  label: string;
  tone: 'muted' | 'warning' | 'danger';
  detail: string;
} | null {
  if (conversation.status !== 'ended') {
    return null;
  }

  if (conversation.end_reason === 'away_timeout') {
    return {
      label: '无人应答结束',
      tone: 'warning',
      detail: '对方长时间未回应，系统已自动收尾结束本次通话。',
    };
  }
  if (conversation.end_reason === 'user_disconnect') {
    return {
      label: '用户已断开',
      tone: 'muted',
      detail: '对方已主动断开当前会话。',
    };
  }
  if (conversation.end_reason === 'session_error') {
    return {
      label: '会话异常结束',
      tone: 'danger',
      detail: conversation.end_detail || '会话因为底层异常中断。',
    };
  }
  if (conversation.end_reason === 'completed') {
    return {
      label: '会话已结束',
      tone: 'muted',
      detail: '本次会话已正常结束。',
    };
  }

  return {
    label: '已结束',
    tone: 'muted',
    detail: conversation.end_detail || conversation.end_reason || '本次会话已结束。',
  };
}

export function getConversationStatusBadgeClass(tone: 'muted' | 'warning' | 'danger'): string {
  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200';
  }
  if (tone === 'danger') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200';
  }
  return 'border-border/70 bg-background/70 text-muted-foreground';
}
