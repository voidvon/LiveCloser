export type ConversationRecord = {
  id: string;
  title: string;
  knowledge_base_id: string | null;
  last_mode: 'text' | 'voice';
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_preview: string;
};

export type ConversationMessageRecord = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string;
  source_mode: 'text' | 'voice';
  created_at: string;
};

export type KnowledgeBaseOption = {
  id: string;
  name: string;
};
