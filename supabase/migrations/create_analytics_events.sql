-- ═══════════════════════════════════════════════════════════════════════════
-- TABELA: analytics_events
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Armazena eventos de analytics para tracking e otimização do chat.
-- Permite análise de funil, comportamento do usuário, e métricas de conversão.
--
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'message_sent', 'lead_created', 'conversation_abandoned', 'intent_classified'
  org_id UUID NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  metadata JSONB, -- Dados estruturados do evento: { "intent": "agendar", "sentiment": "desperate", etc }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_date ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_conversation ON analytics_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_org ON analytics_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_metadata ON analytics_events USING gin(metadata);

-- RLS (Row Level Security)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Política: service_role tem acesso total
CREATE POLICY "Service role can do everything on analytics_events"
  ON analytics_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Política: usuários autenticados podem ver events da sua org
CREATE POLICY "Users can view analytics_events from their org"
  ON analytics_events
  FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Comentários
COMMENT ON TABLE analytics_events IS 'Eventos de analytics para tracking e otimização';
COMMENT ON COLUMN analytics_events.event_type IS 'Tipo do evento: message_sent, lead_created, conversation_abandoned, intent_classified';
COMMENT ON COLUMN analytics_events.metadata IS 'Dados estruturados em JSON: intent, sentiment, urgency, etc';

-- Grants
GRANT ALL ON analytics_events TO service_role;
GRANT SELECT ON analytics_events TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERIES ÚTEIS PARA ANÁLISE
-- ═══════════════════════════════════════════════════════════════════════════

-- Ver eventos recentes
-- SELECT * FROM analytics_events
-- WHERE org_id = 'seu-org-id'
-- ORDER BY created_at DESC
-- LIMIT 100;

-- Análise de intents mais comuns
-- SELECT
--   metadata->>'intent' as intent,
--   COUNT(*) as total
-- FROM analytics_events
-- WHERE event_type = 'intent_classified'
--   AND created_at > NOW() - INTERVAL '7 days'
-- GROUP BY metadata->>'intent'
-- ORDER BY total DESC;

-- Taxa de conversão (leads criados / mensagens enviadas)
-- WITH stats AS (
--   SELECT
--     COUNT(DISTINCT conversation_id) FILTER (WHERE event_type = 'message_sent') as conversas,
--     COUNT(*) FILTER (WHERE event_type = 'lead_created') as leads
--   FROM analytics_events
--   WHERE org_id = 'seu-org-id'
--     AND created_at > NOW() - INTERVAL '30 days'
-- )
-- SELECT
--   conversas,
--   leads,
--   ROUND((leads::numeric / NULLIF(conversas, 0)) * 100, 2) as taxa_conversao_pct
-- FROM stats;

-- Sentimentos mais comuns
-- SELECT
--   metadata->>'sentiment' as sentiment,
--   COUNT(*) as total,
--   ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER() * 100, 2) as porcentagem
-- FROM analytics_events
-- WHERE event_type = 'message_sent'
--   AND metadata->>'sentiment' IS NOT NULL
--   AND created_at > NOW() - INTERVAL '7 days'
-- GROUP BY metadata->>'sentiment'
-- ORDER BY total DESC;
