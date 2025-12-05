-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Health Monitoring & Alerts (VERSÃO FINAL V2)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sistema de monitoramento de saúde e alertas para Sofia
-- CORREÇÃO: Removida referência a c.status que não existe
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELA DE HEALTH CHECKS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metric_type TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  threshold NUMERIC,
  status TEXT NOT NULL,
  details JSONB,

  CONSTRAINT valid_status CHECK (status IN ('healthy', 'warning', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_health_checks_time ON health_checks(check_time DESC);
CREATE INDEX IF NOT EXISTS idx_health_checks_type ON health_checks(metric_type);
CREATE INDEX IF NOT EXISTS idx_health_checks_status ON health_checks(status);

COMMENT ON TABLE health_checks IS 'Histórico de verificações de saúde do sistema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TABELA DE ALERTAS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  notification_sent BOOLEAN DEFAULT FALSE,

  CONSTRAINT valid_severity CHECK (severity IN ('warning', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON alerts(resolved_at) WHERE resolved_at IS NULL;

COMMENT ON TABLE alerts IS 'Alertas gerados pelo sistema de monitoramento';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FUNCTION: Obter Métricas de Saúde (CORRIGIDO SEM c.status)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_health_metrics(
  time_window INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS TABLE (
  uptime_percentage NUMERIC,
  error_rate NUMERIC,
  avg_latency_ms NUMERIC,
  p95_latency_ms NUMERIC,
  total_conversations BIGINT,
  total_leads BIGINT,
  conversion_rate NUMERIC,
  active_conversations BIGINT,
  pending_followups BIGINT,
  avg_lead_score NUMERIC
) AS $$
DECLARE
  v_start_time TIMESTAMP WITH TIME ZONE;
BEGIN
  v_start_time := NOW() - time_window;

  RETURN QUERY
  WITH metrics AS (
    SELECT
      -- Uptime
      ROUND(
        (COUNT(*) FILTER (WHERE (ae.metadata->>'error')::BOOLEAN IS NULL OR (ae.metadata->>'error')::BOOLEAN = false)::NUMERIC
          / NULLIF(COUNT(*)::NUMERIC, 0)) * 100::NUMERIC,
        2
      ) as uptime_pct,

      -- Error rate
      ROUND(
        (COUNT(*) FILTER (WHERE (ae.metadata->>'error')::BOOLEAN = true)::NUMERIC
          / NULLIF(COUNT(*)::NUMERIC, 0)) * 100::NUMERIC,
        2
      ) as error_pct,

      -- Latência média
      ROUND((AVG((ae.metadata->>'response_time_ms')::NUMERIC))::NUMERIC, 0) as avg_lat,

      -- P95 latência
      ROUND((PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (ae.metadata->>'response_time_ms')::NUMERIC))::NUMERIC, 0) as p95_lat

    FROM analytics_events ae
    WHERE ae.event_type = 'message_sent'
      AND ae.created_at >= v_start_time
  ),
  conversation_metrics AS (
    SELECT
      COUNT(DISTINCT c.id) as total_convs,
      -- CORRIGIDO: Removido filtro c.status = 'active' que não existe
      -- Contando conversas recentes (últimas 24h) como proxy para "ativas"
      COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= NOW() - INTERVAL '24 hours') as active_convs
    FROM conversations c
    WHERE c.created_at >= v_start_time
  ),
  lead_metrics AS (
    SELECT
      COUNT(*) as total_leads,
      ROUND((AVG(score))::NUMERIC, 2) as avg_score
    FROM leads l
    WHERE l.created_at >= v_start_time
  ),
  followup_metrics AS (
    SELECT COUNT(*) as pending_followups
    FROM follow_up_queue fq
    WHERE fq.status = 'pending'
  )
  SELECT
    COALESCE(m.uptime_pct, 100::NUMERIC),
    COALESCE(m.error_pct, 0::NUMERIC),
    COALESCE(m.avg_lat, 0::NUMERIC),
    COALESCE(m.p95_lat, 0::NUMERIC),
    cm.total_convs,
    lm.total_leads,
    CASE
      WHEN cm.total_convs > 0
      THEN ROUND((lm.total_leads::NUMERIC / cm.total_convs::NUMERIC) * 100::NUMERIC, 2)
      ELSE 0::NUMERIC
    END,
    cm.active_convs,
    fm.pending_followups,
    COALESCE(lm.avg_score, 0::NUMERIC)
  FROM metrics m, conversation_metrics cm, lead_metrics lm, followup_metrics fm;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_health_metrics IS 'Retorna métricas de saúde do sistema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FUNCTION: Executar Health Check
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION run_health_check()
RETURNS JSONB AS $$
DECLARE
  v_error_rate NUMERIC;
  v_avg_latency NUMERIC;
  v_conversion_rate NUMERIC;
  v_rag_performance NUMERIC;
  v_alert_created BOOLEAN := FALSE;
BEGIN
  -- 1. Verificar Error Rate
  SELECT
    ROUND(
      (COUNT(*) FILTER (WHERE (ae.metadata->>'error')::BOOLEAN = true)::NUMERIC
        / NULLIF(COUNT(*)::NUMERIC, 0)) * 100::NUMERIC,
      2
    ) INTO v_error_rate
  FROM analytics_events ae
  WHERE ae.event_type = 'message_sent'
    AND ae.created_at >= NOW() - INTERVAL '1 hour';

  v_error_rate := COALESCE(v_error_rate, 0::NUMERIC);

  IF v_error_rate > 5 THEN
    INSERT INTO alerts (alert_type, severity, message, details)
    VALUES (
      'high_error_rate',
      CASE WHEN v_error_rate > 10 THEN 'critical' ELSE 'warning' END,
      format('Taxa de erro elevada: %.2f%%', v_error_rate),
      jsonb_build_object('error_rate', v_error_rate, 'threshold', 5)
    );
    v_alert_created := TRUE;
  END IF;

  INSERT INTO health_checks (metric_type, metric_value, threshold, status)
  VALUES (
    'error_rate',
    v_error_rate,
    5,
    CASE
      WHEN v_error_rate > 10 THEN 'critical'
      WHEN v_error_rate > 5 THEN 'warning'
      ELSE 'healthy'
    END
  );

  -- 2. Verificar Latência
  SELECT
    ROUND((AVG((ae.metadata->>'response_time_ms')::NUMERIC))::NUMERIC, 0) INTO v_avg_latency
  FROM analytics_events ae
  WHERE ae.event_type = 'message_sent'
    AND ae.created_at >= NOW() - INTERVAL '1 hour';

  v_avg_latency := COALESCE(v_avg_latency, 0::NUMERIC);

  IF v_avg_latency > 4000 THEN
    INSERT INTO alerts (alert_type, severity, message, details)
    VALUES (
      'high_latency',
      CASE WHEN v_avg_latency > 6000 THEN 'critical' ELSE 'warning' END,
      format('Latência elevada: %.0fms', v_avg_latency),
      jsonb_build_object('avg_latency_ms', v_avg_latency, 'threshold', 4000)
    );
    v_alert_created := TRUE;
  END IF;

  INSERT INTO health_checks (metric_type, metric_value, threshold, status)
  VALUES (
    'latency',
    v_avg_latency,
    4000,
    CASE
      WHEN v_avg_latency > 6000 THEN 'critical'
      WHEN v_avg_latency > 4000 THEN 'warning'
      ELSE 'healthy'
    END
  );

  -- 3. Verificar Taxa de Conversão
  SELECT
    ROUND(
      (COUNT(DISTINCT l.id)::NUMERIC / NULLIF(COUNT(DISTINCT c.id)::NUMERIC, 0)) * 100::NUMERIC,
      2
    ) INTO v_conversion_rate
  FROM conversations c
  LEFT JOIN leads l ON l.conversation_id = c.id
  WHERE c.created_at >= NOW() - INTERVAL '24 hours';

  v_conversion_rate := COALESCE(v_conversion_rate, 0::NUMERIC);

  IF v_conversion_rate < 10 AND v_conversion_rate > 0 THEN
    INSERT INTO alerts (alert_type, severity, message, details)
    VALUES (
      'low_conversion',
      'warning',
      format('Taxa de conversão baixa: %.2f%%', v_conversion_rate),
      jsonb_build_object('conversion_rate', v_conversion_rate, 'threshold', 10)
    );
    v_alert_created := TRUE;
  END IF;

  INSERT INTO health_checks (metric_type, metric_value, threshold, status)
  VALUES (
    'conversion_rate',
    v_conversion_rate,
    10,
    CASE
      WHEN v_conversion_rate < 10 THEN 'warning'
      ELSE 'healthy'
    END
  );

  -- 4. Verificar RAG Performance
  SELECT
    ROUND(
      (COUNT(*) FILTER (WHERE (ae.metadata->>'rag_chunks_used')::INT = 0)::NUMERIC
        / NULLIF(COUNT(*)::NUMERIC, 0)) * 100::NUMERIC,
      2
    ) INTO v_rag_performance
  FROM analytics_events ae
  WHERE ae.event_type = 'message_sent'
    AND ae.created_at >= NOW() - INTERVAL '1 hour'
    AND ae.metadata->>'rag_chunks_used' IS NOT NULL;

  v_rag_performance := COALESCE(v_rag_performance, 0::NUMERIC);

  IF v_rag_performance > 30 THEN
    INSERT INTO alerts (alert_type, severity, message, details)
    VALUES (
      'poor_rag_performance',
      'warning',
      format('RAG com baixa performance: %.2f%% sem chunks', v_rag_performance),
      jsonb_build_object('queries_without_chunks_pct', v_rag_performance, 'threshold', 30)
    );
    v_alert_created := TRUE;
  END IF;

  INSERT INTO health_checks (metric_type, metric_value, threshold, status)
  VALUES (
    'rag_performance',
    v_rag_performance,
    30,
    CASE
      WHEN v_rag_performance > 30 THEN 'warning'
      ELSE 'healthy'
    END
  );

  RETURN jsonb_build_object(
    'timestamp', NOW(),
    'metrics', jsonb_build_object(
      'error_rate', v_error_rate,
      'avg_latency_ms', v_avg_latency,
      'conversion_rate', v_conversion_rate,
      'rag_no_chunks_pct', v_rag_performance
    ),
    'alerts_created', v_alert_created,
    'status', CASE
      WHEN v_error_rate > 10 OR v_avg_latency > 6000 THEN 'critical'
      WHEN v_error_rate > 5 OR v_avg_latency > 4000 OR v_conversion_rate < 10 THEN 'warning'
      ELSE 'healthy'
    END
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION run_health_check IS 'Executa verificação de saúde e gera alertas';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. FUNCTION: Listar Alertas Não Resolvidos
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_unresolved_alerts()
RETURNS TABLE (
  alert_id UUID,
  alert_type TEXT,
  severity TEXT,
  message TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE,
  age_minutes INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.alert_type,
    a.severity,
    a.message,
    a.details,
    a.created_at,
    EXTRACT(EPOCH FROM (NOW() - a.created_at))::INT / 60 as age_minutes
  FROM alerts a
  WHERE a.resolved_at IS NULL
  ORDER BY
    CASE a.severity
      WHEN 'critical' THEN 1
      WHEN 'warning' THEN 2
    END,
    a.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unresolved_alerts IS 'Lista alertas não resolvidos';

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT ON health_checks TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON alerts TO authenticated, anon;

GRANT EXECUTE ON FUNCTION get_health_metrics TO authenticated, anon;
GRANT EXECUTE ON FUNCTION run_health_check TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_unresolved_alerts TO authenticated, anon;
