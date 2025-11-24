-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add Lead Scoring System
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adiciona sistema de scoring automático de leads baseado em múltiplos sinais:
-- - Engagement (profundidade da conversa)
-- - Urgency (sentiment analysis)
-- - Data Quality (completude dos dados)
-- - Intent (proximidade de conversão)
-- - Timing (horário e tempo de resposta)
--
-- Score final: 0-100
-- Classificação: platinum (90-100), gold (75-89), silver (60-74), bronze (0-59)
-- ═══════════════════════════════════════════════════════════════════════════

-- Adiciona campos de scoring na tabela leads
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{
  "engagement": 0,
  "urgency": 0,
  "data_quality": 0,
  "intent": 0,
  "timing": 0
}'::jsonb,
ADD COLUMN IF NOT EXISTS classification TEXT
  CHECK (classification IN ('platinum', 'gold', 'silver', 'bronze'))
  DEFAULT 'bronze',
ADD COLUMN IF NOT EXISTS score_calculated_at TIMESTAMP WITH TIME ZONE;

-- Índice para buscar leads por score
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC) WHERE status = 'novo';
CREATE INDEX IF NOT EXISTS idx_leads_classification ON leads(classification, created_at DESC);

-- Índice GIN para análise de score_breakdown
CREATE INDEX IF NOT EXISTS idx_leads_score_breakdown ON leads USING GIN (score_breakdown);

-- ═══════════════════════════════════════════════════════════════════════════
-- Função para calcular score de um lead
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_id UUID)
RETURNS TABLE (
  score INTEGER,
  breakdown JSONB,
  classification TEXT
) AS $$
DECLARE
  v_engagement INTEGER := 0;
  v_urgency INTEGER := 0;
  v_data_quality INTEGER := 0;
  v_intent INTEGER := 0;
  v_timing INTEGER := 0;
  v_total_score INTEGER := 0;
  v_classification TEXT;
  v_messages_count INTEGER;
  v_temperatura TEXT;
  v_lead_created_at TIMESTAMP;
  v_has_horario BOOLEAN;
  v_has_canal BOOLEAN;
  v_has_cidade BOOLEAN;
  v_sentiment TEXT;
  v_urgency_level TEXT;
  v_intent_type TEXT;
BEGIN
  -- Busca dados do lead
  SELECT
    l.temperatura,
    l.created_at,
    l.melhor_horario_contato IS NOT NULL AND l.melhor_horario_contato != 'Não informado',
    l.canal_preferido IS NOT NULL AND l.canal_preferido != 'Não informado',
    l.cidade_uf IS NOT NULL AND l.cidade_uf != 'Não informado'
  INTO
    v_temperatura,
    v_lead_created_at,
    v_has_horario,
    v_has_canal,
    v_has_cidade
  FROM leads l
  WHERE l.id = lead_id;

  -- Conta mensagens da conversa
  SELECT COUNT(*)
  INTO v_messages_count
  FROM messages m
  INNER JOIN leads l ON l.conversation_id = m.conversation_id
  WHERE l.id = lead_id;

  -- Busca último evento de analytics para pegar sentiment, urgency, intent
  SELECT
    (ae.metadata->>'sentiment')::TEXT,
    (ae.metadata->>'urgency')::TEXT,
    (ae.metadata->>'intent')::TEXT
  INTO
    v_sentiment,
    v_urgency_level,
    v_intent_type
  FROM analytics_events ae
  INNER JOIN leads l ON l.conversation_id = ae.conversation_id
  WHERE l.id = lead_id
    AND ae.event_type = 'message_sent'
  ORDER BY ae.created_at DESC
  LIMIT 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CÁLCULO 1: ENGAGEMENT (0-25 pontos)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Baseado em profundidade da conversa
  v_engagement := CASE
    WHEN v_messages_count >= 10 THEN 25
    WHEN v_messages_count >= 7 THEN 20
    WHEN v_messages_count >= 5 THEN 15
    WHEN v_messages_count >= 3 THEN 10
    ELSE 5
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CÁLCULO 2: URGENCY (0-25 pontos)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Baseado em sentiment + urgency level
  v_urgency := CASE
    WHEN v_sentiment = 'desperate' THEN 25
    WHEN v_urgency_level = 'high' THEN 22
    WHEN v_sentiment = 'frustrated' AND v_urgency_level = 'medium' THEN 18
    WHEN v_urgency_level = 'medium' THEN 15
    WHEN v_sentiment = 'hopeful' THEN 12
    ELSE 8
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CÁLCULO 3: DATA QUALITY (0-20 pontos)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Baseado em completude dos dados
  v_data_quality := 10; -- Base: nome + whatsapp

  IF v_has_horario THEN v_data_quality := v_data_quality + 4; END IF;
  IF v_has_canal THEN v_data_quality := v_data_quality + 3; END IF;
  IF v_has_cidade THEN v_data_quality := v_data_quality + 3; END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CÁLCULO 4: INTENT (0-20 pontos)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Baseado em proximidade de conversão
  v_intent := CASE
    WHEN v_intent_type = 'agendar' THEN 20
    WHEN v_intent_type = 'urgente' THEN 18
    WHEN v_intent_type = 'preco' THEN 15
    WHEN v_intent_type = 'documentos' THEN 12
    WHEN v_intent_type = 'duvida_tecnica' THEN 10
    ELSE 5
  END;

  -- ═══════════════════════════════════════════════════════════════════════
  -- CÁLCULO 5: TIMING (0-10 pontos)
  -- ═══════════════════════════════════════════════════════════════════════
  -- Baseado em temperatura e tempo desde criação
  v_timing := CASE
    WHEN v_temperatura = 'quente' THEN 10
    WHEN v_temperatura = 'morno' THEN 7
    ELSE 4
  END;

  -- Penaliza se lead foi criado há muito tempo (resfriou)
  IF EXTRACT(EPOCH FROM (NOW() - v_lead_created_at)) > 3600 THEN -- > 1 hora
    v_timing := v_timing - 3;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- SCORE FINAL (0-100)
  -- ═══════════════════════════════════════════════════════════════════════
  v_total_score := v_engagement + v_urgency + v_data_quality + v_intent + v_timing;

  -- Garante que está no range 0-100
  v_total_score := GREATEST(0, LEAST(100, v_total_score));

  -- Classifica lead
  v_classification := CASE
    WHEN v_total_score >= 90 THEN 'platinum'
    WHEN v_total_score >= 75 THEN 'gold'
    WHEN v_total_score >= 60 THEN 'silver'
    ELSE 'bronze'
  END;

  -- Retorna resultado
  RETURN QUERY SELECT
    v_total_score,
    jsonb_build_object(
      'engagement', v_engagement,
      'urgency', v_urgency,
      'data_quality', v_data_quality,
      'intent', v_intent,
      'timing', v_timing
    ),
    v_classification;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- Função para atualizar score de um lead
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_lead_score(lead_id UUID)
RETURNS VOID AS $$
DECLARE
  v_score INTEGER;
  v_breakdown JSONB;
  v_classification TEXT;
BEGIN
  -- Calcula score
  SELECT * INTO v_score, v_breakdown, v_classification
  FROM calculate_lead_score(lead_id);

  -- Atualiza lead
  UPDATE leads
  SET
    score = v_score,
    score_breakdown = v_breakdown,
    classification = v_classification,
    score_calculated_at = NOW(),
    updated_at = NOW()
  WHERE id = lead_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- View: Leads Priorizados por Score
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW leads_prioritized AS
SELECT
  l.id,
  l.nome,
  l.whatsapp,
  l.tipo_caso,
  l.temperatura,
  l.score,
  l.classification,
  l.score_breakdown,
  l.created_at,
  l.score_calculated_at,
  COUNT(DISTINCT m.id) as messages_count,
  MAX(m.created_at) as last_message_at
FROM leads l
LEFT JOIN messages m ON m.conversation_id = l.conversation_id
WHERE l.status = 'novo'
GROUP BY l.id, l.nome, l.whatsapp, l.tipo_caso, l.temperatura, l.score,
         l.classification, l.score_breakdown, l.created_at, l.score_calculated_at
ORDER BY l.score DESC, l.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Comentários para documentação
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON COLUMN leads.score IS 'Score automático de qualidade do lead (0-100)';
COMMENT ON COLUMN leads.score_breakdown IS 'Detalhamento do score: engagement, urgency, data_quality, intent, timing';
COMMENT ON COLUMN leads.classification IS 'Classificação do lead: platinum, gold, silver, bronze';
COMMENT ON COLUMN leads.score_calculated_at IS 'Última vez que o score foi calculado';

COMMENT ON FUNCTION calculate_lead_score IS 'Calcula score de um lead baseado em múltiplos sinais comportamentais';
COMMENT ON FUNCTION update_lead_score IS 'Atualiza o score de um lead na tabela';
COMMENT ON VIEW leads_prioritized IS 'View com leads ordenados por score para priorização de follow-up';
