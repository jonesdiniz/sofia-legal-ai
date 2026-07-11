-- The production schema has no conversations.status column and the planned
-- follow_up_queue table was never deployed. Keep the dashboard truthful to the
-- schema that exists instead of inventing state or creating unused storage.

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
    SELECT COUNT(DISTINCT c.id) AS total_convs
    FROM public.conversations c
    WHERE c.created_at >= v_start_time
  ),
  lead_metrics AS (
    SELECT
      COUNT(*) AS total_leads,
      ROUND(AVG(score), 2) AS avg_score
    FROM public.leads l
    WHERE l.created_at >= v_start_time
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
    cm.total_convs,
    0::BIGINT,
    COALESCE(lm.avg_score, 0)
  FROM metrics m, conversation_metrics cm, lead_metrics lm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_health_metrics(INTERVAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_health_metrics(INTERVAL) TO authenticated, service_role;
