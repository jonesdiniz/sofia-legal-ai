-- ═══════════════════════════════════════════════════════════════════════════
-- TABELA: leads
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Armazena leads capturados durante conversas com a Sofia.
-- Um lead é criado quando a Sofia identifica que o usuário tem interesse
-- em contratar os serviços do escritório.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- Criar tipo ENUM para temperatura do lead
CREATE TYPE lead_temperatura AS ENUM ('frio', 'morno', 'quente');

-- Criar tipo ENUM para status do lead
CREATE TYPE lead_status AS ENUM (
  'novo',
  'em_contato',
  'consulta_agendada',
  'convertido',
  'nao_convertido'
);

-- Criar tabela leads
CREATE TABLE IF NOT EXISTS leads (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  client_id TEXT,

  -- Dados do lead
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  tipo_caso TEXT NOT NULL, -- Ex: "Aposentadoria por Idade", "Revisão de Benefício"
  situacao_atual TEXT, -- Ex: "Já solicitou no INSS mas foi negado"
  descricao_resumida TEXT, -- Resumo do caso em texto livre

  -- Classificação
  temperatura lead_temperatura DEFAULT 'morno',
  status lead_status DEFAULT 'novo',

  -- Metadados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_org_id ON leads(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_conversation_id ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_temperatura ON leads(temperatura);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_leads_updated_at();

-- RLS (Row Level Security) - Ajustar conforme suas políticas
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Política básica: service_role tem acesso total
CREATE POLICY "Service role can do everything on leads"
  ON leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Política: usuários autenticados podem ver leads da sua org
CREATE POLICY "Users can view leads from their org"
  ON leads
  FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT org_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Comentários na tabela
COMMENT ON TABLE leads IS 'Leads capturados durante conversas com a Sofia';
COMMENT ON COLUMN leads.temperatura IS 'Classificação do interesse: frio (baixo), morno (médio), quente (alto)';
COMMENT ON COLUMN leads.status IS 'Status do funil de vendas';
COMMENT ON COLUMN leads.tipo_caso IS 'Tipo de caso previdenciário (ex: Aposentadoria, Revisão, Pensão)';
COMMENT ON COLUMN leads.situacao_atual IS 'Situação atual do cliente (contexto do caso)';
COMMENT ON COLUMN leads.descricao_resumida IS 'Resumo do caso/necessidade do cliente';

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS (ajustar conforme necessário)
-- ═══════════════════════════════════════════════════════════════════════════

-- Service role precisa de acesso total
GRANT ALL ON leads TO service_role;

-- Autenticados podem ler (INSERT será controlado por RLS específico se necessário)
GRANT SELECT ON leads TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERIES ÚTEIS PARA TESTES
-- ═══════════════════════════════════════════════════════════════════════════

-- Ver todos os leads de uma organização
-- SELECT * FROM leads WHERE org_id = 'seu-org-id' ORDER BY created_at DESC;

-- Ver leads quentes não convertidos
-- SELECT * FROM leads
-- WHERE temperatura = 'quente'
--   AND status NOT IN ('convertido', 'nao_convertido')
-- ORDER BY created_at DESC;

-- Estatísticas de conversão por temperatura
-- SELECT
--   temperatura,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE status = 'convertido') as convertidos,
--   ROUND(COUNT(*) FILTER (WHERE status = 'convertido')::numeric / COUNT(*) * 100, 2) as taxa_conversao
-- FROM leads
-- GROUP BY temperatura;
