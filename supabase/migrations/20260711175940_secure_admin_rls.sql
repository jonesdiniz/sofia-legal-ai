-- Keep the admin dashboards functional without exposing raw operational data
-- to every authenticated account. A recreated project fails closed unless it
-- has exactly one existing user or an admin is granted explicitly.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS private.sofia_admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE private.sofia_admin_users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE private.sofia_admin_users TO service_role;

INSERT INTO private.sofia_admin_users (user_id)
SELECT id
FROM auth.users
WHERE (SELECT COUNT(*) FROM auth.users) = 1
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.is_sofia_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.sofia_admin_users
    WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION private.is_sofia_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_sofia_admin() TO authenticated, service_role;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedding_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sofia admins can read alerts"
  ON public.alerts FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

CREATE POLICY "Sofia admins can read analytics events"
  ON public.analytics_events FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

CREATE POLICY "Sofia admins can read embedding cache"
  ON public.embedding_cache FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

CREATE POLICY "Sofia admins can read experiment assignments"
  ON public.experiment_assignments FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

CREATE POLICY "Sofia admins can read experiments"
  ON public.experiments FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

CREATE POLICY "Sofia admins can read health checks"
  ON public.health_checks FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

CREATE POLICY "Sofia admins can read OpenAI usage"
  ON public.openai_usage FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

GRANT SELECT ON TABLE
  public.alerts,
  public.analytics_events,
  public.embedding_cache,
  public.experiment_assignments,
  public.experiments,
  public.health_checks,
  public.openai_usage
TO authenticated;

ALTER FUNCTION public.get_health_metrics(INTERVAL) SECURITY INVOKER;
ALTER FUNCTION public.get_unresolved_alerts() SECURITY INVOKER;
ALTER FUNCTION public.get_dashboard_kpis(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY INVOKER;
ALTER FUNCTION public.get_conversion_funnel(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY INVOKER;
ALTER FUNCTION public.get_intent_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY INVOKER;
ALTER FUNCTION public.get_sentiment_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY INVOKER;
ALTER FUNCTION public.get_conversion_timeline(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, UUID) SECURITY INVOKER;
ALTER FUNCTION public.get_lead_score_distribution(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY INVOKER;
ALTER FUNCTION public.get_abandonment_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) SECURITY INVOKER;

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
