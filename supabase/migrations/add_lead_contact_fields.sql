-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Adicionar campos de contato e localização na tabela leads
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adiciona 3 novos campos opcionais para melhorar a qualificação de leads:
-- - melhor_horario_contato: Horário preferido para contato
-- - canal_preferido: Canal de comunicação preferido (WhatsApp, Ligação, etc)
-- - cidade_uf: Localização do lead (cidade e estado)
--
-- ═══════════════════════════════════════════════════════════════════════════

-- Adicionar novas colunas à tabela leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS melhor_horario_contato TEXT,
  ADD COLUMN IF NOT EXISTS canal_preferido TEXT,
  ADD COLUMN IF NOT EXISTS cidade_uf TEXT;

-- Comentários nas novas colunas
COMMENT ON COLUMN leads.melhor_horario_contato IS 'Horário preferido para contato (ex: "Manhã", "Tarde entre 14h-16h", "Após 18h")';
COMMENT ON COLUMN leads.canal_preferido IS 'Canal de comunicação preferido (ex: "WhatsApp", "Ligação", "Qualquer um")';
COMMENT ON COLUMN leads.cidade_uf IS 'Localização do lead (ex: "São Paulo - SP", "Rio de Janeiro - RJ")';

-- ═══════════════════════════════════════════════════════════════════════════
-- QUERIES ÚTEIS PARA TESTES
-- ═══════════════════════════════════════════════════════════════════════════

-- Ver leads com informações de contato completas
-- SELECT
--   id,
--   nome,
--   whatsapp,
--   melhor_horario_contato,
--   canal_preferido,
--   cidade_uf,
--   temperatura,
--   created_at
-- FROM leads
-- WHERE melhor_horario_contato IS NOT NULL
--   OR canal_preferido IS NOT NULL
--   OR cidade_uf IS NOT NULL
-- ORDER BY created_at DESC;

-- Estatísticas de leads por canal preferido
-- SELECT
--   canal_preferido,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE temperatura = 'quente') as quentes
-- FROM leads
-- WHERE canal_preferido IS NOT NULL
-- GROUP BY canal_preferido
-- ORDER BY total DESC;
