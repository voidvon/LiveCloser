export type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  embedding_profile_id: string | null;
  embedding_provider: string;
  embedding_model: string;
  embedding_base_url: string;
  embedding_api_key_env: string;
  chunk_size: number;
  chunk_overlap: number;
  retrieval_top_k: number;
  created_at: string;
  updated_at: string;
};

export type KnowledgeBaseOption = {
  id: string;
  name: string;
};

export type EmbeddingProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  base_url: string;
  api_key_env: string;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  kb_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

export type KbFile = {
  id: string;
  kb_id: string;
  category_id: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
  updated_at: string;
  last_embedded_at: string | null;
};

export type KbJob = {
  id: string;
  kb_id: string;
  file_id: string | null;
  job_type: string;
  status: string;
  error_message: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
