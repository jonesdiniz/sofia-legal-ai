-- Harden Sofia admin data surfaces and add persistent edge rate limiting.

-- Public chat feedback remains anonymous, but admin/reporting surfaces should
-- never be callable with the public anon key.

REVOKE EXECUTE ON FUNCTION get_conversion_funnel(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_intent_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_sentiment_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_conversion_timeline(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_performance_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_lead_score_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_abandonment_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_top_abandonment_triggers(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_dashboard_kpis(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION get_conversion_funnel(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_intent_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_sentiment_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_conversion_timeline(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_performance_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_lead_score_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_abandonment_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_top_abandonment_triggers(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_dashboard_kpis(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, service_role;

REVOKE SELECT, INSERT, UPDATE, DELETE ON health_checks FROM PUBLIC, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON alerts FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON health_checks FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON alerts FROM authenticated;
GRANT SELECT ON health_checks TO authenticated;
GRANT SELECT ON alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON health_checks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON alerts TO service_role;

REVOKE EXECUTE ON FUNCTION get_health_metrics(INTERVAL) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_unresolved_alerts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION run_health_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_health_metrics(INTERVAL) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_unresolved_alerts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION run_health_check() TO service_role;

REVOKE SELECT, INSERT, UPDATE, DELETE ON openai_usage FROM PUBLIC, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON embedding_cache FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON openai_usage FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON embedding_cache FROM authenticated;
GRANT SELECT ON openai_usage TO authenticated;
GRANT SELECT ON embedding_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON openai_usage TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON embedding_cache TO service_role;

REVOKE EXECUTE ON FUNCTION get_daily_cost_analysis(DATE, DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_top_expensive_conversations(INT, INTERVAL) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_cache_performance(INTERVAL) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION calculate_conversation_roi(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_daily_cost_analysis(DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_top_expensive_conversations(INT, INTERVAL) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_cache_performance(INTERVAL) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION calculate_conversation_roi(NUMERIC) TO authenticated, service_role;

REVOKE SELECT, INSERT, UPDATE, DELETE ON experiments FROM PUBLIC, anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON experiment_assignments FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON experiments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON experiment_assignments FROM authenticated;
GRANT SELECT ON experiments TO authenticated;
GRANT SELECT ON experiment_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON experiments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON experiment_assignments TO service_role;

REVOKE EXECUTE ON FUNCTION assign_experiment_variant(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_experiment_config(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION calculate_experiment_results(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_active_experiments(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assign_experiment_variant(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_experiment_config(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_experiment_results(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_active_experiments(UUID) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS edge_rate_limits (
  route TEXT NOT NULL,
  identifier_hash TEXT NOT NULL,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (route, identifier_hash, window_start)
);

ALTER TABLE edge_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage edge_rate_limits" ON edge_rate_limits;
CREATE POLICY "Service role can manage edge_rate_limits"
  ON edge_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON edge_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON edge_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION increment_edge_rate_limit(
  p_route TEXT,
  p_identifier_hash TEXT,
  p_window_start TIMESTAMP WITH TIME ZONE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO edge_rate_limits (route, identifier_hash, window_start, request_count, updated_at)
  VALUES (p_route, p_identifier_hash, p_window_start, 1, NOW())
  ON CONFLICT (route, identifier_hash, window_start)
  DO UPDATE SET
    request_count = edge_rate_limits.request_count + 1,
    updated_at = NOW()
  RETURNING request_count INTO v_count;

  DELETE FROM edge_rate_limits
  WHERE window_start < NOW() - INTERVAL '2 hours';

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_edge_rate_limit(TEXT, TEXT, TIMESTAMP WITH TIME ZONE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_edge_rate_limit(TEXT, TEXT, TIMESTAMP WITH TIME ZONE) TO service_role;
