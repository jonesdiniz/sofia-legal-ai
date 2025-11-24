-- ═══════════════════════════════════════════════════════════════════════════
-- TABELA: follow_up_queue
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sistema de recuperação automática de leads.
-- Detecta abandono de conversas promissoras e agenda follow-ups multicanal.
--
-- CASOS DE USO:
-- - Lead quente que parou de responder > 5 minutos
-- - Lead morno que não converteu após 3+ mensagens técnicas
-- - Remarketing inteligente pós-atendimento
--
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS follow_up_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relacionamentos
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,

  -- Agendamento
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'

  -- Canal e mensagem
  channel TEXT NOT NULL, -- 'whatsapp', 'email', 'sms'
  message_template TEXT NOT NULL,
  message_vars JSONB, -- Variáveis para personalização: { "nome": "João", "tipo_caso": "aposentadoria" }

  -- Controle de tentativas
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,

  -- Contexto do abandono
  abandonment_context JSONB, -- { "sentiment": "desperate", "last_intent": "agendar", "messages_count": 5 }

  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICES PARA PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════

-- Para buscar follow-ups prontos para envio
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_ready
  ON follow_up_queue(status, scheduled_at)
  WHERE status = 'pending' AND scheduled_at <= NOW();

-- Para buscar por lead
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_lead
  ON follow_up_queue(lead_id, created_at DESC);

-- Para buscar por org
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_org
  ON follow_up_queue(org_id, status, created_at DESC);

-- Para buscar por conversa
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_conversation
  ON follow_up_queue(conversation_id);

-- Para análise de contexto
CREATE INDEX IF NOT EXISTS idx_follow_up_queue_context
  ON follow_up_queue USING gin(abandonment_context);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS (ROW LEVEL SECURITY)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE follow_up_queue ENABLE ROW LEVEL SECURITY;

-- Política: service_role tem acesso total
CREATE POLICY "Service role can do everything on follow_up_queue"
  ON follow_up_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Política: usuários autenticados podem ver follow-ups da sua org
CREATE POLICY "Users can view follow_up_queue from their org"
  ON follow_up_queue
  FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER PARA UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_follow_up_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_follow_up_queue_updated_at
  BEFORE UPDATE ON follow_up_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_follow_up_queue_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMENTÁRIOS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE follow_up_queue IS 'Fila de follow-ups automáticos para recuperação de leads';
COMMENT ON COLUMN follow_up_queue.status IS 'Status do follow-up: pending, sent, failed, cancelled';
COMMENT ON COLUMN follow_up_queue.channel IS 'Canal de comunicação: whatsapp, email, sms';
COMMENT ON COLUMN follow_up_queue.message_template IS 'Template da mensagem com placeholders {{var}}';
COMMENT ON COLUMN follow_up_queue.message_vars IS 'Variáveis para personalizar o template em JSON';
COMMENT ON COLUMN follow_up_queue.abandonment_context IS 'Contexto emocional e comportamental do abandono';

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT ALL ON follow_up_queue TO service_role;
GRANT SELECT ON follow_up_queue TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERIES ÚTEIS PARA ANÁLISE
-- ═══════════════════════════════════════════════════════════════════════════

-- Ver follow-ups prontos para enviar
-- SELECT * FROM follow_up_queue
-- WHERE status = 'pending'
--   AND scheduled_at <= NOW()
-- ORDER BY scheduled_at ASC
-- LIMIT 50;

-- Taxa de sucesso de follow-ups por canal
-- SELECT
--   channel,
--   COUNT(*) FILTER (WHERE status = 'sent') as enviados,
--   COUNT(*) FILTER (WHERE status = 'failed') as falhas,
--   COUNT(*) FILTER (WHERE status = 'pending') as pendentes,
--   ROUND(
--     COUNT(*) FILTER (WHERE status = 'sent')::numeric /
--     NULLIF(COUNT(*) FILTER (WHERE status IN ('sent', 'failed')), 0) * 100,
--     2
--   ) as taxa_sucesso_pct
-- FROM follow_up_queue
-- WHERE created_at > NOW() - INTERVAL '30 days'
-- GROUP BY channel
-- ORDER BY enviados DESC;

-- Leads recuperados (que responderam após follow-up)
-- WITH follow_ups AS (
--   SELECT
--     fq.lead_id,
--     fq.sent_at,
--     l.nome
--   FROM follow_up_queue fq
--   JOIN leads l ON l.id = fq.lead_id
--   WHERE fq.status = 'sent'
--     AND fq.sent_at > NOW() - INTERVAL '7 days'
-- ),
-- responses AS (
--   SELECT
--     m.conversation_id,
--     m.created_at as response_at
--   FROM messages m
--   WHERE m.actor = 'user'
--     AND m.created_at > NOW() - INTERVAL '7 days'
-- )
-- SELECT
--   f.lead_id,
--   f.nome,
--   f.sent_at,
--   MIN(r.response_at) as first_response_after,
--   EXTRACT(EPOCH FROM (MIN(r.response_at) - f.sent_at))/60 as minutos_ate_resposta
-- FROM follow_ups f
-- JOIN responses r ON r.response_at > f.sent_at
-- WHERE r.response_at < f.sent_at + INTERVAL '24 hours'
-- GROUP BY f.lead_id, f.nome, f.sent_at
-- ORDER BY f.sent_at DESC;

-- Contextos de abandono mais comuns
-- SELECT
--   abandonment_context->>'sentiment' as sentimento,
--   abandonment_context->>'last_intent' as ultima_intencao,
--   (abandonment_context->>'messages_count')::int as num_mensagens,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE status = 'sent') as enviados
-- FROM follow_up_queue
-- WHERE created_at > NOW() - INTERVAL '30 days'
--   AND abandonment_context IS NOT NULL
-- GROUP BY
--   abandonment_context->>'sentiment',
--   abandonment_context->>'last_intent',
--   abandonment_context->>'messages_count'
-- ORDER BY total DESC
-- LIMIT 20;
