-- Preserve the manual RLS containment while restoring authenticated dashboards
-- through narrow RPCs. Raw admin tables and views remain unavailable to clients.

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedding_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.alerts,
  public.analytics_events,
  public.embedding_cache,
  public.experiment_assignments,
  public.experiments,
  public.health_checks,
  public.openai_usage,
  public.high_risk_conversations,
  public.leads_prioritized
FROM anon, authenticated;

ALTER VIEW public.high_risk_conversations SET (security_invoker = true);
ALTER VIEW public.leads_prioritized SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.get_health_metrics(
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
      ROUND(
        (COUNT(*) FILTER (WHERE (ae.metadata->>'error')::BOOLEAN IS NULL OR (ae.metadata->>'error')::BOOLEAN = false)::NUMERIC
          / NULLIF(COUNT(*), 0)::NUMERIC) * 100,
        2
      ) AS uptime_pct,
      ROUND(
        (COUNT(*) FILTER (WHERE (ae.metadata->>'error')::BOOLEAN = true)::NUMERIC
          / NULLIF(COUNT(*), 0)::NUMERIC) * 100,
        2
      ) AS error_pct,
      ROUND(AVG((ae.metadata->>'response_time_ms')::NUMERIC), 0) AS avg_lat,
      ROUND(
        PERCENTILE_CONT(0.95) WITHIN GROUP (
          ORDER BY (ae.metadata->>'response_time_ms')::NUMERIC
        )::NUMERIC,
        0
      ) AS p95_lat
    FROM public.analytics_events ae
    WHERE ae.event_type = 'message_sent'
      AND ae.created_at >= v_start_time
  ),
  conversation_metrics AS (
    SELECT
      COUNT(DISTINCT c.id) AS total_convs,
      COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') AS active_convs
    FROM public.conversations c
    WHERE c.created_at >= v_start_time
  ),
  lead_metrics AS (
    SELECT
      COUNT(*) AS total_leads,
      ROUND(AVG(score), 2) AS avg_score
    FROM public.leads l
    WHERE l.created_at >= v_start_time
  ),
  followup_metrics AS (
    SELECT COUNT(*) AS pending_followups
    FROM public.follow_up_queue fq
    WHERE fq.status = 'pending'
  )
  SELECT
    COALESCE(m.uptime_pct, 100),
    COALESCE(m.error_pct, 0),
    COALESCE(m.avg_lat, 0),
    COALESCE(m.p95_lat, 0),
    cm.total_convs,
    lm.total_leads,
    CASE
      WHEN cm.total_convs > 0
      THEN ROUND((lm.total_leads::NUMERIC / cm.total_convs::NUMERIC) * 100, 2)
      ELSE 0
    END,
    cm.active_convs,
    fm.pending_followups,
    COALESCE(lm.avg_score, 0)
  FROM metrics m, conversation_metrics cm, lead_metrics lm, followup_metrics fm;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_conversion_timeline(
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  interval_type TEXT DEFAULT 'day',
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
  date_trunc_format := CASE interval_type
    WHEN 'week' THEN 'week'
    WHEN 'month' THEN 'month'
    ELSE 'day'
  END;

  RETURN QUERY
  EXECUTE format($query$
    WITH periods AS (
      SELECT DATE_TRUNC(%L, d.day) AS period
      FROM generate_series($1, $2, ('1 ' || %L)::INTERVAL) AS d(day)
    ),
    conversations_per_period AS (
      SELECT
        DATE_TRUNC(%L, c.created_at) AS period,
        COUNT(DISTINCT c.id) AS count
      FROM public.conversations c
      WHERE c.created_at >= $1
        AND c.created_at <= $2
        AND ($3 IS NULL OR c.org_id = $3)
      GROUP BY DATE_TRUNC(%L, c.created_at)
    ),
    leads_per_period AS (
      SELECT
        DATE_TRUNC(%L, l.created_at) AS period,
        COUNT(*) AS count
      FROM public.leads l
      WHERE l.created_at >= $1
        AND l.created_at <= $2
        AND ($3 IS NULL OR l.org_id = $3)
      GROUP BY DATE_TRUNC(%L, l.created_at)
    )
    SELECT
      p.period,
      COALESCE(cpp.count, 0) AS conversations_count,
      COALESCE(lpp.count, 0) AS leads_count,
      CASE
        WHEN COALESCE(cpp.count, 0) > 0
        THEN ROUND((COALESCE(lpp.count, 0)::NUMERIC / cpp.count::NUMERIC) * 100, 2)
        ELSE 0
      END AS conversion_rate
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

ALTER FUNCTION public.get_health_metrics(INTERVAL) SECURITY DEFINER;
ALTER FUNCTION public.get_health_metrics(INTERVAL) SET search_path = public;
ALTER FUNCTION public.get_unresolved_alerts() SECURITY DEFINER;
ALTER FUNCTION public.get_unresolved_alerts() SET search_path = public;
ALTER FUNCTION public.get_dashboard_kpis(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY DEFINER;
ALTER FUNCTION public.get_dashboard_kpis(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SET search_path = public;
ALTER FUNCTION public.get_conversion_funnel(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY DEFINER;
ALTER FUNCTION public.get_conversion_funnel(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SET search_path = public;
ALTER FUNCTION public.get_intent_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY DEFINER;
ALTER FUNCTION public.get_intent_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SET search_path = public;
ALTER FUNCTION public.get_sentiment_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY DEFINER;
ALTER FUNCTION public.get_sentiment_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SET search_path = public;
ALTER FUNCTION public.get_conversion_timeline(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, UUID) SECURITY DEFINER;
ALTER FUNCTION public.get_conversion_timeline(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, UUID) SET search_path = public;
ALTER FUNCTION public.get_lead_score_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY DEFINER;
ALTER FUNCTION public.get_lead_score_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SET search_path = public;
ALTER FUNCTION public.get_abandonment_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY DEFINER;
ALTER FUNCTION public.get_abandonment_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_health_metrics(INTERVAL) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_unresolved_alerts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_kpis(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_conversion_funnel(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_intent_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sentiment_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_conversion_timeline(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_lead_score_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_abandonment_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_health_metrics(INTERVAL) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unresolved_alerts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_conversion_funnel(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_intent_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sentiment_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_conversion_timeline(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_lead_score_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_abandonment_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
