-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: OpenAI Cost Tracking & Optimization
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sistema de tracking de custos OpenAI para monitoramento e otimização
-- Permite análise de ROI e identificação de oportunidades de economia
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELA DE USO OPENAI
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS openai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  org_id UUID,
  operation_type TEXT NOT NULL, -- 'chat', 'embedding', 'rerank'
  model TEXT NOT NULL, -- 'gpt-4o', 'gpt-4o-mini', 'text-embedding-3-small'
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL,
  cached BOOLEAN DEFAULT FALSE, -- Se usou cache
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_operation CHECK (operation_type IN ('chat', 'embedding', 'rerank', 'sentiment', 'intent'))
);

CREATE INDEX idx_openai_usage_date ON openai_usage(created_at DESC);
CREATE INDEX idx_openai_usage_conversation ON openai_usage(conversation_id);
CREATE INDEX idx_openai_usage_org ON openai_usage(org_id);
CREATE INDEX idx_openai_usage_model ON openai_usage(model);
CREATE INDEX idx_openai_usage_operation ON openai_usage(operation_type);

COMMENT ON TABLE openai_usage IS 'Tracking de uso e custos da API OpenAI';
COMMENT ON COLUMN openai_usage.cached IS 'Indica se a resposta veio de cache (economia de custo)';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TABELA DE CACHE DE EMBEDDINGS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_hash TEXT NOT NULL UNIQUE, -- MD5 hash do texto
  text_preview TEXT, -- Primeiros 100 chars para debug
  embedding vector(1536), -- Embedding do text-embedding-3-small
  model TEXT DEFAULT 'text-embedding-3-small',
  hit_count INT DEFAULT 0, -- Quantas vezes foi reutilizado
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_embedding_cache_hash ON embedding_cache(text_hash);
CREATE INDEX idx_embedding_cache_last_used ON embedding_cache(last_used_at DESC);

COMMENT ON TABLE embedding_cache IS 'Cache de embeddings para reduzir chamadas à API OpenAI';
COMMENT ON COLUMN embedding_cache.hit_count IS 'Contador de cache hits - quanto maior, mais economia';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FUNCTION: Calcular Custo Estimado
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_openai_cost(
  p_model TEXT,
  p_prompt_tokens INT,
  p_completion_tokens INT DEFAULT 0
)
RETURNS NUMERIC AS $$
DECLARE
  v_cost NUMERIC := 0;
  v_prompt_cost_per_1m NUMERIC;
  v_completion_cost_per_1m NUMERIC;
BEGIN
  -- Preços por 1M tokens (Janeiro 2025)
  CASE p_model
    WHEN 'gpt-4o' THEN
      v_prompt_cost_per_1m := 2.50;
      v_completion_cost_per_1m := 10.00;
    WHEN 'gpt-4o-mini' THEN
      v_prompt_cost_per_1m := 0.150;
      v_completion_cost_per_1m := 0.600;
    WHEN 'text-embedding-3-small' THEN
      v_prompt_cost_per_1m := 0.020;
      v_completion_cost_per_1m := 0;
    WHEN 'text-embedding-3-large' THEN
      v_prompt_cost_per_1m := 0.130;
      v_completion_cost_per_1m := 0;
    ELSE
      -- Default: assume gpt-4o
      v_prompt_cost_per_1m := 2.50;
      v_completion_cost_per_1m := 10.00;
  END CASE;

  -- Calcula custo
  v_cost := (p_prompt_tokens::NUMERIC / 1000000) * v_prompt_cost_per_1m;
  v_cost := v_cost + (p_completion_tokens::NUMERIC / 1000000) * v_completion_cost_per_1m;

  RETURN ROUND(v_cost, 6);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_openai_cost IS 'Calcula custo estimado em USD baseado em tokens e modelo';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FUNCTION: Análise de Custos Diários
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_daily_cost_analysis(
  start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  date DATE,
  total_cost_usd NUMERIC,
  conversations_count BIGINT,
  cost_per_conversation NUMERIC,
  total_tokens BIGINT,
  chat_cost NUMERIC,
  embedding_cost NUMERIC,
  cache_savings_usd NUMERIC,
  cache_hit_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_metrics AS (
    SELECT
      DATE(ou.created_at) as metric_date,
      SUM(ou.estimated_cost_usd) as total_cost,
      COUNT(DISTINCT ou.conversation_id) as conv_count,
      SUM(ou.total_tokens) as tokens,
      SUM(ou.estimated_cost_usd) FILTER (WHERE ou.operation_type = 'chat') as chat_c,
      SUM(ou.estimated_cost_usd) FILTER (WHERE ou.operation_type = 'embedding') as embed_c,
      COUNT(*) FILTER (WHERE ou.cached = true) as cached_count,
      COUNT(*) as total_operations,
      -- Estima economia de cache (assume custo médio por operação)
      (COUNT(*) FILTER (WHERE ou.cached = true))::NUMERIC
        * (SUM(ou.estimated_cost_usd) / NULLIF(COUNT(*), 0)::NUMERIC) as cache_savings
    FROM openai_usage ou
    WHERE DATE(ou.created_at) BETWEEN start_date AND end_date
    GROUP BY DATE(ou.created_at)
  )
  SELECT
    dm.metric_date::DATE,
    ROUND(dm.total_cost, 4),
    dm.conv_count,
    CASE
      WHEN dm.conv_count > 0
      THEN ROUND(dm.total_cost / dm.conv_count, 4)
      ELSE 0
    END,
    dm.tokens,
    ROUND(COALESCE(dm.chat_c, 0), 4),
    ROUND(COALESCE(dm.embed_c, 0), 4),
    ROUND(COALESCE(dm.cache_savings, 0), 4),
    CASE
      WHEN dm.total_operations > 0
      THEN ROUND((dm.cached_count::NUMERIC / dm.total_operations::NUMERIC) * 100, 2)
      ELSE 0
    END
  FROM daily_metrics dm
  ORDER BY dm.metric_date DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_daily_cost_analysis IS 'Análise diária de custos OpenAI com breakdown por tipo e cache savings';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. FUNCTION: Top Conversas por Custo
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_top_expensive_conversations(
  limit_count INT DEFAULT 10,
  time_window INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS TABLE (
  conversation_id UUID,
  total_cost_usd NUMERIC,
  total_tokens BIGINT,
  operations_count BIGINT,
  messages_count BIGINT,
  lead_created BOOLEAN,
  lead_score INT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ou.conversation_id,
    ROUND(SUM(ou.estimated_cost_usd), 4) as total_cost,
    SUM(ou.total_tokens) as tokens,
    COUNT(*) as ops,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = ou.conversation_id) as msg_count,
    EXISTS(SELECT 1 FROM leads l WHERE l.conversation_id = ou.conversation_id) as has_lead,
    (SELECT l.score FROM leads l WHERE l.conversation_id = ou.conversation_id LIMIT 1) as l_score,
    MIN(ou.created_at) as first_operation
  FROM openai_usage ou
  WHERE ou.created_at >= NOW() - time_window
    AND ou.conversation_id IS NOT NULL
  GROUP BY ou.conversation_id
  ORDER BY total_cost DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_top_expensive_conversations IS 'Lista conversas mais caras para identificar padrões de alto custo';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. FUNCTION: Cache Hit Rate e Economia
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_cache_performance(
  time_window INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS TABLE (
  total_operations BIGINT,
  cached_operations BIGINT,
  cache_hit_rate NUMERIC,
  estimated_savings_usd NUMERIC,
  top_cached_queries JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH cache_stats AS (
    SELECT
      COUNT(*) as total_ops,
      COUNT(*) FILTER (WHERE ou.cached = true) as cached_ops,
      AVG(ou.estimated_cost_usd) as avg_cost_per_op
    FROM openai_usage ou
    WHERE ou.created_at >= NOW() - time_window
  ),
  top_cache_hits AS (
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'text_preview', ec.text_preview,
          'hit_count', ec.hit_count,
          'savings_usd', ROUND(ec.hit_count * 0.00002, 6) -- Aproximado
        )
        ORDER BY ec.hit_count DESC
      ) FILTER (WHERE ec.hit_count > 1) as top_queries
    FROM embedding_cache ec
    WHERE ec.last_used_at >= NOW() - time_window
    LIMIT 10
  )
  SELECT
    cs.total_ops,
    cs.cached_ops,
    ROUND((cs.cached_ops::NUMERIC / NULLIF(cs.total_ops, 0)::NUMERIC) * 100, 2),
    ROUND(cs.cached_ops * cs.avg_cost_per_op, 4),
    tch.top_queries
  FROM cache_stats cs, top_cache_hits tch;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_cache_performance IS 'Performance do sistema de cache e economia estimada';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. FUNCTION: ROI por Conversa
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_conversation_roi(
  lead_value_usd NUMERIC DEFAULT 500.00 -- Valor estimado de um lead qualificado
)
RETURNS TABLE (
  date DATE,
  total_cost_usd NUMERIC,
  leads_generated BIGINT,
  cost_per_lead NUMERIC,
  revenue_estimate NUMERIC,
  roi_percentage NUMERIC,
  profitable BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_data AS (
    SELECT
      DATE(c.created_at) as conv_date,
      SUM(
        (SELECT SUM(ou.estimated_cost_usd)
         FROM openai_usage ou
         WHERE ou.conversation_id = c.id)
      ) as total_cost,
      COUNT(DISTINCT l.id) as leads_count
    FROM conversations c
    LEFT JOIN leads l ON l.conversation_id = c.id
    WHERE c.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(c.created_at)
  )
  SELECT
    dd.conv_date::DATE,
    ROUND(COALESCE(dd.total_cost, 0), 4),
    dd.leads_count,
    CASE
      WHEN dd.leads_count > 0
      THEN ROUND(dd.total_cost / dd.leads_count, 4)
      ELSE 0
    END,
    dd.leads_count * lead_value_usd as revenue_est,
    CASE
      WHEN dd.total_cost > 0
      THEN ROUND(((dd.leads_count * lead_value_usd - dd.total_cost) / dd.total_cost) * 100, 2)
      ELSE 0
    END,
    (dd.leads_count * lead_value_usd) > dd.total_cost
  FROM daily_data dd
  WHERE dd.total_cost > 0
  ORDER BY dd.conv_date DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_conversation_roi IS 'Calcula ROI baseado em custo OpenAI vs valor estimado de leads';

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT ON openai_usage TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON embedding_cache TO authenticated, anon;

GRANT EXECUTE ON FUNCTION calculate_openai_cost TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_daily_cost_analysis TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_top_expensive_conversations TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_cache_performance TO authenticated, anon;
GRANT EXECUTE ON FUNCTION calculate_conversation_roi TO authenticated, anon;
