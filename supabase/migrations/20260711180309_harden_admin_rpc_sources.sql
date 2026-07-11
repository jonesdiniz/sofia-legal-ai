-- Dashboard RPCs execute as the caller. Limit their source tables to the
-- explicit Sofia administrator while Edge Functions continue via service_role.

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandonment_risk_analysis ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.conversations,
  public.messages,
  public.leads,
  public.abandonment_risk_analysis
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.conversations,
  public.messages,
  public.leads,
  public.abandonment_risk_analysis
TO authenticated;

CREATE POLICY "Sofia admin restriction for conversations"
  ON public.conversations AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

CREATE POLICY "Sofia admin restriction for messages"
  ON public.messages AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.leads;
CREATE POLICY "Sofia admin can read leads"
  ON public.leads FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

CREATE POLICY "Sofia admin can read abandonment analysis"
  ON public.abandonment_risk_analysis FOR SELECT TO authenticated
  USING ((SELECT private.is_sofia_admin()));

REVOKE EXECUTE ON FUNCTION public.get_current_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_org_id() TO authenticated, service_role;
