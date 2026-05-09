from __future__ import annotations

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS knowledge_bases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        embedding_provider TEXT NOT NULL DEFAULT 'openai_compatible',
        embedding_model TEXT NOT NULL DEFAULT '',
        embedding_base_url TEXT NOT NULL DEFAULT '',
        embedding_api_key_env TEXT NOT NULL DEFAULT '',
        chunk_size INTEGER NOT NULL DEFAULT 800,
        chunk_overlap INTEGER NOT NULL DEFAULT 120,
        retrieval_top_k INTEGER NOT NULL DEFAULT 5,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_categories (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES kb_categories(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_files (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        category_id TEXT,
        original_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        content_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'uploaded',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_embedded_at TEXT,
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES kb_categories(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_chunks (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        section_title TEXT NOT NULL DEFAULT '',
        content_preview TEXT NOT NULL DEFAULT '',
        chroma_doc_id TEXT NOT NULL DEFAULT '',
        category_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES kb_files(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES kb_categories(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS kb_jobs (
        id TEXT PRIMARY KEY,
        kb_id TEXT NOT NULL,
        file_id TEXT,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES kb_files(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_kb_bindings (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL UNIQUE,
        default_kb_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (default_kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '新会话',
        knowledge_base_id TEXT,
        last_mode TEXT NOT NULL DEFAULT 'text',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_message_at TEXT,
        last_message_preview TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        external_message_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        source_mode TEXT NOT NULL DEFAULT 'text',
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
        UNIQUE (conversation_id, external_message_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_kb_categories_kb_id ON kb_categories(kb_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_files_kb_id ON kb_files(kb_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_files_category_id ON kb_files(category_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_jobs_kb_id ON kb_jobs(kb_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_chunks_file_id ON kb_chunks(file_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at ON chat_conversations(last_message_at)",
    "CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id_created_at ON chat_messages(conversation_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_chat_messages_external_message_id ON chat_messages(external_message_id)",
]
