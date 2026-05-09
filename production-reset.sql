-- ============================================================
-- SmartAi Attendance — Production Reset
-- Run this to clear ALL demo data and prepare for real use
-- ============================================================

-- 1. Clear all demo/test data
TRUNCATE TABLE late_approvals CASCADE;
TRUNCATE TABLE leaves CASCADE;
TRUNCATE TABLE attendance_records CASCADE;
TRUNCATE TABLE shift_requests CASCADE;
TRUNCATE TABLE shift_schedules CASCADE;
TRUNCATE TABLE shift_templates CASCADE;
TRUNCATE TABLE org_settings CASCADE;
TRUNCATE TABLE branches CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE organizations CASCADE;

-- 2. Add missing columns if not already added
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active','on_notice','relieved','terminated','absconded','suspended'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_joining DATE DEFAULT CURRENT_DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relieving_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relieving_reason TEXT;

-- Update role constraint to include org_admin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin','org_admin','branch_admin','employee'));

-- 3. Status history table
CREATE TABLE IF NOT EXISTS status_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_status     TEXT,
  new_status     TEXT NOT NULL,
  reason         TEXT,
  effective_date DATE DEFAULT CURRENT_DATE,
  changed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_history_emp ON status_history(employee_id);

-- 4. Create your real Super Admin
-- IMPORTANT: Change the password before running!
INSERT INTO users (id, name, phone, password_hash, role, status)
VALUES (
  gen_random_uuid(),
  'Super Admin',
  '8921564165',   -- ← change to your real phone
  crypt('3Slmedi@', gen_salt('bf', 10)),  -- ← change this!
  'super_admin',
  'active'
);

-- Verify
SELECT 'Super admin created' as result, phone, role FROM users WHERE role = 'super_admin';