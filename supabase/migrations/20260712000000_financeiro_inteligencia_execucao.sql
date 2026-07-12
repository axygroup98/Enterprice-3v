/*
# CIO Enterprise — Financeiro, Inteligência e Execução

## Summary
Aditiva (não altera nenhuma tabela/policy existente). Implementa a base de dados
necessária para os Capítulos 6 (Financeiro), 8 (Centro de Inteligência) e 10
(Execução) do Documento Mestre, reaproveitando 100% dos dados já coletados pelas
integrações existentes (ErpProduct.precoCusto, MarketplaceListing.price/soldQuantity),
sem criar nenhuma chamada nova às APIs do Bling/ML/Shopee.

## Tables

### execution_tasks (Cap. 10 — Central de Execução)
Fila de tarefas geradas pelo Motor de Inteligência (a partir de divergências e
diagnósticos financeiros). Cada tarefa registra causa, prioridade, impacto em
R$ e passa obrigatoriamente por simulação antes da execução (10.7 do Documento
Mestre — "Simulação Antes da Execução").

### recommendations (Cap. 8 — Centro de Inteligência)
Snapshot das recomendações geradas pelo motor (causa, prioridade, valor em R$,
ação sugerida). Persistido para que o histórico e os relatórios (Cap. 9) possam
consultar recomendações passadas mesmo depois de resolvidas.

## Security
Mesmo modelo das tabelas existentes: single-tenant, sem login, RLS habilitado
com policies USING(true)/WITH CHECK(true) para anon/authenticated — idêntico ao
padrão já adotado em `divergences`/`audit_records`/`sync_logs`.
*/

-- ─── execution_tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  source_type       text NOT NULL,              -- 'divergence' | 'financial' | 'manual'
  source_id         text,                       -- id da divergence/recommendation de origem
  title             text NOT NULL,
  description       text NOT NULL,
  priority          text NOT NULL,              -- 'critical' | 'high' | 'medium' | 'informative'
  impact_value      numeric,                    -- impacto estimado em R$
  status            text NOT NULL DEFAULT 'pending', -- 'pending'|'simulated'|'approved'|'executed'|'failed'|'cancelled'
  simulation_result jsonb,
  execution_result  jsonb,
  executed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS et_status_idx ON execution_tasks (status);
CREATE INDEX IF NOT EXISTS et_priority_idx ON execution_tasks (priority);
CREATE INDEX IF NOT EXISTS et_created_at_idx ON execution_tasks (created_at DESC);

ALTER TABLE execution_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "et_select" ON execution_tasks;
CREATE POLICY "et_select" ON execution_tasks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "et_insert" ON execution_tasks;
CREATE POLICY "et_insert" ON execution_tasks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "et_update" ON execution_tasks;
CREATE POLICY "et_update" ON execution_tasks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "et_delete" ON execution_tasks;
CREATE POLICY "et_delete" ON execution_tasks FOR DELETE TO anon, authenticated USING (true);

-- ─── recommendations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz DEFAULT now(),
  sku            text,
  category       text NOT NULL,   -- 'comercial'|'operacional'|'financeiro'|'marketplace'
  cause          text NOT NULL,   -- "por que aconteceu"
  impact_value   numeric,         -- "quanto dinheiro isso representa"
  priority       text NOT NULL,
  suggested_action text NOT NULL,
  status         text NOT NULL DEFAULT 'open', -- 'open'|'accepted'|'dismissed'
  details        jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS rec_priority_idx ON recommendations (priority);
CREATE INDEX IF NOT EXISTS rec_status_idx ON recommendations (status);
CREATE INDEX IF NOT EXISTS rec_created_at_idx ON recommendations (created_at DESC);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rec_select" ON recommendations;
CREATE POLICY "rec_select" ON recommendations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "rec_insert" ON recommendations;
CREATE POLICY "rec_insert" ON recommendations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rec_update" ON recommendations;
CREATE POLICY "rec_update" ON recommendations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rec_delete" ON recommendations;
CREATE POLICY "rec_delete" ON recommendations FOR DELETE TO anon, authenticated USING (true);

-- ─── Config financeira padrão (Cap. 6) ───────────────────────────────────────
-- Comissões/taxas usadas pelo Simulador de Preços e cálculo de Rentabilidade.
-- Editável em Administrar; valores de mercado usados como padrão inicial.
INSERT INTO system_config (key, value) VALUES
  ('fee_mercadolivre_pct', '12')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO system_config (key, value) VALUES
  ('fee_shopee_pct', '14')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO system_config (key, value) VALUES
  ('fee_fixed_brl', '5')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO system_config (key, value) VALUES
  ('margin_alert_threshold_pct', '10')
  ON CONFLICT (key) DO NOTHING;
