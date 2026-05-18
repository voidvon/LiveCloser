from __future__ import annotations

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS chat_model_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'openai_compatible',
        model TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        api_key TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        opening_message TEXT NOT NULL DEFAULT '',
        idle_timeout_seconds REAL NOT NULL DEFAULT 10.0,
        max_idle_reminders INTEGER NOT NULL DEFAULT 1,
        idle_reminder_message TEXT NOT NULL DEFAULT '',
        idle_goodbye_message TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        fallback_prompt TEXT NOT NULL DEFAULT '',
        chat_model_profile_id TEXT,
        retrieval_top_k INTEGER NOT NULL DEFAULT 5,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (chat_model_profile_id) REFERENCES chat_model_profiles(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS agent_profile_kb_bindings (
        id TEXT PRIMARY KEY,
        agent_profile_id TEXT NOT NULL,
        kb_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
        UNIQUE (agent_profile_id, kb_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS embedding_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'openai_compatible',
        model TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        api_key_env TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        brand TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        sku TEXT NOT NULL DEFAULT '',
        aliases TEXT NOT NULL DEFAULT '',
        price TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'CNY',
        status TEXT NOT NULL DEFAULT 'active',
        summary TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        attributes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS product_spec_dimensions (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        key TEXT NOT NULL,
        label TEXT NOT NULL,
        value_type TEXT NOT NULL DEFAULT 'enum',
        unit TEXT NOT NULL DEFAULT '',
        is_required INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE (product_id, key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS product_spec_dimension_options (
        id TEXT PRIMARY KEY,
        dimension_id TEXT NOT NULL,
        option_key TEXT NOT NULL,
        option_label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (dimension_id) REFERENCES product_spec_dimensions(id) ON DELETE CASCADE,
        UNIQUE (dimension_id, option_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        variant_name TEXT NOT NULL DEFAULT '',
        spec_signature TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        barcode TEXT NOT NULL DEFAULT '',
        weight REAL,
        lead_time_days INTEGER,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE (sku),
        UNIQUE (product_id, spec_signature)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS product_variant_spec_values (
        id TEXT PRIMARY KEY,
        variant_id TEXT NOT NULL,
        dimension_id TEXT NOT NULL,
        option_id TEXT,
        value_text TEXT NOT NULL DEFAULT '',
        value_number REAL,
        value_display TEXT NOT NULL DEFAULT '',
        sort_value REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
        FOREIGN KEY (dimension_id) REFERENCES product_spec_dimensions(id) ON DELETE CASCADE,
        FOREIGN KEY (option_id) REFERENCES product_spec_dimension_options(id) ON DELETE SET NULL,
        UNIQUE (variant_id, dimension_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS price_books (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CNY',
        audience_type TEXT NOT NULL DEFAULT 'retail',
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (code)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS product_variant_prices (
        id TEXT PRIMARY KEY,
        variant_id TEXT NOT NULL,
        price_book_id TEXT NOT NULL,
        pricing_mode TEXT NOT NULL DEFAULT 'fixed',
        amount_minor INTEGER,
        min_amount_minor INTEGER,
        max_amount_minor INTEGER,
        min_qty INTEGER NOT NULL DEFAULT 1,
        effective_from TEXT,
        effective_to TEXT,
        tax_included INTEGER NOT NULL DEFAULT 1,
        remarks TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
        FOREIGN KEY (price_book_id) REFERENCES price_books(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS stt_model_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'doubao',
        auth_mode TEXT NOT NULL DEFAULT 'api_key',
        api_key TEXT NOT NULL DEFAULT '',
        app_id TEXT NOT NULL DEFAULT '',
        access_token TEXT NOT NULL DEFAULT '',
        uid TEXT NOT NULL DEFAULT 'livekit-sales-user',
        resource_id TEXT NOT NULL DEFAULT '',
        cluster TEXT NOT NULL DEFAULT '',
        ws_url TEXT NOT NULL DEFAULT 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
        language TEXT NOT NULL DEFAULT 'zh-CN',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tts_model_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'doubao',
        auth_mode TEXT NOT NULL DEFAULT 'api_key',
        api_key TEXT NOT NULL DEFAULT '',
        app_id TEXT NOT NULL DEFAULT '',
        access_token TEXT NOT NULL DEFAULT '',
        uid TEXT NOT NULL DEFAULT 'livekit-sales-user',
        resource_id TEXT NOT NULL DEFAULT '',
        cluster TEXT NOT NULL DEFAULT '',
        http_url TEXT NOT NULL DEFAULT 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
        voice_type TEXT NOT NULL DEFAULT '',
        encoding TEXT NOT NULL DEFAULT 'mp3',
        sample_rate INTEGER NOT NULL DEFAULT 24000,
        speed_ratio REAL NOT NULL DEFAULT 1.0,
        volume_ratio REAL NOT NULL DEFAULT 1.0,
        pitch_ratio REAL NOT NULL DEFAULT 1.0,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS knowledge_bases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        embedding_profile_id TEXT,
        embedding_provider TEXT NOT NULL DEFAULT 'openai_compatible',
        embedding_model TEXT NOT NULL DEFAULT '',
        embedding_base_url TEXT NOT NULL DEFAULT '',
        embedding_api_key_env TEXT NOT NULL DEFAULT '',
        chunk_size INTEGER NOT NULL DEFAULT 800,
        chunk_overlap INTEGER NOT NULL DEFAULT 120,
        retrieval_top_k INTEGER NOT NULL DEFAULT 5,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (embedding_profile_id) REFERENCES embedding_profiles(id) ON DELETE SET NULL
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
        agent_profile_id TEXT,
        last_mode TEXT NOT NULL DEFAULT 'text',
        status TEXT NOT NULL DEFAULT 'active',
        ended_at TEXT,
        end_reason TEXT NOT NULL DEFAULT '',
        end_detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_message_at TEXT,
        last_message_preview TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE SET NULL,
        FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id) ON DELETE SET NULL
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
    "CREATE INDEX IF NOT EXISTS idx_chat_model_profiles_updated_at ON chat_model_profiles(updated_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_model_profiles_single_default ON chat_model_profiles(is_default) WHERE is_default = 1",
    "CREATE INDEX IF NOT EXISTS idx_agent_profiles_updated_at ON agent_profiles(updated_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_profiles_single_default ON agent_profiles(is_default) WHERE is_default = 1",
    "CREATE INDEX IF NOT EXISTS idx_agent_profile_kb_bindings_agent_profile_id ON agent_profile_kb_bindings(agent_profile_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_profile_kb_bindings_kb_id ON agent_profile_kb_bindings(kb_id)",
    "CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)",
    "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)",
    "CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)",
    "CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)",
    "CREATE INDEX IF NOT EXISTS idx_products_status ON products(status)",
    "CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at)",
    "CREATE INDEX IF NOT EXISTS idx_product_spec_dimensions_product_id ON product_spec_dimensions(product_id)",
    "CREATE INDEX IF NOT EXISTS idx_product_spec_dimension_options_dimension_id ON product_spec_dimension_options(dimension_id)",
    "CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id)",
    "CREATE INDEX IF NOT EXISTS idx_product_variants_status ON product_variants(status)",
    "CREATE INDEX IF NOT EXISTS idx_product_variant_spec_values_variant_id ON product_variant_spec_values(variant_id)",
    "CREATE INDEX IF NOT EXISTS idx_product_variant_spec_values_dimension_id ON product_variant_spec_values(dimension_id)",
    "CREATE INDEX IF NOT EXISTS idx_price_books_status_priority ON price_books(status, priority)",
    "CREATE INDEX IF NOT EXISTS idx_product_variant_prices_variant_id ON product_variant_prices(variant_id)",
    "CREATE INDEX IF NOT EXISTS idx_product_variant_prices_price_book_id ON product_variant_prices(price_book_id)",
    "CREATE INDEX IF NOT EXISTS idx_stt_model_profiles_updated_at ON stt_model_profiles(updated_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_stt_model_profiles_single_default ON stt_model_profiles(is_default) WHERE is_default = 1",
    "CREATE INDEX IF NOT EXISTS idx_tts_model_profiles_updated_at ON tts_model_profiles(updated_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_tts_model_profiles_single_default ON tts_model_profiles(is_default) WHERE is_default = 1",
    "CREATE INDEX IF NOT EXISTS idx_kb_categories_kb_id ON kb_categories(kb_id)",
    "CREATE INDEX IF NOT EXISTS idx_embedding_profiles_updated_at ON embedding_profiles(updated_at)",
    "CREATE INDEX IF NOT EXISTS idx_kb_files_kb_id ON kb_files(kb_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_files_category_id ON kb_files(category_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_jobs_kb_id ON kb_jobs(kb_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_chunks_file_id ON kb_chunks(file_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at ON chat_conversations(last_message_at)",
    "CREATE INDEX IF NOT EXISTS idx_chat_conversations_agent_profile_id ON chat_conversations(agent_profile_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id_created_at ON chat_messages(conversation_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_chat_messages_external_message_id ON chat_messages(external_message_id)",
]
