-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Analytics Dashboard - RPC Functions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Funções SQL otimizadas para o Dashboard de Analytics
-- Gera métricas de conversão, funil, intents, sentimentos, e performance
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. FUNIL DE CONVERSÃO
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_conversion_funnel(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  org_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  total_conversations BIGINT,
  total_leads BIGINT,
  leads_quentes BIGINT,
  leads_platinum BIGINT,
  conversion_rate NUMERIC,
  hot_lead_rate NUMERIC,
  platinum_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH conversations_count AS (
    SELECT COUNT(DISTINCT c.id) as count
    FROM conversations c
    WHERE c.created_at >= start_date
      AND c.created_at <= end_date
      AND (org_id_filter IS NULL OR c.org_id = org_id_filter)
  ),
  leads_count AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE l.temperatura = 'quente') as quentes,
      COUNT(*) FILTER (WHERE l.classification = 'platinum') as platinum
    FROM leads l
    WHERE l.created_at >= start_date
      AND l.created_at <= end_date
      AND (org_id_filter IS NULL OR l.org_id = org_id_filter)
  )
  SELECT
    cc.count as total_conversations,
    lc.total as total_leads,
    lc.quentes as leads_quentes,
    lc.platinum as leads_platinum,
    CASE
      WHEN cc.count > 0 THEN ROUND((lc.total::NUMERIC / cc.count::NUMERIC) * 100, 2)
      ELSE 0
    END as conversion_rate,
    CASE
      WHEN lc.total > 0 THEN ROUND((lc.quentes::NUMERIC / lc.total::NUMERIC) * 100, 2)
      ELSE 0
    END as hot_lead_rate,
    CASE
      WHEN lc.total > 0 THEN ROUND((lc.platinum::NUMERIC / lc.total::NUMERIC) * 100, 2)
      ELSE 0
    END as platinum_rate
  FROM conversations_count cc, leads_count lc;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_conversion_funnel IS 'Retorna métricas do funil de conversão: conversas → leads → quentes → platinum';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. DISTRIBUIÇÃO DE INTENTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_intent_distribution(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '7 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  org_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  intent TEXT,
  count BIGINT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH intent_counts AS (
    SELECT
      ae.metadata->>'intent' as intent_name,
      COUNT(*) as intent_count
    FROM analytics_events ae
    WHERE ae.event_type = 'message_sent'
      AND ae.metadata->>'intent' IS NOT NULL
      AND ae.created_at >= start_date
      AND ae.created_at <= end_date
      AND (org_id_filter IS NULL OR ae.org_id = org_id_filter)
    GROUP BY ae.metadata->>'intent'
  ),
  total AS (
    SELECT SUM(intent_count) as total_count FROM intent_counts
  )
  SELECT
    ic.intent_name::TEXT,
    ic.intent_count,
    ROUND((ic.intent_count::NUMERIC / t.total_count::NUMERIC) * 100, 2) as percentage
  FROM intent_counts ic, total t
  ORDER BY ic.intent_count DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_intent_distribution IS 'Retorna distribuição de intents detectados com percentuais';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. DISTRIBUIÇÃO DE SENTIMENTOS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_sentiment_distribution(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '7 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  org_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  sentiment TEXT,
  count BIGINT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH sentiment_counts AS (
    SELECT
      ae.metadata->>'sentiment' as sentiment_name,
      COUNT(*) as sentiment_count
    FROM analytics_events ae
    WHERE ae.event_type = 'message_sent'
      AND ae.metadata->>'sentiment' IS NOT NULL
      AND ae.created_at >= start_date
      AND ae.created_at <= end_date
      AND (org_id_filter IS NULL OR ae.org_id = org_id_filter)
    GROUP BY ae.metadata->>'sentiment'
  ),
  total AS (
    SELECT SUM(sentiment_count) as total_count FROM sentiment_counts
  )
  SELECT
    sc.sentiment_name::TEXT,
    sc.sentiment_count,
    ROUND((sc.sentiment_count::NUMERIC / t.total_count::NUMERIC) * 100, 2) as percentage
  FROM sentiment_counts sc, total t
  ORDER BY sc.sentiment_count DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_sentiment_distribution IS 'Retorna distribuição de sentimentos detectados';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. TIMELINE DE CONVERSÕES (por dia/semana/mês)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_conversion_timeline(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  interval_type TEXT DEFAULT 'day', -- 'day', 'week', 'month'
  org_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  period TIMESTAMP WITH TIME ZONE,
  conversations_count BIGINT,
  leads_count BIGINT,
  conversion_rate NUMERIC
) AS $$
DECLARE
  date_trunc_format TEXT;
BEGIN
  -- Determina o formato de agrupamento baseado no intervalo
  date_trunc_format := CASE interval_type
    WHEN 'week' THEN 'week'
    WHEN 'month' THEN 'month'
    ELSE 'day'
  END;

  RETURN QUERY
  EXECUTE format($query$
    WITH periods AS (
      SELECT DATE_TRUNC(%L, d.day) as period
      FROM generate_series($1::TIMESTAMP, $2::TIMESTAMP, ('1 ' || %L)::INTERVAL) as d(day)
    ),
    conversations_per_period AS (
      SELECT
        DATE_TRUNC(%L, c.created_at) as period,
        COUNT(DISTINCT c.id) as count
      FROM conversations c
      WHERE c.created_at >= $1
        AND c.created_at <= $2
        AND ($3 IS NULL OR c.org_id = $3)
      GROUP BY DATE_TRUNC(%L, c.created_at)
    ),
    leads_per_period AS (
      SELECT
        DATE_TRUNC(%L, l.created_at) as period,
        COUNT(*) as count
      FROM leads l
      WHERE l.created_at >= $1
        AND l.created_at <= $2
        AND ($3 IS NULL OR l.org_id = $3)
      GROUP BY DATE_TRUNC(%L, l.created_at)
    )
    SELECT
      p.period,
      COALESCE(cpp.count, 0) as conversations_count,
      COALESCE(lpp.count, 0) as leads_count,
      CASE
        WHEN COALESCE(cpp.count, 0) > 0
        THEN ROUND((COALESCE(lpp.count, 0)::NUMERIC / cpp.count::NUMERIC) * 100, 2)
        ELSE 0
      END as conversion_rate
    FROM periods p
    LEFT JOIN conversations_per_period cpp ON p.period = cpp.period
    LEFT JOIN leads_per_period lpp ON p.period = lpp.period
    ORDER BY p.period ASC
  $query$,
    date_trunc_format, interval_type,
    date_trunc_format, date_trunc_format,
    date_trunc_format, date_trunc_format
  )
  USING start_date, end_date, org_id_filter;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_conversion_timeline IS 'Retorna timeline de conversões por dia/semana/mês';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. MÉTRICAS DE PERFORMANCE (RAG, Latência, Quick Responses)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_performance_metrics(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '7 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  org_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  avg_rag_chunks NUMERIC,
  quick_response_rate NUMERIC,
  total_messages BIGINT,
  avg_question_length NUMERIC,
  avg_answer_length NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(AVG((ae.metadata->>'rag_chunks_used')::NUMERIC), 2) as avg_rag_chunks,
    ROUND(
      (COUNT(*) FILTER (WHERE (ae.metadata->>'quick_response_used')::BOOLEAN = true)::NUMERIC
        / NULLIF(COUNT(*), 0)::NUMERIC) * 100,
      2
    ) as quick_response_rate,
    COUNT(*) as total_messages,
    ROUND(AVG((ae.metadata->>'question_length')::NUMERIC), 0) as avg_question_length,
    ROUND(AVG((ae.metadata->>'answer_length')::NUMERIC), 0) as avg_answer_length
  FROM analytics_events ae
  WHERE ae.event_type = 'message_sent'
    AND ae.created_at >= start_date
    AND ae.created_at <= end_date
    AND (org_id_filter IS NULL OR ae.org_id = org_id_filter);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_performance_metrics IS 'Retorna métricas de performance: RAG usage, quick responses, tamanhos';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. DISTRIBUIÇÃO DE LEAD SCORES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_lead_score_distribution(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  org_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  classification TEXT,
  count BIGINT,
  avg_score NUMERIC,
  min_score INT,
  max_score INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.classification::TEXT,
    COUNT(*) as count,
    ROUND(AVG(l.score), 2) as avg_score,
    MIN(l.score) as min_score,
    MAX(l.score) as max_score
  FROM leads l
  WHERE l.created_at >= start_date
    AND l.created_at <= end_date
    AND (org_id_filter IS NULL OR l.org_id = org_id_filter)
    AND l.classification IS NOT NULL
  GROUP BY l.classification
  ORDER BY
    CASE l.classification
      WHEN 'platinum' THEN 1
      WHEN 'gold' THEN 2
      WHEN 'silver' THEN 3
      WHEN 'bronze' THEN 4
      ELSE 5
    END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_lead_score_distribution IS 'Retorna distribuição de leads por classificação com scores';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TAXA DE ABANDONO
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_abandonment_metrics(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '7 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  org_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  total_risks_detected BIGINT,
  high_risk_count BIGINT,
  medium_risk_count BIGINT,
  low_risk_count BIGINT,
  avg_risk_score NUMERIC,
  high_risk_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_risks_detected,
    COUNT(*) FILTER (WHERE ara.risk_level = 'high') as high_risk_count,
    COUNT(*) FILTER (WHERE ara.risk_level = 'medium') as medium_risk_count,
    COUNT(*) FILTER (WHERE ara.risk_level = 'low') as low_risk_count,
    ROUND(AVG(ara.risk_score), 2) as avg_risk_score,
    ROUND(
      (COUNT(*) FILTER (WHERE ara.risk_level = 'high')::NUMERIC
        / NULLIF(COUNT(*), 0)::NUMERIC) * 100,
      2
    ) as high_risk_percentage
  FROM abandonment_risk_analysis ara
  WHERE ara.created_at >= start_date
    AND ara.created_at <= end_date
    AND (org_id_filter IS NULL OR ara.org_id = org_id_filter);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_abandonment_metrics IS 'Retorna métricas de risco de abandono detectados';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. TOP TRIGGERS DE ABANDONO
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_top_abandonment_triggers(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '7 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  org_id_filter UUID DEFAULT NULL,
  limit_count INT DEFAULT 10
)
RETURNS TABLE (
  trigger_name TEXT,
  count BIGINT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH trigger_counts AS (
    SELECT
      jsonb_array_elements_text(ara.triggers) as trigger_name,
      COUNT(*) as trigger_count
    FROM abandonment_risk_analysis ara
    WHERE ara.created_at >= start_date
      AND ara.created_at <= end_date
      AND (org_id_filter IS NULL OR ara.org_id = org_id_filter)
    GROUP BY jsonb_array_elements_text(ara.triggers)
  ),
  total AS (
    SELECT SUM(trigger_count) as total_count FROM trigger_counts
  )
  SELECT
    tc.trigger_name::TEXT,
    tc.trigger_count,
    ROUND((tc.trigger_count::NUMERIC / t.total_count::NUMERIC) * 100, 2) as percentage
  FROM trigger_counts tc, total t
  ORDER BY tc.trigger_count DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_top_abandonment_triggers IS 'Retorna os triggers de abandono mais comuns';

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. KPIs GERAIS (Overview Card)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_dashboard_kpis(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  org_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  total_conversations BIGINT,
  total_leads BIGINT,
  total_messages BIGINT,
  avg_messages_per_conversation NUMERIC,
  conversion_rate NUMERIC,
  platinum_leads BIGINT,
  avg_lead_score NUMERIC,
  quick_response_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH kpis AS (
    SELECT
      (SELECT COUNT(DISTINCT id) FROM conversations c
       WHERE c.created_at >= start_date AND c.created_at <= end_date
       AND (org_id_filter IS NULL OR c.org_id = org_id_filter)) as convs,

      (SELECT COUNT(*) FROM leads l
       WHERE l.created_at >= start_date AND l.created_at <= end_date
       AND (org_id_filter IS NULL OR l.org_id = org_id_filter)) as leads,

      (SELECT COUNT(*) FROM messages m
       WHERE m.created_at >= start_date AND m.created_at <= end_date
       AND EXISTS (
         SELECT 1 FROM conversations c
         WHERE c.id = m.conversation_id
         AND (org_id_filter IS NULL OR c.org_id = org_id_filter)
       )) as msgs,

      (SELECT COUNT(*) FROM leads l
       WHERE l.classification = 'platinum'
       AND l.created_at >= start_date AND l.created_at <= end_date
       AND (org_id_filter IS NULL OR l.org_id = org_id_filter)) as plat,

      (SELECT ROUND(AVG(score), 2) FROM leads l
       WHERE l.created_at >= start_date AND l.created_at <= end_date
       AND (org_id_filter IS NULL OR l.org_id = org_id_filter)) as avg_score,

      (SELECT COUNT(*) FILTER (WHERE (metadata->>'quick_response_used')::BOOLEAN = true)::NUMERIC
         / NULLIF(COUNT(*), 0)::NUMERIC * 100
       FROM analytics_events ae
       WHERE ae.event_type = 'message_sent'
       AND ae.created_at >= start_date AND ae.created_at <= end_date
       AND (org_id_filter IS NULL OR ae.org_id = org_id_filter)) as qr_rate
  )
  SELECT
    k.convs,
    k.leads,
    k.msgs,
    CASE WHEN k.convs > 0 THEN ROUND(k.msgs::NUMERIC / k.convs::NUMERIC, 2) ELSE 0 END,
    CASE WHEN k.convs > 0 THEN ROUND((k.leads::NUMERIC / k.convs::NUMERIC) * 100, 2) ELSE 0 END,
    k.plat,
    COALESCE(k.avg_score, 0),
    COALESCE(ROUND(k.qr_rate, 2), 0)
  FROM kpis k;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_dashboard_kpis IS 'Retorna KPIs principais para cards do dashboard';

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants para funções (permite acesso via Supabase client)
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION get_conversion_funnel TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_intent_distribution TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_sentiment_distribution TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_conversion_timeline TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_performance_metrics TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_lead_score_distribution TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_abandonment_metrics TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_top_abandonment_triggers TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis TO authenticated, anon;
