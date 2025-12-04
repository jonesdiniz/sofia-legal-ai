-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: A/B Testing Framework (CORRIGIDO)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sistema completo de testes A/B para otimização científica da Sofia
-- Permite testar variações de prompts, features e configurações
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABELA DE EXPERIMENTOS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT,
  variant_a JSONB NOT NULL,
  variant_b JSONB NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE,
  target_sample_size INT DEFAULT 100,
  status TEXT DEFAULT 'draft',
  results JSONB,
  winner TEXT,
  confidence_level NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID,

  CONSTRAINT valid_status CHECK (status IN ('draft', 'running', 'completed', 'paused')),
  CONSTRAINT valid_winner CHECK (winner IS NULL OR winner IN ('A', 'B', 'no_difference'))
);

CREATE INDEX idx_experiments_org_id ON experiments(org_id);
CREATE INDEX idx_experiments_status ON experiments(status);
CREATE INDEX idx_experiments_dates ON experiments(start_date, end_date);

COMMENT ON TABLE experiments IS 'Experimentos A/B para testar variações de configuração da Sofia';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TABELA DE ATRIBUIÇÕES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_variant CHECK (variant IN ('A', 'B')),
  CONSTRAINT unique_assignment UNIQUE (experiment_id, conversation_id)
);

CREATE INDEX idx_experiment_assignments_experiment ON experiment_assignments(experiment_id);
CREATE INDEX idx_experiment_assignments_conversation ON experiment_assignments(conversation_id);
CREATE INDEX idx_experiment_assignments_variant ON experiment_assignments(experiment_id, variant);

COMMENT ON TABLE experiment_assignments IS 'Atribuição de conversas a variantes de experimentos A/B';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. FUNCTION: Atribuir Variante (CORRIGIDO)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assign_experiment_variant(
  p_experiment_id UUID,
  p_conversation_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_variant TEXT;
  v_experiment_status TEXT;
  v_count_a INT;
  v_count_b INT;
BEGIN
  SELECT status INTO v_experiment_status
  FROM experiments
  WHERE id = p_experiment_id;

  IF v_experiment_status IS NULL THEN
    RAISE EXCEPTION 'Experimento não encontrado: %', p_experiment_id;
  END IF;

  IF v_experiment_status != 'running' THEN
    RAISE EXCEPTION 'Experimento não está ativo (status: %)', v_experiment_status;
  END IF;

  SELECT variant INTO v_variant
  FROM experiment_assignments
  WHERE experiment_id = p_experiment_id
    AND conversation_id = p_conversation_id;

  IF v_variant IS NOT NULL THEN
    RETURN v_variant;
  END IF;

  -- Conta atribuições atuais (CORRIGIDO)
  SELECT
    COUNT(*) FILTER (WHERE variant = 'A'),
    COUNT(*) FILTER (WHERE variant = 'B')
  INTO v_count_a, v_count_b
  FROM experiment_assignments
  WHERE experiment_id = p_experiment_id;

  -- Atribui variante com balanceamento
  IF v_count_b > v_count_a THEN
    v_variant := 'A';
  ELSIF v_count_a > v_count_b THEN
    v_variant := 'B';
  ELSE
    v_variant := CASE WHEN random() < 0.5 THEN 'A' ELSE 'B' END;
  END IF;

  INSERT INTO experiment_assignments (experiment_id, conversation_id, variant)
  VALUES (p_experiment_id, p_conversation_id, v_variant);

  RETURN v_variant;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION assign_experiment_variant IS 'Atribui uma variante (A ou B) para uma conversa com balanceamento 50/50';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FUNCTION: Obter Configuração
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_experiment_config(
  p_experiment_id UUID,
  p_conversation_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_variant TEXT;
  v_config JSONB;
BEGIN
  SELECT variant INTO v_variant
  FROM experiment_assignments
  WHERE experiment_id = p_experiment_id
    AND conversation_id = p_conversation_id;

  IF v_variant IS NULL THEN
    RAISE EXCEPTION 'Conversa % não foi atribuída ao experimento %', p_conversation_id, p_experiment_id;
  END IF;

  SELECT
    CASE v_variant
      WHEN 'A' THEN variant_a
      WHEN 'B' THEN variant_b
    END INTO v_config
  FROM experiments
  WHERE id = p_experiment_id;

  RETURN v_config;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_experiment_config IS 'Retorna a configuração da variante atribuída';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. FUNCTION: Calcular Resultados
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_experiment_results(
  p_experiment_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_results JSONB;
BEGIN
  WITH variant_metrics AS (
    SELECT
      ea.variant,
      COUNT(DISTINCT ea.conversation_id) as conversations_count,
      COUNT(DISTINCT l.id) as leads_count,
      ROUND(
        (COUNT(DISTINCT l.id)::NUMERIC / NULLIF(COUNT(DISTINCT ea.conversation_id), 0)::NUMERIC) * 100,
        2
      ) as conversion_rate,
      ROUND(AVG(l.score), 2) as avg_lead_score,
      COUNT(*) FILTER (WHERE l.classification = 'platinum') as platinum_count
    FROM experiment_assignments ea
    LEFT JOIN leads l ON l.conversation_id = ea.conversation_id
    WHERE ea.experiment_id = p_experiment_id
    GROUP BY ea.variant
  )
  SELECT jsonb_build_object(
    'variant_a', (
      SELECT jsonb_build_object(
        'conversations', conversations_count,
        'leads', leads_count,
        'conversion_rate', conversion_rate,
        'avg_lead_score', COALESCE(avg_lead_score, 0),
        'platinum_leads', platinum_count
      )
      FROM variant_metrics WHERE variant = 'A'
    ),
    'variant_b', (
      SELECT jsonb_build_object(
        'conversations', conversations_count,
        'leads', leads_count,
        'conversion_rate', conversion_rate,
        'avg_lead_score', COALESCE(avg_lead_score, 0),
        'platinum_leads', platinum_count
      )
      FROM variant_metrics WHERE variant = 'B'
    ),
    'calculated_at', NOW()
  ) INTO v_results;

  UPDATE experiments
  SET
    results = v_results,
    updated_at = NOW()
  WHERE id = p_experiment_id;

  RETURN v_results;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_experiment_results IS 'Calcula resultados do experimento';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. FUNCTION: Listar Experimentos Ativos
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_active_experiments(
  p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  experiment_id UUID,
  name TEXT,
  description TEXT,
  variant_a JSONB,
  variant_b JSONB,
  start_date TIMESTAMP WITH TIME ZONE,
  assignments_count_a BIGINT,
  assignments_count_b BIGINT,
  target_sample_size INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.description,
    e.variant_a,
    e.variant_b,
    e.start_date,
    COUNT(*) FILTER (WHERE ea.variant = 'A') as assignments_count_a,
    COUNT(*) FILTER (WHERE ea.variant = 'B') as assignments_count_b,
    e.target_sample_size
  FROM experiments e
  LEFT JOIN experiment_assignments ea ON ea.experiment_id = e.id
  WHERE e.status = 'running'
    AND (p_org_id IS NULL OR e.org_id = p_org_id)
  GROUP BY e.id
  ORDER BY e.start_date DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_experiments IS 'Lista experimentos ativos';

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON experiments TO authenticated, anon;
GRANT SELECT, INSERT ON experiment_assignments TO authenticated, anon;

GRANT EXECUTE ON FUNCTION assign_experiment_variant TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_experiment_config TO authenticated, anon;
GRANT EXECUTE ON FUNCTION calculate_experiment_results TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_active_experiments TO authenticated, anon;
