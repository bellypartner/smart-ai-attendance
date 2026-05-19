-- ============================================================
-- SmartAi Attendance — KPI Module Migration
-- ============================================================

-- Brands
CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brands_org ON brands(org_id);

-- KPI Templates
CREATE TABLE IF NOT EXISTS kpi_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  data_type       TEXT DEFAULT 'number' CHECK (data_type IN ('number','percentage','currency','rating')),
  frequency       TEXT DEFAULT 'daily' CHECK (frequency IN ('daily','weekly','monthly')),
  due_day         TEXT, -- 'monday','tuesday' etc for weekly; date number for monthly; null for daily
  target_value    NUMERIC(12,2) NOT NULL,
  weightage       NUMERIC(5,2) DEFAULT 0,
  late_penalty    NUMERIC(5,2) DEFAULT 10,
  description     TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kpi_tmpl_org ON kpi_templates(org_id);

-- KPI Entries (Branch Admin fills)
CREATE TABLE IF NOT EXISTS kpi_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  kpi_id          UUID NOT NULL REFERENCES kpi_templates(id) ON DELETE CASCADE,
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  submitted_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL,
  due_date        DATE NOT NULL,
  value           NUMERIC(12,2) NOT NULL,
  notes           TEXT,
  is_late         BOOLEAN DEFAULT false,
  score           NUMERIC(5,2),
  status          TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, kpi_id, due_date)
);
CREATE INDEX IF NOT EXISTS idx_kpi_entries_branch ON kpi_entries(branch_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_kpi_entries_status ON kpi_entries(org_id, status);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date    DATE,
  priority    TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','overdue')),
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_branch ON tasks(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to, status);

-- Monthly KPI Scores (cached)
CREATE TABLE IF NOT EXISTS kpi_monthly_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  year        INT NOT NULL,
  month       INT NOT NULL,
  score       NUMERIC(5,2),
  total_kpis  INT DEFAULT 0,
  filled_kpis INT DEFAULT 0,
  late_kpis   INT DEFAULT 0,
  missed_kpis INT DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, year, month)
);

SELECT 'KPI module migration complete' AS result;