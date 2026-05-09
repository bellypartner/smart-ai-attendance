-- ============================================================
-- SmartAi Attendance — Migration v2
-- Run this AFTER the original schema.sql
-- Adds: staff status, hierarchy levels, status history, org structure
-- ============================================================

-- Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active','on_notice','relieved','terminated','absconded','suspended'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INT DEFAULT 4
  CHECK (level IN (1,2,3,4)); -- 1=super_admin, 2=org_admin, 3=branch_admin, 4=employee
ALTER TABLE users ADD COLUMN IF NOT EXISTS relieving_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relieving_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_joining DATE DEFAULT CURRENT_DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_notes TEXT;

-- Set levels for existing users
UPDATE users SET level = 1 WHERE role = 'super_admin';
UPDATE users SET level = 2 WHERE role = 'org_admin';
UPDATE users SET level = 3 WHERE role = 'branch_admin';
UPDATE users SET level = 4 WHERE role = 'employee';

-- Status history table
CREATE TABLE IF NOT EXISTS status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_status  TEXT,
  new_status  TEXT NOT NULL,
  reason      TEXT,
  effective_date DATE DEFAULT CURRENT_DATE,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Org admin role support in users check constraint
-- (Drop and recreate the role constraint to include org_admin)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin','org_admin','branch_admin','employee'));

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_users_manager    ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_users_status     ON users(status);
CREATE INDEX IF NOT EXISTS idx_status_history   ON status_history(employee_id, created_at);

-- Update existing seed users with manager hierarchy
-- (Branch admins report to org admin, employees to branch admin)
-- This will be managed through the app UI going forward

SELECT 'Migration v2 complete' as result;
