-- ═══════════════════════════════════════════════════════════════════════════
-- TABELA: message_feedback
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sistema de feedback para mensagens da Sofia.
-- Permite aos usuários avaliar respostas e criar loop de aprendizado contínuo.
--
-- CASOS DE USO:
-- - Identificar respostas top-rated para reutilizar em RAG
-- - Detectar padrões de respostas ruins para corrigir
-- - Métricas de satisfação do usuário
-- - A/B testing de diferentes abordagens
--
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relacionamentos
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,

  -- Feedback
  feedback_type TEXT NOT NULL, -- 'positive', 'negative'
  rating INT CHECK (rating >= 1 AND rating <= 5), -- Opcional: 1-5 estrelas
  user_comment TEXT, -- Comentário opcional do usuário

  -- Contexto da mensagem avaliada
  message_content TEXT NOT NULL, -- Cópia da mensagem para análise futura
  message_metadata JSONB, -- { "intent": "agendar", "sentiment": "hopeful", "had_rag": true, "chunks_used": 3 }

  -- Categorização (opcional - preenchida manualmente ou por análise posterior)
  feedback_category TEXT, -- 'too_technical', 'not_empathetic', 'perfect', 'missing_info', etc.
  tags TEXT[], -- ['empatia', 'clareza', 'ação-concreta'] ou ['confuso', 'genérico']

  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICES PARA PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════

-- Para buscar feedbacks por tipo
CREATE INDEX IF NOT EXISTS idx_message_feedback_type
  ON message_feedback(feedback_type, created_at DESC);

-- Para buscar por mensagem
CREATE INDEX IF NOT EXISTS idx_message_feedback_message
  ON message_feedback(message_id);

-- Para buscar por conversa
CREATE INDEX IF NOT EXISTS idx_message_feedback_conversation
  ON message_feedback(conversation_id);

-- Para buscar por org
CREATE INDEX IF NOT EXISTS idx_message_feedback_org
  ON message_feedback(org_id, created_at DESC);

-- Para buscar top-rated messages
CREATE INDEX IF NOT EXISTS idx_message_feedback_rating
  ON message_feedback(rating DESC, created_at DESC)
  WHERE rating IS NOT NULL;

-- Para análise de metadata
CREATE INDEX IF NOT EXISTS idx_message_feedback_metadata
  ON message_feedback USING gin(message_metadata);

-- Para buscar por tags
CREATE INDEX IF NOT EXISTS idx_message_feedback_tags
  ON message_feedback USING gin(tags);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS (ROW LEVEL SECURITY)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE message_feedback ENABLE ROW LEVEL SECURITY;

-- Política: service_role tem acesso total
CREATE POLICY "Service role can do everything on message_feedback"
  ON message_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Política: usuários podem ver feedbacks da sua org
CREATE POLICY "Users can view message_feedback from their org"
  ON message_feedback
  FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Política: usuários podem inserir feedbacks (chat público pode enviar feedback)
CREATE POLICY "Users can insert message_feedback"
  ON message_feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER PARA UPDATED_AT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_message_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_feedback_updated_at
  BEFORE UPDATE ON message_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_message_feedback_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMENTÁRIOS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE message_feedback IS 'Feedback de usuários sobre respostas da Sofia para loop de aprendizado';
COMMENT ON COLUMN message_feedback.feedback_type IS 'Tipo de feedback: positive ou negative';
COMMENT ON COLUMN message_feedback.rating IS 'Rating opcional de 1-5 estrelas';
COMMENT ON COLUMN message_feedback.message_content IS 'Cópia da mensagem para análise futura (imutável)';
COMMENT ON COLUMN message_feedback.message_metadata IS 'Contexto da mensagem: intent, sentiment, RAG usado, etc';
COMMENT ON COLUMN message_feedback.feedback_category IS 'Categoria do feedback para análise: too_technical, perfect, etc';
COMMENT ON COLUMN message_feedback.tags IS 'Tags para classificação: [empatia, clareza] ou [confuso, genérico]';

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT ALL ON message_feedback TO service_role;
GRANT SELECT ON message_feedback TO authenticated;
GRANT INSERT ON message_feedback TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERIES ÚTEIS PARA ANÁLISE
-- ═══════════════════════════════════════════════════════════════════════════

-- Top 20 mensagens mais bem avaliadas (para reutilizar em RAG)
-- SELECT
--   mf.message_content,
--   mf.message_metadata->>'intent' as intent,
--   mf.message_metadata->>'sentiment' as sentiment,
--   COUNT(*) FILTER (WHERE mf.feedback_type = 'positive') as positive_count,
--   COUNT(*) FILTER (WHERE mf.feedback_type = 'negative') as negative_count,
--   AVG(mf.rating) as avg_rating,
--   COUNT(*) as total_feedback
-- FROM message_feedback mf
-- WHERE mf.created_at > NOW() - INTERVAL '30 days'
-- GROUP BY mf.message_id, mf.message_content, mf.message_metadata
-- HAVING COUNT(*) FILTER (WHERE mf.feedback_type = 'positive') >= 3
-- ORDER BY positive_count DESC, avg_rating DESC NULLS LAST
-- LIMIT 20;

-- Taxa de satisfação geral
-- SELECT
--   COUNT(*) FILTER (WHERE feedback_type = 'positive') as positivos,
--   COUNT(*) FILTER (WHERE feedback_type = 'negative') as negativos,
--   COUNT(*) as total,
--   ROUND(
--     COUNT(*) FILTER (WHERE feedback_type = 'positive')::numeric /
--     NULLIF(COUNT(*), 0) * 100,
--     2
--   ) as satisfacao_pct,
--   AVG(rating) as rating_medio
-- FROM message_feedback
-- WHERE created_at > NOW() - INTERVAL '7 days';

-- Feedbacks negativos para análise e correção
-- SELECT
--   mf.message_content,
--   mf.user_comment,
--   mf.feedback_category,
--   mf.tags,
--   mf.message_metadata->>'intent' as intent,
--   mf.message_metadata->>'sentiment' as sentiment,
--   mf.created_at
-- FROM message_feedback mf
-- WHERE mf.feedback_type = 'negative'
--   AND mf.created_at > NOW() - INTERVAL '7 days'
-- ORDER BY mf.created_at DESC
-- LIMIT 50;

-- Análise por intent (qual intent tem melhor/pior satisfação?)
-- SELECT
--   mf.message_metadata->>'intent' as intent,
--   COUNT(*) FILTER (WHERE mf.feedback_type = 'positive') as positivos,
--   COUNT(*) FILTER (WHERE mf.feedback_type = 'negative') as negativos,
--   COUNT(*) as total,
--   ROUND(
--     COUNT(*) FILTER (WHERE mf.feedback_type = 'positive')::numeric /
--     NULLIF(COUNT(*), 0) * 100,
--     2
--   ) as satisfacao_pct
-- FROM message_feedback mf
-- WHERE mf.created_at > NOW() - INTERVAL '30 days'
--   AND mf.message_metadata->>'intent' IS NOT NULL
-- GROUP BY mf.message_metadata->>'intent'
-- ORDER BY total DESC;

-- Categorias de feedback mais comuns
-- SELECT
--   feedback_category,
--   feedback_type,
--   COUNT(*) as total,
--   ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER() * 100, 2) as porcentagem
-- FROM message_feedback
-- WHERE feedback_category IS NOT NULL
--   AND created_at > NOW() - INTERVAL '30 days'
-- GROUP BY feedback_category, feedback_type
-- ORDER BY total DESC;

-- Tags mais comuns em feedbacks positivos vs negativos
-- SELECT
--   unnest(tags) as tag,
--   feedback_type,
--   COUNT(*) as ocorrencias
-- FROM message_feedback
-- WHERE tags IS NOT NULL
--   AND created_at > NOW() - INTERVAL '30 days'
-- GROUP BY unnest(tags), feedback_type
-- ORDER BY ocorrencias DESC
-- LIMIT 30;
