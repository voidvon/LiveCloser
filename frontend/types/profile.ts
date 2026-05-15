export type ChatModelProfile = {
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

export type SttModelProfile = {
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

export type TtsModelProfile = {
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

export type AgentProfile = {
  id: string;
  name: string;
  description: string;
  opening_message: string;
  idle_timeout_seconds: number;
  max_idle_reminders: number;
  idle_reminder_message: string;
  idle_goodbye_message: string;
  system_prompt: string;
  fallback_prompt: string;
  chat_model_profile_id: string | null;
  retrieval_top_k: number;
  knowledge_base_ids: string[];
  is_default: number;
  created_at: string;
  updated_at: string;
};

export type AgentProfileOption = Pick<AgentProfile, 'id' | 'name' | 'knowledge_base_ids'> & {
  is_default?: number;
};
