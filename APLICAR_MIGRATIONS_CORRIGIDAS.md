# 🔧 APLICAR MIGRATIONS CORRIGIDAS

## ⚠️ IMPORTANTE: Aplicar apenas as migrations 2 e 3 corrigidas

Você já aplicou com sucesso:
- ✅ Migration 1: Analytics Dashboard
- ✅ Migration 4: Cost Tracking

Agora vamos corrigir as migrations 2 e 3 que tiveram erros.

---

## 📋 ORDEM DE APLICAÇÃO

### ✅ Migration 2: A/B Testing Framework (CORRIGIDA)

**Arquivo:** `MIGRATION_02_AB_TESTING_CORRIGIDA.sql`

**O que foi corrigido:**
- ❌ Erro na linha 104: "count" is not a known variable
- ✅ Corrigido: Removida CTE desnecessária, usado SELECT direto com INTO

**Como aplicar:**
1. Acesse **Supabase Dashboard** → **SQL Editor**
2. Abra o arquivo `MIGRATION_02_AB_TESTING_CORRIGIDA.sql` no seu projeto
3. Copie **TODO** o conteúdo (Ctrl+A, Ctrl+C)
4. Cole no SQL Editor do Supabase
5. Clique em **RUN**
6. Aguarde: "Success. No rows returned" ✅

**Testar se funcionou:**
```sql
-- Teste 1: Verificar tabelas criadas
SELECT * FROM experiments;
-- Deve retornar tabela vazia (OK)

SELECT * FROM experiment_assignments;
-- Deve retornar tabela vazia (OK)

-- Teste 2: Verificar functions existem
SELECT proname
FROM pg_proc
WHERE proname LIKE '%experiment%';
-- Deve retornar:
-- assign_experiment_variant
-- get_experiment_config
-- calculate_experiment_results
-- get_active_experiments
```

---

### ✅ Migration 3: Health Monitoring (CORRIGIDA)

**Arquivo:** `MIGRATION_03_HEALTH_MONITORING_CORRIGIDA.sql`

**O que foi corrigido:**
- ❌ Erro: function round(double precision, integer) does not exist
- ✅ Corrigido: Adicionados casts explícitos `::NUMERIC` antes de usar `ROUND()`
- ✅ Adicionados `COALESCE()` para evitar NULLs

**Como aplicar:**

**⚠️ ATENÇÃO:** Como você já aplicou a migration 3 com sucesso (mas as functions têm erro), você precisa RECRIAR as functions. Você tem 2 opções:

#### Opção A: Aplicar migration completa novamente (RECOMENDADO)

A migration usa `CREATE OR REPLACE FUNCTION`, então pode aplicar novamente sem problema:

1. Acesse **Supabase Dashboard** → **SQL Editor**
2. Abra o arquivo `MIGRATION_03_HEALTH_MONITORING_CORRIGIDA.sql`
3. Copie **TODO** o conteúdo (Ctrl+A, Ctrl+C)
4. Cole no SQL Editor do Supabase
5. Clique em **RUN**
6. Aguarde: "Success. No rows returned" ✅

#### Opção B: Dropar e recriar apenas as functions (alternativa)

Se preferir, pode dropar as functions antigas e criar as novas:

```sql
-- Dropar functions antigas
DROP FUNCTION IF EXISTS get_health_metrics CASCADE;
DROP FUNCTION IF EXISTS run_health_check CASCADE;
DROP FUNCTION IF EXISTS get_unresolved_alerts CASCADE;

-- Depois aplique a migration completa normalmente
```

**Testar se funcionou:**
```sql
-- Teste 1: Verificar tabelas criadas
SELECT * FROM health_checks;
-- Deve retornar tabela vazia (OK)

SELECT * FROM alerts;
-- Deve retornar tabela vazia (OK)

-- Teste 2: Testar função get_health_metrics
SELECT * FROM get_health_metrics('24 hours'::INTERVAL);
-- Deve retornar 1 linha com métricas (uptime, error_rate, etc)
-- Valores podem ser 0 ou NULL inicialmente (normal)

-- Teste 3: Testar função run_health_check
SELECT * FROM run_health_check();
-- Deve retornar JSON com status do health check

-- Teste 4: Verificar alertas gerados (se houver problemas)
SELECT * FROM get_unresolved_alerts();
-- Pode retornar vazio (OK - significa que está tudo saudável)
```

---

## ✅ CHECKLIST DE SUCESSO

Depois de aplicar as 2 migrations corrigidas:

- [ ] Migration 2 aplicada sem erros
- [ ] Teste da Migration 2 passou (tabelas + functions existem)
- [ ] Migration 3 aplicada sem erros
- [ ] Teste da Migration 3 passou (get_health_metrics retorna dados)
- [ ] Todas as 4 migrations agora estão OK ✅

---

## 🎯 RESULTADO ESPERADO

Depois de aplicar as correções, você terá:

### ✅ Migration 1: Analytics Dashboard
- 9 RPC functions funcionando
- Dashboard `/analytics` pronto

### ✅ Migration 2: A/B Testing Framework (CORRIGIDA)
- Tabelas: `experiments`, `experiment_assignments`
- 4 RPC functions: assign, get_config, calculate, list

### ✅ Migration 3: Health Monitoring (CORRIGIDA)
- Tabelas: `health_checks`, `alerts`
- 3 RPC functions: get_metrics, run_check, get_alerts

### ✅ Migration 4: Cost Tracking
- Tabelas: `openai_usage`, `embedding_cache`
- 5 RPC functions: calculate_cost, analysis, etc

---

## 🐛 TROUBLESHOOTING

### Problema: "relation already exists"

**Solução:** Isso é OK! As tabelas já foram criadas. As functions serão recriadas com `CREATE OR REPLACE`.

### Problema: Ainda dá erro no get_health_metrics

**Solução:**
1. Verifique se aplicou a versão CORRIGIDA
2. Drope a function antiga:
   ```sql
   DROP FUNCTION get_health_metrics CASCADE;
   ```
3. Aplique a migration corrigida novamente

### Problema: "function does not exist" ao testar

**Solução:** A function não foi criada. Verifique:
1. Se a migration rodou sem erros
2. Se o output mostrou "Success"
3. Liste as functions:
   ```sql
   SELECT proname FROM pg_proc WHERE proname LIKE '%health%';
   ```

---

## 📞 PRÓXIMOS PASSOS

Depois de aplicar as migrations corrigidas:

1. ✅ Testar todas as 4 migrations
2. ✅ Fazer deploy do frontend
3. ✅ Acessar `/analytics` e `/health`
4. ✅ Configurar CRON job do health monitor
5. ✅ Merge da Pull Request

---

**Status:** 🔧 Corrections Ready
**Arquivos:** 2 migrations corrigidas + este guia
**Tempo estimado:** 5-10 minutos para aplicar tudo
