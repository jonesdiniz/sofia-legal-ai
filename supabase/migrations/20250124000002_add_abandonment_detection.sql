-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add Proactive Abandonment Detection System
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sistema de detecção de risco de abandono DURANTE a conversa
-- (não apenas DEPOIS de abandonar)
--
-- Sinais de abandono iminente:
-- - Respostas ficando mais curtas
-- - Tempo entre mensagens aumentando
-- - Mudança de sentimento (hopeful → frustrated)
-- - Perguntas sobre preço sem conclusão
-- - Múltiplas dúvidas sem conversão
--
-- Risk levels: high, medium, low
-- ═══════════════════════════════════════════════════════════════════════════

-- Tabela para armazenar análises de risco de abandono
CREATE TABLE IF NOT EXISTS abandonment_risk_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('high', 'medium', 'low')),
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  triggers JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de strings com sinais detectados
  context JSONB, -- Contexto adicional para análise
  recommended_action TEXT, -- "offer_scheduling", "reduce_friction", "continue_normal"
  action_taken BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_abandonment_conversation
  ON abandonment_risk_analysis(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abandonment_risk_level
  ON abandonment_risk_analysis(risk_level, created_at DESC)
  WHERE action_taken = FALSE;
CREATE INDEX IF NOT EXISTS idx_abandonment_triggers
  ON abandonment_risk_analysis USING GIN (triggers);

-- ═══════════════════════════════════════════════════════════════════════════
-- Função para detectar risco de abandono
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION detect_abandonment_risk(conv_id UUID)
RETURNS TABLE (
  risk_level TEXT,
  risk_score INTEGER,
  triggers JSONB,
  recommended_action TEXT
) AS $$
DECLARE
  v_risk_score INTEGER := 0;
  v_triggers TEXT[] := ARRAY[]::TEXT[];
  v_risk_level TEXT;
  v_recommended_action TEXT;
  v_messages_count INTEGER;
  v_user_messages_count INTEGER;
  v_avg_user_message_length NUMERIC;
  v_recent_avg_length NUMERIC;
  v_time_since_last_message INTERVAL;
  v_sentiment_changes INTEGER;
  v_last_sentiment TEXT;
  v_prev_sentiment TEXT;
  v_has_price_question BOOLEAN;
  v_has_conversion_intent BOOLEAN;
BEGIN
  -- Conta total de mensagens
  SELECT COUNT(*) INTO v_messages_count
  FROM messages WHERE conversation_id = conv_id;

  -- Se conversa muito curta, não há risco ainda
  IF v_messages_count < 4 THEN
    RETURN QUERY SELECT 'low'::TEXT, 0::INTEGER, '[]'::JSONB, 'continue_normal'::TEXT;
    RETURN;
  END IF;

  -- Conta mensagens do usuário
  SELECT COUNT(*) INTO v_user_messages_count
  FROM messages WHERE conversation_id = conv_id AND actor = 'user';

  -- ═══════════════════════════════════════════════════════════════════════
  -- SINAL 1: Respostas ficando mais curtas (engagement dropping)
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT AVG(LENGTH(content))
  INTO v_avg_user_message_length
  FROM messages
  WHERE conversation_id = conv_id AND actor = 'user';

  -- Comprimento médio das últimas 2 mensagens
  SELECT AVG(LENGTH(content))
  INTO v_recent_avg_length
  FROM (
    SELECT content FROM messages
    WHERE conversation_id = conv_id AND actor = 'user'
    ORDER BY created_at DESC
    LIMIT 2
  ) recent;

  IF v_recent_avg_length < (v_avg_user_message_length * 0.6) THEN
    v_risk_score := v_risk_score + 20;
    v_triggers := array_append(v_triggers, 'shorter_responses');
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SINAL 2: Tempo desde última mensagem aumentando
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT NOW() - MAX(created_at)
  INTO v_time_since_last_message
  FROM messages
  WHERE conversation_id = conv_id AND actor = 'user';

  IF EXTRACT(EPOCH FROM v_time_since_last_message) > 180 THEN -- > 3 minutos
    v_risk_score := v_risk_score + 25;
    v_triggers := array_append(v_triggers, 'delayed_response');
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SINAL 3: Mudança de sentimento (hopeful → frustrated)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Busca últimos 2 sentimentos detectados
  SELECT
    (ae.metadata->>'sentiment')::TEXT
  INTO v_last_sentiment
  FROM analytics_events ae
  WHERE ae.conversation_id = conv_id
    AND ae.event_type = 'message_sent'
    AND ae.metadata->>'sentiment' IS NOT NULL
  ORDER BY ae.created_at DESC
  LIMIT 1;

  SELECT
    (ae.metadata->>'sentiment')::TEXT
  INTO v_prev_sentiment
  FROM analytics_events ae
  WHERE ae.conversation_id = conv_id
    AND ae.event_type = 'message_sent'
    AND ae.metadata->>'sentiment' IS NOT NULL
  ORDER BY ae.created_at DESC
  LIMIT 1 OFFSET 1;

  IF v_prev_sentiment IN ('hopeful', 'neutral') AND v_last_sentiment = 'frustrated' THEN
    v_risk_score := v_risk_score + 30;
    v_triggers := array_append(v_triggers, 'sentiment_deterioration');
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SINAL 4: Pergunta sobre preço sem conclusão
  -- ═══════════════════════════════════════════════════════════════════════
  SELECT EXISTS(
    SELECT 1 FROM analytics_events ae
    WHERE ae.conversation_id = conv_id
      AND ae.event_type = 'message_sent'
      AND ae.metadata->>'intent' = 'preco'
  ) INTO v_has_price_question;

  SELECT EXISTS(
    SELECT 1 FROM analytics_events ae
    WHERE ae.conversation_id = conv_id
      AND ae.event_type = 'message_sent'
      AND ae.metadata->>'intent' IN ('agendar', 'urgente')
  ) INTO v_has_conversion_intent;

  IF v_has_price_question AND NOT v_has_conversion_intent AND v_user_messages_count >= 3 THEN
    v_risk_score := v_risk_score + 15;
    v_triggers := array_append(v_triggers, 'price_question_without_conversion');
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SINAL 5: Muitas dúvidas técnicas sem avançar para conversão
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_user_messages_count >= 5 AND NOT v_has_conversion_intent THEN
    v_risk_score := v_risk_score + 10;
    v_triggers := array_append(v_triggers, 'multiple_questions_no_conversion');
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- Calcula risk level e ação recomendada
  -- ═══════════════════════════════════════════════════════════════════════
  IF v_risk_score >= 50 THEN
    v_risk_level := 'high';
    v_recommended_action := 'offer_scheduling'; -- Sofia oferece agendamento direto
  ELSIF v_risk_score >= 25 THEN
    v_risk_level := 'medium';
    v_recommended_action := 'reduce_friction'; -- Reduz barreira ("É rápido...")
  ELSE
    v_risk_level := 'low';
    v_recommended_action := 'continue_normal'; -- Continua normal
  END IF;

  -- Retorna análise
  RETURN QUERY SELECT
    v_risk_level,
    v_risk_score,
    array_to_json(v_triggers)::JSONB,
    v_recommended_action;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- Função para registrar análise de risco
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION save_abandonment_risk_analysis(
  conv_id UUID,
  o_id UUID,
  r_level TEXT,
  r_score INTEGER,
  trigs JSONB,
  ctx JSONB,
  action TEXT
)
RETURNS UUID AS $$
DECLARE
  v_analysis_id UUID;
BEGIN
  INSERT INTO abandonment_risk_analysis (
    conversation_id,
    org_id,
    risk_level,
    risk_score,
    triggers,
    context,
    recommended_action,
    action_taken
  )
  VALUES (
    conv_id,
    o_id,
    r_level,
    r_score,
    trigs,
    ctx,
    action,
    FALSE
  )
  RETURNING id INTO v_analysis_id;

  RETURN v_analysis_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- View: Conversas com Alto Risco de Abandono
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW high_risk_conversations AS
SELECT
  ara.id as analysis_id,
  ara.conversation_id,
  ara.risk_level,
  ara.risk_score,
  ara.triggers,
  ara.recommended_action,
  ara.created_at as analyzed_at,
  c.org_id,
  c.client_id,
  COUNT(DISTINCT m.id) as messages_count,
  MAX(m.created_at) as last_message_at,
  l.id as lead_id,
  l.nome as lead_name,
  l.temperatura as lead_temperature,
  l.score as lead_score
FROM abandonment_risk_analysis ara
INNER JOIN conversations c ON c.id = ara.conversation_id
LEFT JOIN messages m ON m.conversation_id = c.id
LEFT JOIN leads l ON l.conversation_id = c.id
WHERE ara.action_taken = FALSE
  AND ara.risk_level IN ('high', 'medium')
  AND ara.created_at > NOW() - INTERVAL '1 hour'
GROUP BY
  ara.id, ara.conversation_id, ara.risk_level, ara.risk_score,
  ara.triggers, ara.recommended_action, ara.created_at,
  c.org_id, c.client_id, l.id, l.nome, l.temperatura, l.score
ORDER BY ara.risk_score DESC, ara.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Comentários
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE abandonment_risk_analysis IS 'Análises de risco de abandono durante conversas ativas';
COMMENT ON COLUMN abandonment_risk_analysis.risk_level IS 'Nível de risco: high, medium, low';
COMMENT ON COLUMN abandonment_risk_analysis.risk_score IS 'Score numérico de risco (0-100)';
COMMENT ON COLUMN abandonment_risk_analysis.triggers IS 'Array de sinais detectados que indicam risco';
COMMENT ON COLUMN abandonment_risk_analysis.recommended_action IS 'Ação recomendada: offer_scheduling, reduce_friction, continue_normal';
COMMENT ON COLUMN abandonment_risk_analysis.action_taken IS 'Se a ação recomendada já foi executada';

COMMENT ON FUNCTION detect_abandonment_risk IS 'Detecta risco de abandono baseado em sinais comportamentais durante a conversa';
COMMENT ON VIEW high_risk_conversations IS 'Conversas com alto risco de abandono que precisam de intervenção';
