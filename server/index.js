// ============================================================
// SmartAi Attendance — Backend API Server v5.1
// Railway full-stack: Express serves React + API
// by 3SL Media Labs
// ============================================================

import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;
const app = express();

// ── DATABASE ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => console.error('DB pool error:', err.message));
const db = (sql, params) => pool.query(sql, params);

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── SERVE REACT BUILD ─────────────────────────────────────────
const DIST = path.join(__dirname, '..', 'dist');
app.use(express.static(DIST));
console.log(`DIST path: ${DIST}`);

// ── HELPERS ───────────────────────────────────────────────────
const toMins = (t) => {
  if (!t) return 0;
  const str = typeof t === 'string' ? t : String(t);
  const [h, m] = str.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};

const nowIST = () => {
  const now = new Date();
  return {
    date: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    time: now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
  };
};

const pad = (n) => String(n).padStart(2, '0');

// ── AUTH MIDDLEWARE ───────────────────────────────────────────
function auth(roles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      if (roles.length && !roles.includes(req.user.role))
        return res.status(403).json({ error: 'Forbidden' });
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

const orgId = (req) =>
  req.user.role === 'super_admin'
    ? (req.query.org_id || req.body.org_id || null)
    : req.user.org_id;

// ── HEALTH ────────────────────────────────────────────────────
app.get('/health', async (_, res) => {
  try {
    await db('SELECT 1');
    res.json({ ok: true, db: 'connected', ts: new Date() });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'error', error: e.message });
  }
});

// ============================================================
// AUTH
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ error: 'Phone and password required' });

    const { rows } = await db(
      `SELECT u.*, o.name AS org_name, o.code AS org_code, b.name AS branch_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.org_id
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.phone = $1 AND u.is_active = true`,
      [phone]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const u = rows[0];
    const token = jwt.sign(
      { id: u.id, org_id: u.org_id, branch_id: u.branch_id, role: u.role, name: u.name },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    await db('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);

    res.json({
      token,
      user: {
        id: u.id, name: u.name, phone: u.phone, role: u.role,
        designation: u.designation, salary: u.salary,
        org_id: u.org_id, org_name: u.org_name, org_code: u.org_code,
        branch_id: u.branch_id, branch_name: u.branch_name,
        default_shift_id: u.default_shift_id,
        status: u.status, manager_id: u.manager_id,
        date_of_joining: u.date_of_joining,
      },
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/change-password', auth(), async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const { rows } = await db('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(current_password, rows[0].password_hash)))
      return res.status(400).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    await db('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// ORGANIZATIONS
// ============================================================

app.get('/api/orgs', auth(['super_admin']), async (req, res) => {
  try {
    const { rows } = await db(`
      SELECT o.*,
        (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.role = 'employee') AS employee_count,
        (SELECT COUNT(*) FROM branches b WHERE b.org_id = o.id AND b.is_active = true) AS branch_count
      FROM organizations o ORDER BY o.created_at
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orgs', auth(['super_admin']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO organizations (name, code, plan) VALUES ($1, $2, $3) RETURNING *',
      [req.body.name, req.body.code.toUpperCase(), req.body.plan || 'basic']
    );
    await client.query('INSERT INTO org_settings (org_id) VALUES ($1)', [rows[0].id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

app.get('/api/orgs/:id/settings', auth(), async (req, res) => {
  try {
    const oid = req.params.id === 'me' ? orgId(req) : req.params.id;
    const { rows } = await db('SELECT * FROM org_settings WHERE org_id = $1', [oid]);
    res.json(rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orgs/:id/settings', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = req.params.id === 'me' ? orgId(req) : req.params.id;
    const allowed = ['grace_period_mins', 'late_deduction_per_occ', 'max_allowed_lates_per_month',
      'excess_late_penalty', 'unauth_leave_penalty', 'no_show_penalty', 'casual_leave_per_month',
      'auto_checkout_time', 'min_working_hours', 'working_days_per_month', 'geo_fence_radius_meters'];
    const updates = allowed.filter(f => req.body[f] !== undefined);
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    const set = updates.map((f, i) => `${f} = $${i + 2}`).join(', ');
    await db(`UPDATE org_settings SET ${set}, updated_at = now() WHERE org_id = $1`,
      [oid, ...updates.map(f => req.body[f])]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// BRANCHES
// ============================================================

app.get('/api/branches', auth(), async (req, res) => {
  try {
    const oid = orgId(req);
    const { rows } = await db(
      'SELECT * FROM branches WHERE org_id = $1 AND is_active = true ORDER BY name', [oid]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/branches', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { name, address, lat, lng, radius } = req.body;
    const { rows } = await db(
      'INSERT INTO branches (org_id,name,address,lat,lng,radius) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [oid, name, address, lat, lng, radius || 200]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/branches/:id', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const { name, address, lat, lng, radius, is_active } = req.body;
    await db(
      'UPDATE branches SET name=$1,address=$2,lat=$3,lng=$4,radius=$5,is_active=$6,updated_at=now() WHERE id=$7',
      [name, address, lat, lng, radius, is_active ?? true, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// EMPLOYEES — full version with status, manager, joining
// ============================================================

app.get('/api/employees', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { rows } = await db(`
      SELECT u.id, u.org_id, u.branch_id, u.name, u.phone, u.role,
             u.designation, u.salary, u.default_shift_id, u.is_active,
             u.status, u.manager_id, u.date_of_joining, u.employee_code,
             u.relieving_date, u.relieving_reason, u.created_at,
             b.name AS branch_name, st.name AS default_shift_name,
             m.name AS manager_name
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN shift_templates st ON st.id = u.default_shift_id
      LEFT JOIN users m ON m.id = u.manager_id
      WHERE u.org_id = $1
        AND u.role NOT IN ('super_admin')
        AND u.is_active = true
      ORDER BY u.name
    `, [oid]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { name, phone, password, branch_id, role, designation, salary,
      default_shift_id, manager_id, date_of_joining, employee_code } = req.body;
    const hash = await bcrypt.hash(password || '1234', 10);
    const { rows } = await db(
      `INSERT INTO users
        (org_id, branch_id, name, phone, password_hash, role, designation,
         salary, default_shift_id, manager_id, date_of_joining, employee_code, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')
       RETURNING id, name, phone, role, designation, salary`,
      [oid, branch_id, name, phone, hash, role || 'employee', designation,
        salary || 0, default_shift_id || null, manager_id || null,
        date_of_joining || null, employee_code || null]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.message.includes('unique')) res.status(400).json({ error: 'Phone number already exists' });
    else res.status(500).json({ error: e.message });
  }
});

app.patch('/api/employees/:id', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const { name, branch_id, designation, salary, default_shift_id, is_active,
      status, relieving_date, relieving_reason, manager_id,
      date_of_joining, employee_code } = req.body;
    await db(
      `UPDATE users SET name=$1, branch_id=$2, designation=$3, salary=$4,
        default_shift_id=$5, is_active=$6, status=$7, relieving_date=$8,
        relieving_reason=$9, manager_id=$10, date_of_joining=$11,
        employee_code=$12, updated_at=now() WHERE id=$13`,
      [name, branch_id, designation, salary, default_shift_id,
        is_active ?? true, status ?? 'active', relieving_date || null,
        relieving_reason || null, manager_id || null,
        date_of_joining || null, employee_code || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employees/:id/reset-password', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    await db('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// STATUS HISTORY
// ============================================================

app.get('/api/status-history', auth(), async (req, res) => {
  try {
    const { employee_id } = req.query;
    const { rows } = await db(
      `SELECT sh.*, u.name as changed_by_name
       FROM status_history sh
       LEFT JOIN users u ON u.id = sh.changed_by
       WHERE sh.employee_id = $1
       ORDER BY sh.created_at DESC LIMIT 50`,
      [employee_id || req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/status-history', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const { employee_id, org_id, old_status, new_status, reason, effective_date } = req.body;
    const { rows } = await db(
      `INSERT INTO status_history (employee_id, org_id, old_status, new_status, reason, effective_date, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [employee_id, org_id, old_status, new_status, reason, effective_date, req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SHIFTS
// ============================================================

app.get('/api/shifts', auth(), async (req, res) => {
  try {
    const oid = orgId(req);
    const { rows } = await db(
      'SELECT * FROM shift_templates WHERE org_id=$1 AND is_active=true ORDER BY start_time', [oid]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/shifts', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { name, start_time, end_time, break_mins, color } = req.body;
    const { rows } = await db(
      'INSERT INTO shift_templates (org_id,name,start_time,end_time,break_mins,color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [oid, name, start_time, end_time, break_mins || 60, color || '#3b82f6']);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/shifts/:id', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const { name, start_time, end_time, break_mins, color, is_active } = req.body;
    await db('UPDATE shift_templates SET name=$1,start_time=$2,end_time=$3,break_mins=$4,color=$5,is_active=$6 WHERE id=$7',
      [name, start_time, end_time, break_mins, color, is_active ?? true, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SCHEDULES
// ============================================================

app.get('/api/schedules', auth(), async (req, res) => {
  try {
    const oid = orgId(req);
    const { from, to, employee_id } = req.query;
    const todayDate = nowIST().date;
    let sql = `
      SELECT ss.*, st.name AS shift_name, st.start_time, st.end_time, st.break_mins, st.color,
             u.name AS employee_name
      FROM shift_schedules ss
      JOIN shift_templates st ON st.id = ss.shift_id
      JOIN users u ON u.id = ss.employee_id
      WHERE ss.org_id = $1 AND ss.date BETWEEN $2 AND $3
    `;
    const params = [oid, from || todayDate, to || todayDate];
    if (employee_id) { sql += ' AND ss.employee_id = $4'; params.push(employee_id); }
    else if (req.user.role === 'employee') { sql += ' AND ss.employee_id = $4'; params.push(req.user.id); }
    sql += ' ORDER BY ss.date, u.name';
    const { rows } = await db(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/schedules/bulk', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  const oid = orgId(req);
  const { employee_id, shift_id, from, to, skip_sundays, rotation } = req.body;
  const client = await pool.connect();
  let count = 0;
  try {
    await client.query('BEGIN');
    const start = new Date(from + 'T12:00:00'), end = new Date(to + 'T12:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (skip_sundays && d.getDay() === 0) continue;
      const ds = d.toISOString().split('T')[0];
      const sid = rotation ? rotation[count % rotation.length] : shift_id;
      if (!sid) { count++; continue; }
      await client.query(`
        INSERT INTO shift_schedules (org_id,employee_id,shift_id,date,is_override,source)
        VALUES ($1,$2,$3,$4,false,'bulk')
        ON CONFLICT (employee_id,date,is_override)
        DO UPDATE SET shift_id=EXCLUDED.shift_id, source='bulk'
      `, [oid, employee_id, sid, ds]);
      count++;
    }
    await client.query('COMMIT');
    res.json({ ok: true, days_scheduled: count });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally { client.release(); }
});

app.post('/api/schedules/override', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { employee_id, shift_id, date, note } = req.body;
    await db(`
      INSERT INTO shift_schedules (org_id,employee_id,shift_id,date,is_override,override_note,overridden_by,source)
      VALUES ($1,$2,$3,$4,true,$5,$6,'override')
      ON CONFLICT (employee_id,date,is_override)
      DO UPDATE SET shift_id=EXCLUDED.shift_id, override_note=EXCLUDED.override_note, overridden_by=EXCLUDED.overridden_by
    `, [oid, employee_id, shift_id, date, note, req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SHIFT REQUESTS
// ============================================================

app.get('/api/shift-requests', auth(), async (req, res) => {
  try {
    const oid = orgId(req);
    let sql = `
      SELECT sr.*, st.name AS requested_shift_name, st.start_time, st.end_time,
             u.name AS employee_name, u.designation
      FROM shift_requests sr
      JOIN shift_templates st ON st.id = sr.requested_shift_id
      JOIN users u ON u.id = sr.employee_id
      WHERE sr.org_id = $1
    `;
    const params = [oid];
    if (req.user.role === 'employee') { sql += ' AND sr.employee_id = $2'; params.push(req.user.id); }
    else if (req.user.role === 'branch_admin') { sql += ' AND sr.manager_id = $2'; params.push(req.user.id); }
    sql += ' ORDER BY sr.created_at DESC LIMIT 100';
    const { rows } = await db(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/shift-requests', auth(['employee']), async (req, res) => {
  try {
    const oid = req.user.org_id;
    const { requested_shift_id, date, note, manager_id } = req.body;
    const { rows } = await db(
      'INSERT INTO shift_requests (org_id,employee_id,manager_id,requested_shift_id,date,note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [oid, req.user.id, manager_id, requested_shift_id, date, note]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/shift-requests/:id', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await db(
      'UPDATE shift_requests SET status=$1,decided_by=$2,decided_at=now() WHERE id=$3 RETURNING *',
      [status, req.user.id, req.params.id]);
    if (status === 'approved') {
      const r = rows[0];
      await db(`
        INSERT INTO shift_schedules (org_id,employee_id,shift_id,date,is_override,override_note,overridden_by,source)
        VALUES ($1,$2,$3,$4,true,'Approved employee request',$5,'request')
        ON CONFLICT (employee_id,date,is_override)
        DO UPDATE SET shift_id=EXCLUDED.shift_id, overridden_by=EXCLUDED.overridden_by
      `, [r.org_id, r.employee_id, r.requested_shift_id, r.date, req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// ATTENDANCE
// ============================================================

app.get('/api/attendance', auth(), async (req, res) => {
  try {
    const oid = orgId(req);
    const { from, to, date, employee_id } = req.query;
    const todayDate = nowIST().date;
    let sql = `
      SELECT ar.*, u.name AS employee_name, u.designation,
             b.name AS branch_name, st.name AS shift_name,
             st.start_time AS shift_start, st.end_time AS shift_end
      FROM attendance_records ar
      JOIN users u ON u.id = ar.employee_id
      LEFT JOIN branches b ON b.id = ar.branch_id
      LEFT JOIN shift_templates st ON st.id = ar.shift_id
      WHERE ar.org_id = $1
    `;
    const params = [oid];
    if (date) { params.push(date); sql += ` AND ar.date = $${params.length}`; }
    else {
      params.push(from || todayDate); params.push(to || todayDate);
      sql += ` AND ar.date BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    if (req.user.role === 'employee') { params.push(req.user.id); sql += ` AND ar.employee_id = $${params.length}`; }
    else if (employee_id) { params.push(employee_id); sql += ` AND ar.employee_id = $${params.length}`; }
    sql += ' ORDER BY ar.date DESC, u.name LIMIT 500';
    const { rows } = await db(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Check-in
app.post('/api/attendance/checkin', auth(['employee']), async (req, res) => {
  try {
    const { branch_id, geo_lat, geo_lng, geo_verified } = req.body;
    const oid = req.user.org_id;
    const { date, time } = nowIST();

    const existing = await db(
      'SELECT id FROM attendance_records WHERE employee_id=$1 AND date=$2',
      [req.user.id, date]);
    if (existing.rows[0]) return res.status(400).json({ error: 'Already checked in today' });

    // Resolve shift: override → schedule → default
    const { rows: schedRows } = await db(`
      SELECT ss.shift_id, st.name, st.start_time, st.end_time
      FROM shift_schedules ss JOIN shift_templates st ON st.id = ss.shift_id
      WHERE ss.employee_id=$1 AND ss.date=$2
      ORDER BY ss.is_override DESC LIMIT 1
    `, [req.user.id, date]);

    let shift = schedRows[0];
    if (!shift) {
      const { rows: def } = await db(`
        SELECT st.id AS shift_id, st.name, st.start_time, st.end_time
        FROM users u JOIN shift_templates st ON st.id = u.default_shift_id
        WHERE u.id=$1
      `, [req.user.id]);
      shift = def[0];
    }
    if (!shift) return res.status(400).json({ error: 'No shift assigned for today. Contact your admin.' });

    const { rows: settRows } = await db('SELECT * FROM org_settings WHERE org_id=$1', [oid]);
    const grace = settRows[0]?.grace_period_mins || 15;
    const shiftStartMins = toMins(shift.start_time);
    const nowMins = toMins(time);
    let lateMins = nowMins - shiftStartMins;
    if (lateMins < -720) lateMins += 1440;

    const isLate = lateMins > grace;
    const needsApproval = lateMins > grace * 2;

    const { rows } = await db(`
      INSERT INTO attendance_records
        (org_id,employee_id,branch_id,shift_id,date,check_in_time,
         is_late,late_mins,approval_status,geo_verified,geo_lat,geo_lng)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [oid, req.user.id, branch_id, shift.shift_id, date, time,
      isLate, Math.max(0, lateMins), needsApproval ? 'pending' : 'approved',
      geo_verified || false, geo_lat || null, geo_lng || null]);

    if (needsApproval) {
      const { rows: mgr } = await db(
        `SELECT id FROM users WHERE branch_id=$1 AND role IN ('branch_admin','org_admin') LIMIT 1`,
        [req.user.branch_id]);
      await db(`INSERT INTO late_approvals (org_id,record_id,employee_id,manager_id,late_mins,shift_name)
                VALUES ($1,$2,$3,$4,$5,$6)`,
        [oid, rows[0].id, req.user.id, mgr[0]?.id || null, Math.max(0, lateMins), shift.name]);
    }

    res.json({ record: rows[0], isLate, lateMins: Math.max(0, lateMins), needsApproval, shiftName: shift.name });
  } catch (e) {
    console.error('Checkin error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Check-out
app.post('/api/attendance/checkout', auth(['employee']), async (req, res) => {
  try {
    const { date, time } = nowIST();
    const { rows } = await db(
      'SELECT * FROM attendance_records WHERE employee_id=$1 AND date=$2',
      [req.user.id, date]);
    if (!rows[0]) return res.status(400).json({ error: 'Not checked in today' });
    if (rows[0].check_out_time) return res.status(400).json({ error: 'Already checked out' });
    const workedMins = Math.max(0, toMins(time) - toMins(rows[0].check_in_time));
    await db('UPDATE attendance_records SET check_out_time=$1,worked_mins=$2,updated_at=now() WHERE id=$3',
      [time, workedMins, rows[0].id]);
    res.json({ ok: true, worked_mins: workedMins });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin mark / edit attendance for any date
app.post('/api/attendance/admin-mark', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { employee_id, date, check_in_time, check_out_time, notes } = req.body;

    const { rows: sch } = await db(`
      SELECT ss.shift_id, st.start_time
      FROM shift_schedules ss JOIN shift_templates st ON st.id=ss.shift_id
      WHERE ss.employee_id=$1 AND ss.date=$2 ORDER BY ss.is_override DESC LIMIT 1
    `, [employee_id, date]);

    const { rows: sett } = await db('SELECT grace_period_mins FROM org_settings WHERE org_id=$1', [oid]);
    const grace = sett[0]?.grace_period_mins || 15;
    const shiftMins = sch[0] ? toMins(sch[0].start_time) : 540;
    const cinMins = toMins(check_in_time);
    const lateMins = Math.max(0, cinMins - shiftMins);
    const workedMins = check_out_time ? Math.max(0, toMins(check_out_time) - cinMins) : null;

    await db(`
      INSERT INTO attendance_records
        (org_id,employee_id,shift_id,date,check_in_time,check_out_time,worked_mins,
         is_late,late_mins,approval_status,admin_edited,edited_by,edited_at,geo_verified,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',true,$10,now(),false,$11)
      ON CONFLICT (employee_id,date)
      DO UPDATE SET check_in_time=$5,check_out_time=$6,worked_mins=$7,is_late=$8,late_mins=$9,
                    approval_status='approved',admin_edited=true,edited_by=$10,edited_at=now(),
                    notes=$11,updated_at=now()
    `, [oid, employee_id, sch[0]?.shift_id || null, date, check_in_time, check_out_time,
      workedMins, lateMins > grace, lateMins, req.user.id, notes || null]);

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// APPROVALS
// ============================================================

app.get('/api/approvals', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    let sql = `
      SELECT la.*, u.name AS employee_name, u.designation
      FROM late_approvals la JOIN users u ON u.id=la.employee_id
      WHERE la.org_id=$1 AND la.status='pending'
    `;
    const params = [oid];
    if (req.user.role === 'branch_admin') { params.push(req.user.id); sql += ` AND la.manager_id=$${params.length}`; }
    sql += ' ORDER BY la.created_at DESC';
    const { rows } = await db(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/approvals/:id', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const { rows } = await db(
      'UPDATE late_approvals SET status=$1,decided_by=$2,decided_at=now() WHERE id=$3 RETURNING record_id',
      [req.body.status, req.user.id, req.params.id]);
    await db('UPDATE attendance_records SET approval_status=$1 WHERE id=$2',
      [req.body.status, rows[0].record_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// LEAVES — with audit log, edit, delete
// ============================================================

app.get('/api/leaves', auth(), async (req, res) => {
  try {
    const oid = orgId(req);
    const { from, to, employee_id } = req.query;
    let sql = `
      SELECT l.*, u.name AS employee_name, r.name AS recorded_by_name
      FROM leaves l
      JOIN users u ON u.id = l.employee_id
      LEFT JOIN users r ON r.id = l.recorded_by
      WHERE l.org_id = $1
    `;
    const params = [oid];
    if (req.user.role === 'employee') { params.push(req.user.id); sql += ` AND l.employee_id=$${params.length}`; }
    else if (employee_id) { params.push(employee_id); sql += ` AND l.employee_id=$${params.length}`; }
    if (from) { params.push(from); sql += ` AND l.date>=$${params.length}`; }
    if (to) { params.push(to); sql += ` AND l.date<=$${params.length}`; }
    sql += ' ORDER BY l.date DESC LIMIT 500';
    const { rows } = await db(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leaves', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { employee_id, date, type, reason } = req.body;
    const { rows } = await db(
      'INSERT INTO leaves (org_id,employee_id,date,type,reason,recorded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [oid, employee_id, date, type, reason, req.user.id]);

    // Audit log
    await db(`
      INSERT INTO leave_audit_log (leave_id, org_id, employee_id, action, new_data, changed_by, changed_by_name)
      VALUES ($1,$2,$3,'created',$4,$5,$6)
    `, [rows[0].id, oid, employee_id,
        JSON.stringify({ type, date, reason }),
        req.user.id, req.user.name]).catch(() => {}); // silent if table doesn't exist yet

    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/leaves/:id', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const { type, reason, date } = req.body;
    // Get old data for audit
    const { rows: old } = await db('SELECT * FROM leaves WHERE id=$1', [req.params.id]);
    await db('UPDATE leaves SET type=$1, reason=$2, date=$3 WHERE id=$4',
      [type, reason, date, req.params.id]);

    // Audit log
    if (old[0]) {
      await db(`
        INSERT INTO leave_audit_log (leave_id, org_id, employee_id, action, old_data, new_data, changed_by, changed_by_name)
        VALUES ($1,$2,$3,'edited',$4,$5,$6,$7)
      `, [req.params.id, old[0].org_id, old[0].employee_id,
          JSON.stringify({ type: old[0].type, date: old[0].date, reason: old[0].reason }),
          JSON.stringify({ type, date, reason }),
          req.user.id, req.user.name]).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/leaves/:id', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    // Get old data for audit before deleting
    const { rows: old } = await db('SELECT * FROM leaves WHERE id=$1', [req.params.id]);
    if (old[0]) {
      await db(`
        INSERT INTO leave_audit_log (leave_id, org_id, employee_id, action, old_data, changed_by, changed_by_name)
        VALUES ($1,$2,$3,'deleted',$4,$5,$6)
      `, [req.params.id, old[0].org_id, old[0].employee_id,
          JSON.stringify({ type: old[0].type, date: old[0].date, reason: old[0].reason }),
          req.user.id, req.user.name]).catch(() => {});
    }
    await db('DELETE FROM leaves WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leaves/audit — full audit trail
app.get('/api/leaves/audit', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { employee_id, from, to } = req.query;
    let sql = `
      SELECT al.*, u.name AS employee_name
      FROM leave_audit_log al
      LEFT JOIN users u ON u.id = al.employee_id
      WHERE al.org_id = $1
    `;
    const params = [oid];
    if (employee_id) { params.push(employee_id); sql += ` AND al.employee_id=$${params.length}`; }
    if (from) { params.push(from); sql += ` AND al.created_at::date>=$${params.length}`; }
    if (to) { params.push(to); sql += ` AND al.created_at::date<=$${params.length}`; }
    sql += ' ORDER BY al.created_at DESC LIMIT 200';
    const { rows } = await db(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SALARY REPORT
// ============================================================

app.get('/api/salary-report', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const now = new Date();
    const y = parseInt(req.query.year || now.getFullYear());
    const m = parseInt(req.query.month || (now.getMonth() + 1));
    const from = `${y}-${pad(m)}-01`;
    const to = new Date(y, m, 0).toISOString().split('T')[0];

    const [{ rows: emps }, { rows: settRows }] = await Promise.all([
      db(`SELECT u.id, u.name, u.designation, u.salary, u.status,
               b.name AS branch_name, b.id AS branch_id
          FROM users u LEFT JOIN branches b ON b.id=u.branch_id
          WHERE u.org_id=$1 AND u.role='employee' AND u.is_active=true
          ORDER BY u.name`, [oid]),
      db('SELECT * FROM org_settings WHERE org_id=$1', [oid]),
    ]);
    const s = settRows[0] || {};

    const report = await Promise.all(emps.map(async (emp) => {
      const [{ rows: att }, { rows: lvs }] = await Promise.all([
        db('SELECT * FROM attendance_records WHERE employee_id=$1 AND date BETWEEN $2 AND $3', [emp.id, from, to]),
        db('SELECT * FROM leaves WHERE employee_id=$1 AND date BETWEEN $2 AND $3', [emp.id, from, to]),
      ]);
      const presentDays = att.filter(a => a.check_in_time).length;
      const lateDays = att.filter(a => a.is_late && a.approval_status !== 'rejected').length;
      const unauthLeaves = lvs.filter(l => l.type === 'unauthorized').length;
      const noShows = lvs.filter(l => l.type === 'noshow').length;
      const casualUsed = lvs.filter(l => l.type === 'casual').length;
      const wdm = s.working_days_per_month || 26;
      const dailyRate = emp.salary / wdm;
      const earnedGross = presentDays * dailyRate;
      const excessLates = Math.max(0, lateDays - (s.max_allowed_lates_per_month || 3));
      const lateDeductions = lateDays * (s.late_deduction_per_occ || 50) + excessLates * (s.excess_late_penalty || 100);
      const leaveDeductions = unauthLeaves * (s.unauth_leave_penalty || 200);
      const noShowDeductions = noShows * (s.no_show_penalty || 250);
      const totalDeductions = lateDeductions + leaveDeductions + noShowDeductions;
      return {
        ...emp, presentDays, lateDays, unauthLeaves, noShows, casualUsed,
        dailyRate, earnedGross, lateDeductions, leaveDeductions, noShowDeductions,
        totalDeductions, netEarned: Math.max(0, earnedGross - totalDeductions),
      };
    }));

    res.json({ year: y, month: m, from, to, report, total: report.reduce((s, r) => s + r.netEarned, 0) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// AUTO-CHECKOUT CRON
// ============================================================
app.get('/api/orgs/:id/default-shift', auth(), async (req, res) => {
  try {
    const oid = req.params.id === 'me' ? orgId(req) : req.params.id;
    const { rows } = await db('SELECT default_shift_id FROM org_settings WHERE org_id=$1', [oid]);
    res.json({ default_shift_id: rows[0]?.default_shift_id || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orgs/:id/default-shift', auth(['super_admin','org_admin','branch_admin']), async (req, res) => {
  try {
    const oid = req.params.id === 'me' ? orgId(req) : req.params.id;
    await db('UPDATE org_settings SET default_shift_id=$1 WHERE org_id=$2', [req.body.default_shift_id, oid]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/cron/auto-checkout', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET)
    return res.status(401).end();
  try {
    await db('SELECT run_auto_checkout()');
    res.json({ ok: true, ts: new Date() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// CATCH-ALL — Serve React PWA
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

// ── START ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SmartAi Attendance running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Serving React from: ${DIST}`);
});