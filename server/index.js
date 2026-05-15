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
import webpush from 'web-push';
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

// ── VAPID PUSH NOTIFICATIONS ──────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.VAPID_EMAIL || 'admin@saladcaffe.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const { rows } = await db('SELECT * FROM push_subscriptions WHERE user_id=$1', [userId]);
    const payload = JSON.stringify({ title, body, ...data });
    for (const sub of rows) {
      const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      webpush.sendNotification(pushSub, payload).catch(async (err) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db('DELETE FROM push_subscriptions WHERE id=$1', [sub.id]).catch(() => {});
        }
      });
    }
  } catch (e) { console.error('Push error:', e.message); }
}

async function createNotification(userId, orgId, title, body, type, refId) {
  try {
    await db(
      'INSERT INTO notifications (user_id, org_id, title, body, type, ref_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, orgId, title, body, type, refId || null]
    );
    await sendPushNotification(userId, title, body, { tag: type, url: '/' });
  } catch (e) { console.error('Notification error:', e.message); }
}

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
      'auto_checkout_time', 'min_working_hours', 'working_days_per_month', 'geo_fence_radius_meters',
      'monthly_grace_days', 'excess_late_deduction', 'chronic_late_threshold', 'chronic_late_deduction',
      'advance_notice_days', 'max_advance_amount'];
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
        ${req.user.role === 'branch_admin' ? "AND u.branch_id = '" + req.user.branch_id + "'" : ''}
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
    const { name, phone, branch_id, designation, salary, default_shift_id, is_active,
      status, relieving_date, relieving_reason, manager_id,
      date_of_joining, employee_code, working_days_type, job_category_id } = req.body;
    if (is_active === false && req.user.role === 'branch_admin') {
      return res.status(403).json({ error: 'Only Org Admin or Super Admin can remove staff' });
    }
    const { rows: cur } = await db('SELECT * FROM users WHERE id=$1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ error: 'Employee not found' });
    const c = cur[0];
    await db(
      `UPDATE users SET name=$1, phone=$2, branch_id=$3, designation=$4, salary=$5,
        default_shift_id=$6, is_active=$7, status=$8, relieving_date=$9,
        relieving_reason=$10, manager_id=$11, date_of_joining=$12,
        employee_code=$13, working_days_type=$14, job_category_id=$15,
        updated_at=now() WHERE id=$16`,
      [
        name ?? c.name,
        phone ?? c.phone,
        branch_id ?? c.branch_id,
        designation ?? c.designation,
        salary ?? c.salary,
        default_shift_id !== undefined ? (default_shift_id||null) : c.default_shift_id,
        is_active ?? c.is_active,
        status ?? c.status,
        relieving_date !== undefined ? (relieving_date||null) : c.relieving_date,
        relieving_reason !== undefined ? (relieving_reason||null) : c.relieving_reason,
        manager_id !== undefined ? (manager_id||null) : c.manager_id,
        date_of_joining !== undefined ? (date_of_joining||null) : c.date_of_joining,
        employee_code !== undefined ? (employee_code||null) : c.employee_code,
        working_days_type ?? c.working_days_type ?? 30,
        job_category_id !== undefined ? (job_category_id||null) : c.job_category_id,
        req.params.id
      ]
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

// GET /api/my-shift-info — returns employee's default shift + org default
app.get('/api/my-shift-info', auth(['employee']), async (req, res) => {
  try {
    const { rows } = await db(`
      SELECT
        emp_shift.id AS emp_shift_id, emp_shift.name AS emp_shift_name,
        emp_shift.start_time AS emp_start, emp_shift.end_time AS emp_end,
        org_shift.id AS org_shift_id, org_shift.name AS org_shift_name,
        org_shift.start_time AS org_start, org_shift.end_time AS org_end
      FROM users u
      LEFT JOIN shift_templates emp_shift ON emp_shift.id = u.default_shift_id
      LEFT JOIN org_settings os ON os.org_id = u.org_id
      LEFT JOIN shift_templates org_shift ON org_shift.id = os.default_shift_id
      WHERE u.id = $1
    `, [req.user.id]);
    res.json(rows[0] || {});
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
    if (req.user.role === 'branch_admin') {
      const { rows: empCheck } = await db('SELECT branch_id FROM users WHERE id=$1', [employee_id]);
      if (empCheck[0]?.branch_id !== req.user.branch_id) {
        return res.status(403).json({ error: 'You can only override shifts for your own branch staff' });
      }
    }
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
    // Notify manager
    if (manager_id) {
      await createNotification(manager_id, oid,
        '🔄 Shift Change Request',
        `${req.user.name} requested a shift change for ${date}`,
        'shift_request', rows[0].id);
    }
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
      SELECT ar.*,
             ar.date::text AS date,
             ar.check_in_time::text AS check_in_time,
             ar.check_out_time::text AS check_out_time,
             u.name AS employee_name, u.designation,
             b.name AS branch_name, st.name AS shift_name,
             st.start_time AS shift_start, st.end_time AS shift_end
      FROM attendance_records ar
      JOIN users u ON u.id = ar.employee_id
      LEFT JOIN branches b ON b.id = ar.branch_id
      LEFT JOIN shift_templates st ON st.id = ar.shift_id
      WHERE ar.org_id = $1
    `;
    const params = [oid];
    if (date) { params.push(date); sql += ` AND ar.date::text = $${params.length}`; }
    else {
      params.push(from || todayDate); params.push(to || todayDate);
      sql += ` AND ar.date::text BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    if (req.user.role === 'employee') { params.push(req.user.id); sql += ` AND ar.employee_id = $${params.length}`; }
    else if (req.user.role === 'branch_admin') {
      params.push(req.user.branch_id); sql += ` AND ar.branch_id = $${params.length}`;
      if (employee_id) { params.push(employee_id); sql += ` AND ar.employee_id = $${params.length}`; }
    }
    else if (employee_id) { params.push(employee_id); sql += ` AND ar.employee_id = $${params.length}`; }
    sql += ' ORDER BY ar.date DESC, COALESCE(ar.slot,1) ASC, u.name LIMIT 500';
    const { rows } = await db(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Check-in
app.post('/api/attendance/checkin', auth(['employee']), async (req, res) => {
  try {
    const { branch_id, geo_lat, geo_lng, geo_verified, device_fp } = req.body;

    // ── DEVICE BINDING CHECK ─────────────────────────────────
    if (device_fp) {
      const { rows: userRows } = await db(
        'SELECT registered_device_fp FROM users WHERE id=$1', [req.user.id]
      ).catch(() => ({ rows: [] }));

      const registeredFp = userRows[0]?.registered_device_fp;

      if (registeredFp) {
        // Employee has a registered device — must match
        if (registeredFp !== device_fp) {
          return res.status(403).json({
            error: 'Attendance can only be marked from your registered mobile device. Contact your Org Admin to reset your device.',
            blocked: true,
            wrong_device: true,
          });
        }
      } else {
        // First time — register this device automatically
        await db(
          'UPDATE users SET registered_device_fp=$1, registered_device_at=now() WHERE id=$2',
          [device_fp, req.user.id]
        ).catch(() => {});
      }

      // Also check: another employee currently checked in on same device
      const istDate = nowIST().date;
      const { rows: activeRows } = await db(`
        SELECT u.name AS employee_name
        FROM attendance_records ar
        JOIN users u ON u.id = ar.employee_id
        WHERE ar.device_fp = $1
          AND ar.date::text = $2
          AND ar.employee_id != $3
          AND ar.check_out_time IS NULL
          AND ar.check_in_time IS NOT NULL
        LIMIT 1
      `, [device_fp, istDate, req.user.id]).catch(() => ({ rows: [] }));

      if (activeRows[0]) {
        return res.status(403).json({
          error: `${activeRows[0].employee_name} is currently checked in on this device. They must check out first.`,
          blocked: true,
        });
      }
    }
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

    // Fallback 1: employee default shift
    if (!shift) {
      const { rows: empDef } = await db(`
        SELECT st.id AS shift_id, st.name, st.start_time, st.end_time
        FROM users u JOIN shift_templates st ON st.id = u.default_shift_id
        WHERE u.id=$1
      `, [req.user.id]);
      shift = empDef[0];
    }

    // Fallback 2: organisation default shift
    if (!shift) {
      const { rows: orgDef } = await db(`
        SELECT st.id AS shift_id, st.name, st.start_time, st.end_time
        FROM org_settings os JOIN shift_templates st ON st.id = os.default_shift_id
        WHERE os.org_id=$1
      `, [req.user.org_id]);
      shift = orgDef[0];
    }

    if (!shift) return res.status(400).json({ error: 'No shift assigned. Ask your admin to set an organisation default shift.' });

    const { rows: settRows } = await db('SELECT * FROM org_settings WHERE org_id=$1', [oid]);
    const grace = settRows[0]?.grace_period_mins || 15;
    const shiftStartMins = toMins(shift.start_time);
    const nowMins = toMins(time);
    let lateMins = nowMins - shiftStartMins;
    if (lateMins < -720) lateMins += 1440;

    const isLate = lateMins > grace;
    const needsApproval = lateMins > grace * 2;

    // Determine slot for split shifts
    const { rows: existingRecs } = await db(
      `SELECT COALESCE(slot,1) as slot, check_out_time FROM attendance_records
       WHERE employee_id=$1 AND date::text=$2 ORDER BY COALESCE(slot,1)`,
      [req.user.id, date]
    ).catch(()=>({rows:[]}));
    const slot1Rec = existingRecs.find(r=>r.slot===1);
    const useSlot = (slot1Rec?.check_out_time) ? 2 : 1;
    if (slot1Rec && !slot1Rec.check_out_time) {
      return res.status(400).json({ error: 'Please check out from your current shift first' });
    }
    if (existingRecs.find(r=>r.slot===2)) {
      return res.status(400).json({ error: 'Both shifts complete for today' });
    }

    const { rows } = await db(`
      INSERT INTO attendance_records
        (org_id,employee_id,branch_id,shift_id,date,check_in_time,slot,
         is_late,late_mins,approval_status,geo_verified,geo_lat,geo_lng,device_fp)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [oid, req.user.id, branch_id, shift.shift_id, date, time, useSlot,
      isLate, Math.max(0, lateMins), needsApproval ? 'pending' : 'approved',
      geo_verified || false, geo_lat || null, geo_lng || null, device_fp || null]);

    if (needsApproval) {
      const { rows: mgr } = await db(
        `SELECT id FROM users WHERE branch_id=$1 AND role IN ('branch_admin','org_admin') LIMIT 1`,
        [req.user.branch_id]);
      await db(`INSERT INTO late_approvals (org_id,record_id,employee_id,manager_id,late_mins,shift_name)
                VALUES ($1,$2,$3,$4,$5,$6)`,
        [oid, rows[0].id, req.user.id, mgr[0]?.id || null, Math.max(0, lateMins), shift.name]);
      // Notify manager of late arrival
      if (mgr[0]?.id) {
        await createNotification(mgr[0].id, oid,
          '⏰ Late Arrival Approval',
          `${req.user.name} is ${Math.max(0,lateMins)} minutes late — needs your approval`,
          'approval_request', rows[0].id);
      }
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
      `SELECT ar.*, st.end_time AS shift_end
       FROM attendance_records ar
       LEFT JOIN shift_templates st ON st.id = ar.shift_id
       WHERE ar.employee_id=$1 AND ar.date::text=$2
       AND ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL
       ORDER BY COALESCE(ar.slot,1) DESC LIMIT 1`,
      [req.user.id, date]);
    if (!rows[0]) return res.status(400).json({ error: 'No active check-in found for today' });
    const rec = rows[0];
    const cinMins2 = toMins(String(rec.check_in_time||"").slice(0,5));
    const nowMins2 = toMins(time);
    const diff2 = nowMins2>=cinMins2?nowMins2-cinMins2:(1440-cinMins2+nowMins2);
    if(diff2<30) return res.status(400).json({error:`Minimum 30 minutes required. ${30-diff2} mins remaining.`});
    let checkoutTime=time, capped=false;
    if(rec.shift_end){
      const endMins=toMins(String(rec.shift_end).slice(0,5));
      const over=nowMins2>endMins?nowMins2-endMins:0;
      if(over>240){checkoutTime=String(rec.shift_end).slice(0,5);capped=true;}
    }
    const workedMins=Math.max(0,toMins(checkoutTime)-toMins(String(rec.check_in_time||"").slice(0,5)));
    // Detect early checkout
    let isEarly=false, earlyMins=0;
    if(rec.shift_end) {
      const shiftEndM = toMins(String(rec.shift_end).slice(0,5));
      const coMins = toMins(checkoutTime);
      if(coMins < shiftEndM) { isEarly=true; earlyMins=shiftEndM-coMins; }
    }
    await db(
      `UPDATE attendance_records SET check_out_time=$1,worked_mins=$2,
       checkout_type='manual', is_auto_checkout=false,
       is_early_checkout=$3, early_mins=$4,
       notes=CASE WHEN $5 THEN 'Auto-capped: checked out 4h+ after shift end' ELSE notes END
       WHERE id=$6`,
      [checkoutTime,workedMins,isEarly,earlyMins,capped,rec.id]
    );
    res.json({ok:true,worked_mins:workedMins,slot:rec.slot||1,capped,is_early:isEarly,early_mins:earlyMins,
      message:capped?`Checkout capped at shift end (${checkoutTime})`:isEarly?`Early checkout — ${earlyMins} mins before shift end`:null});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin mark / edit attendance for any date
app.post('/api/attendance/admin-mark', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { employee_id, date, check_in_time, check_out_time, notes, clear } = req.body;

    // Clear attendance
    if (clear === true) {
      await db('DELETE FROM attendance_records WHERE employee_id=$1 AND date::text=$2', [employee_id, date]);
      return res.json({ ok: true, cleared: true });
    }

    if (!check_in_time) return res.status(400).json({ error: 'Check-in time required' });
    if (!notes || !notes.trim()) return res.status(400).json({ error: 'Reason for edit is required' });

    const { rows: sch } = await db(`
      SELECT ss.shift_id, st.start_time
      FROM shift_schedules ss JOIN shift_templates st ON st.id=ss.shift_id
      WHERE ss.employee_id=$1 AND ss.date=$2 ORDER BY ss.is_override DESC LIMIT 1
    `, [employee_id, date]);

    const cinMins = toMins(check_in_time);
    const workedMins = check_out_time ? Math.max(0, toMins(check_out_time) - cinMins) : null;

    // Admin edit does NOT recalculate late — preserve existing or set false
    // Admin is correcting records, not penalising
    const { rows: existing } = await db(
      'SELECT is_late, late_mins FROM attendance_records WHERE employee_id=$1 AND date::text=$2 LIMIT 1',
      [employee_id, date]
    );
    const keepIsLate = existing[0]?.is_late || false;
    const keepLateMins = existing[0]?.late_mins || 0;

    await db(`
      INSERT INTO attendance_records
        (org_id,employee_id,shift_id,date,check_in_time,check_out_time,worked_mins,
         is_late,late_mins,approval_status,admin_edited,edited_by,edited_at,geo_verified,notes,checkout_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',true,$10,now(),false,$11,'manual')
      ON CONFLICT (employee_id,date)
      DO UPDATE SET check_in_time=$5,check_out_time=$6,worked_mins=$7,
                    approval_status='approved',admin_edited=true,edited_by=$10,edited_at=now(),
                    notes=$11,checkout_type='manual',updated_at=now()
    `, [oid, employee_id, sch[0]?.shift_id || null, date, check_in_time, check_out_time || null,
      workedMins, keepIsLate, keepLateMins, req.user.id, notes]);

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
      'UPDATE late_approvals SET status=$1,decided_by=$2,decided_at=now() WHERE id=$3 RETURNING record_id,employee_id,org_id',
      [req.body.status, req.user.id, req.params.id]);
    await db('UPDATE attendance_records SET approval_status=$1 WHERE id=$2',
      [req.body.status, rows[0].record_id]);
    // Notify employee of decision
    const decision = req.body.status === 'approved' ? '✅ Approved' : '❌ Rejected';
    await createNotification(rows[0].employee_id, rows[0].org_id,
      `Late arrival ${decision}`,
      `Your late arrival request has been ${req.body.status} by ${req.user.name}`,
      'approval_decision', req.params.id);
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
    if (from) { params.push(from); sql += ` AND l.date::text>=$${params.length}`; }
    if (to) { params.push(to); sql += ` AND l.date::text<=$${params.length}`; }
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
// SALARY — employee self-service endpoint (with advance deductions + grace slabs)
// ============================================================

app.get('/api/my-salary', auth(['employee']), async (req, res) => {
  try {
    const now = new Date();
    const y = parseInt(req.query.year || now.getFullYear());
    const m = parseInt(req.query.month || (now.getMonth() + 1));
    const from = `${y}-${pad(m)}-01`;
    const to = new Date(y, m, 0).toISOString().split('T')[0];

    const [{ rows: settRows }, { rows: att }, { rows: lvs }, { rows: uRows }, { rows: advRows }] = await Promise.all([
      db('SELECT * FROM org_settings WHERE org_id=$1', [req.user.org_id]),
      db('SELECT * FROM attendance_records WHERE employee_id=$1 AND date BETWEEN $2 AND $3', [req.user.id, from, to]),
      db('SELECT * FROM leaves WHERE employee_id=$1 AND date BETWEEN $2 AND $3', [req.user.id, from, to]),
      db('SELECT salary, working_days_type FROM users WHERE id=$1', [req.user.id]),
      db(`SELECT COALESCE(SUM(monthly_recovery),0) AS monthly_deduction
          FROM salary_advances WHERE employee_id=$1 AND status='recovering'`, [req.user.id]),
    ]);

    const s = settRows[0] || {};
    const salary = Number(uRows[0]?.salary || 0);
    const workingDays = uRows[0]?.working_days_type || s.working_days_per_month || 26;
    // Get job category for this employee
    const { rows: catRows } = await db(`
      SELECT jc.* FROM job_categories jc
      JOIN users u ON u.job_category_id = jc.id
      WHERE u.id=$1
    `, [req.user.id]).catch(()=>({rows:[]}));
    const cat = catRows[0];

    const presentDays = att.filter(a => a.check_in_time).length;
    const lateDays = att.filter(a => a.is_late && a.approval_status !== 'rejected').length;
    const clUsed = lvs.filter(l => l.type === 'casual').length;
    const slUsed = lvs.filter(l => l.type === 'sick').length;
    const unauthLeaves = lvs.filter(l => l.type === 'unauthorized').length;
    const noShows = lvs.filter(l => l.type === 'noshow').length;
    const earlyCheckouts = att.filter(a => a.is_early_checkout && !a.early_penalty_waived).length;
    const earlyMinsTotal = att.filter(a=>a.is_early_checkout&&!a.early_penalty_waived).reduce((s,a)=>s+Number(a.early_mins||0),0);

    // Category-based leave eligibility
    const clAllowed = cat?.cl_per_month || 0;
    const slAllowed = cat?.sl_per_month || 0;
    const clExcess = Math.max(0, clUsed - clAllowed);
    const slExcess = Math.max(0, slUsed - slAllowed);

    const divisor = cat?.working_days_type || workingDays;
    const dailyRate = salary / divisor;
    const hourlyRate = dailyRate / 8;
    const earnedGross = presentDays * dailyRate;

    const monthlyGraceDays = s.monthly_grace_days || 3;
    const chronicThreshold = s.chronic_late_threshold || 6;
    const normalLates = Math.max(0, Math.min(lateDays, monthlyGraceDays));
    const excessLates = Math.max(0, lateDays - monthlyGraceDays);
    const lateDeductions =
      normalLates * (s.late_deduction_per_occ || 50) +
      (excessLates > 0 ? excessLates * (s.excess_late_deduction || 100) : 0) +
      (lateDays >= chronicThreshold ? excessLates * (s.chronic_late_deduction || 200) : 0);

    const leaveDeductions = (unauthLeaves * dailyRate) + (clExcess * dailyRate) + (slExcess * dailyRate);
    const noShowDeductions = noShows * dailyRate;
    const earlyDeductions = earlyCheckouts * (s.early_checkout_flat_penalty || 50) +
      Math.round((earlyMinsTotal / 60) * hourlyRate);
    const advanceDeduction = Number(advRows[0]?.monthly_deduction || 0);
    const totalDeductions = lateDeductions + leaveDeductions + noShowDeductions + earlyDeductions + advanceDeduction;

    res.json({
      salary, workingDays: divisor, presentDays, lateDays, clUsed, slUsed,
      clAllowed, slAllowed, clExcess, slExcess,
      unauthLeaves, noShows, normalLates, excessLates,
      dailyRate, earnedGross, lateDeductions,
      leaveDeductions, noShowDeductions, earlyDeductions,
      earlyCheckouts, advanceDeduction,
      totalDeductions, netEarned: Math.max(0, earnedGross - totalDeductions),
      category: cat?.name || null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
          ${req.user.role === 'branch_admin' ? "AND u.branch_id='" + req.user.branch_id + "'" : ''}
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
      const wdm = emp.working_days_type || 30;
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

// ── SALARY ADVANCES ───────────────────────────────────────────

// GET all advances (admin) or own advances (employee)
app.get('/api/advances', auth(), async (req, res) => {
  try {
    const oid = orgId(req);
    let sql = `
      SELECT sa.*, u.name AS employee_name, u.designation, u.branch_id,
             b.name AS branch_name, ap.name AS approved_by_name
      FROM salary_advances sa
      JOIN users u ON u.id = sa.employee_id
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN users ap ON ap.id = sa.approved_by
      WHERE sa.org_id = $1
    `;
    const params = [oid];
    if (req.user.role === 'employee') {
      params.push(req.user.id);
      sql += ` AND sa.employee_id = $${params.length}`;
    } else if (req.user.role === 'branch_admin') {
      params.push(req.user.branch_id);
      sql += ` AND u.branch_id = $${params.length}`;
    }
    sql += ' ORDER BY sa.created_at DESC LIMIT 200';
    const { rows } = await db(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST — employee requests advance
app.post('/api/advances', auth(), async (req, res) => {
  try {
    const oid = req.user.role === 'super_admin' ? req.body.org_id : req.user.org_id;
    const { amount, reason, needed_by_date, is_emergency } = req.body;

    // Check advance notice policy for non-emergency requests
    if (!is_emergency && needed_by_date) {
      const { rows: settRows } = await db('SELECT advance_notice_days, max_advance_amount FROM org_settings WHERE org_id=$1', [oid]);
      const s = settRows[0] || {};
      const noticeDays = s.advance_notice_days || 5;
      const maxAmount = s.max_advance_amount || 10000;
      const daysUntil = (new Date(needed_by_date) - new Date()) / (1000 * 60 * 60 * 24);
      if (daysUntil < noticeDays) return res.status(400).json({ error: `Advances must be requested ${noticeDays} days in advance. Mark as emergency if urgent.` });
      if (amount > maxAmount) return res.status(400).json({ error: `Maximum advance amount is ₹${maxAmount}` });
    }

    const { rows } = await db(
      `INSERT INTO salary_advances (org_id, employee_id, amount, reason, needed_by_date, is_emergency, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [oid, req.user.id, amount, reason, needed_by_date || null, is_emergency || false]
    );
    // Notify org admin
    const { rows: orgAdmins } = await db(
      `SELECT id FROM users WHERE org_id=$1 AND role='org_admin' AND is_active=true`, [oid]);
    for (const admin of orgAdmins) {
      await createNotification(admin.id, oid,
        `${is_emergency ? '🚨 Emergency' : '💰 New'} Advance Request`,
        `${req.user.name} requested ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(amount)}`,
        'advance_request', rows[0].id);
    }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST — admin records a manual payment (no prior request)
app.post('/api/advances/manual', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { employee_id, amount, reason, payment_date, payment_notes, bank_used, recovery_months, is_emergency } = req.body;
    const { rows } = await db(
      `INSERT INTO salary_advances
        (org_id, employee_id, amount, reason, is_emergency, status,
         payment_date, payment_notes, bank_used, approved_by,
         recovery_months, monthly_recovery, recovered_amount)
       VALUES ($1,$2,$3,$4,$5,'recovering',$6,$7,$8,$9,$10,$11,0) RETURNING *`,
      [oid, employee_id, amount, reason || "Admin recorded payment",
       is_emergency || false, payment_date, payment_notes, bank_used,
       req.user.id, recovery_months || 1,
       Math.round((amount / (recovery_months || 1)) * 100) / 100]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH — approve, reject, or record payment
app.patch('/api/advances/:id', auth(['super_admin', 'org_admin']), async (req, res) => {
  try {
    const { status, rejected_reason, payment_date, payment_notes, bank_used, recovery_months, monthly_recovery } = req.body;
    const updates = [];
    const params = [];
    const add = (field, val) => { params.push(val); updates.push(`${field}=$${params.length}`); };

    if (status) add('status', status);
    if (status === 'approved') { add('approved_by', req.user.id); add('approved_at', new Date().toISOString()); }
    if (rejected_reason) add('rejected_reason', rejected_reason);
    if (payment_date) add('payment_date', payment_date);
    if (payment_notes) add('payment_notes', payment_notes);
    if (bank_used) add('bank_used', bank_used);
    if (recovery_months) add('recovery_months', recovery_months);
    if (monthly_recovery) add('monthly_recovery', monthly_recovery);
    if (status === 'recovering') add('paid_by', req.user.id);
    add('updated_at', new Date().toISOString());

    params.push(req.params.id);
    await db(`UPDATE salary_advances SET ${updates.join(',')} WHERE id=$${params.length}`, params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET advance recoveries for an employee
app.get('/api/advances/recoveries', auth(['super_admin', 'org_admin', 'branch_admin']), async (req, res) => {
  try {
    const { employee_id } = req.query;
    const oid = orgId(req);
    const { rows } = await db(
      `SELECT ar.*, sa.amount AS advance_amount, sa.reason AS advance_reason
       FROM advance_recoveries ar
       JOIN salary_advances sa ON sa.id = ar.advance_id
       WHERE ar.org_id=$1 ${employee_id ? 'AND ar.employee_id=$2' : ''}
       ORDER BY ar.year DESC, ar.month DESC`,
      employee_id ? [oid, employee_id] : [oid]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PUSH NOTIFICATIONS & SUBSCRIPTIONS
// ============================================================

// GET VAPID public key
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || '' });
});

// POST subscribe to push
app.post('/api/push/subscribe', auth(), async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    await db(`
      INSERT INTO push_subscriptions (user_id, org_id, endpoint, p256dh, auth, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh=$4, auth=$5
    `, [req.user.id, req.user.org_id, endpoint, keys.p256dh, keys.auth, req.headers['user-agent']]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE unsubscribe
app.delete('/api/push/subscribe', auth(), async (req, res) => {
  try {
    await db('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',
      [req.user.id, req.body.endpoint]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET notifications for current user
app.get('/api/notifications', auth(), async (req, res) => {
  try {
    const { rows } = await db(`
      SELECT * FROM notifications WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 50
    `, [req.user.id]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET unread count
app.get('/api/notifications/count', auth(), async (req, res) => {
  try {
    const { rows } = await db(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND is_read=false',
      [req.user.id]);
    res.json({ count: parseInt(rows[0]?.count || 0) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH mark notifications as read
app.patch('/api/notifications/read', auth(), async (req, res) => {
  try {
    await db('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// EARLY CHECKOUT WAIVE
// ============================================================

app.patch('/api/attendance/:id/waive-early', auth(['super_admin','org_admin','branch_admin']), async (req, res) => {
  try {
    await db(
      'UPDATE attendance_records SET early_penalty_waived=true, early_waived_by=$1 WHERE id=$2',
      [req.user.id, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// DEVICE MANAGEMENT
// ============================================================

// GET employees with registered devices (for admin)
app.get('/api/devices', auth(['super_admin','org_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { rows } = await db(`
      SELECT u.id, u.name, u.phone, u.designation, b.name AS branch_name,
             u.registered_device_fp, u.registered_device_at
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      WHERE u.org_id=$1 AND u.is_active=true AND u.role NOT IN ('super_admin','org_admin')
      ORDER BY u.name
    `, [oid]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH reset employee device
app.patch('/api/devices/:employee_id/reset', auth(['super_admin','org_admin']), async (req, res) => {
  try {
    await db(
      'UPDATE users SET registered_device_fp=NULL, registered_device_at=NULL WHERE id=$1',
      [req.params.employee_id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// DEVICE FINGERPRINT MANAGEMENT
// ============================================================

app.get('/api/device-blocks', auth(['super_admin','org_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { rows } = await db(`
      SELECT ar.device_fp,
             array_agg(DISTINCT u.name) AS employees,
             array_agg(DISTINCT ar.employee_id) AS employee_ids,
             COUNT(DISTINCT ar.employee_id) AS unique_employees
      FROM attendance_records ar
      JOIN users u ON u.id = ar.employee_id
      WHERE ar.org_id=$1 AND ar.date::text=CURRENT_DATE::text
        AND ar.device_fp IS NOT NULL
      GROUP BY ar.device_fp
      ORDER BY unique_employees DESC
    `, [oid]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/device-blocks/clear', auth(['super_admin','org_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { employee_id, clear_all, date } = req.body;
    const clearDate = date || new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'});
    if (clear_all) {
      await db('UPDATE attendance_records SET device_fp=NULL WHERE org_id=$1 AND date::text=$2', [oid, clearDate]);
      return res.json({ ok: true, message: 'All fingerprints cleared for ' + clearDate });
    }
    await db('UPDATE attendance_records SET device_fp=NULL WHERE employee_id=$1 AND date::text=$2', [employee_id, clearDate]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// JOB CATEGORIES
// ============================================================

app.get('/api/job-categories', auth(), async (req, res) => {
  try {
    const oid = orgId(req);
    const { rows } = await db(
      'SELECT * FROM job_categories WHERE org_id=$1 AND is_active=true ORDER BY name', [oid]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/job-categories', auth(['super_admin','org_admin']), async (req, res) => {
  try {
    const oid = orgId(req);
    const { name, working_days_type, sunday_off, weekly_off, cl_per_month, sl_per_month, paid_off_days, description } = req.body;
    // Derive sunday_off from weekly_off
    const hasSundayOff = weekly_off === 'sunday' || weekly_off === 'saturday_sunday' || sunday_off !== false;
    const hasSaturdayOff = weekly_off === 'saturday_sunday';
    const { rows } = await db(
      `INSERT INTO job_categories (org_id,name,working_days_type,sunday_off,cl_per_month,sl_per_month,paid_off_days,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [oid, name, working_days_type||26, hasSundayOff, cl_per_month||0, sl_per_month||0, paid_off_days||0, description||null]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/job-categories/:id', auth(['super_admin','org_admin']), async (req, res) => {
  try {
    const { name, working_days_type, sunday_off, cl_per_month, sl_per_month, paid_off_days, description, is_active } = req.body;
    const { rows: cur } = await db('SELECT * FROM job_categories WHERE id=$1', [req.params.id]);
    if(!cur[0]) return res.status(404).json({ error: 'Category not found' });
    const c = cur[0];
    await db(
      `UPDATE job_categories SET name=$1,working_days_type=$2,sunday_off=$3,cl_per_month=$4,
       sl_per_month=$5,paid_off_days=$6,description=$7,is_active=$8 WHERE id=$9`,
      [name??c.name, working_days_type??c.working_days_type, sunday_off??c.sunday_off,
       cl_per_month??c.cl_per_month, sl_per_month??c.sl_per_month,
       paid_off_days??c.paid_off_days, description??c.description,
       is_active??c.is_active, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/job-categories/:id', auth(['super_admin','org_admin']), async (req, res) => {
  try {
    await db('UPDATE job_categories SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// AUTO-CHECKOUT CRON — with 15 min grace window
// ============================================================

// ============================================================

app.post('/api/cron/auto-checkout', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET)
    return res.status(401).end();
  try {
    const { date, time } = nowIST();
    // Get grace window from org settings (default 15 mins)
    // Auto-checkout employees who checked in but not checked out
    // and whose shift ended more than grace_mins ago
    const { rows: toCheckout } = await db(`
      SELECT ar.id, ar.employee_id, ar.org_id, ar.shift_id,
             st.end_time, os.auto_checkout_grace_mins,
             ar.check_in_time
      FROM attendance_records ar
      JOIN shift_templates st ON st.id = ar.shift_id
      LEFT JOIN org_settings os ON os.org_id = ar.org_id
      WHERE ar.date::text = $1
        AND ar.check_in_time IS NOT NULL
        AND ar.check_out_time IS NULL
        AND (
          -- shift end + grace period has passed
          st.end_time::time + (COALESCE(os.auto_checkout_grace_mins,15) || ' minutes')::interval
          < NOW() AT TIME ZONE 'Asia/Kolkata'
        )
    `, [date]);

    let count = 0;
    for (const rec of toCheckout) {
      const checkoutTime = String(rec.end_time).slice(0,5);
      const cinMins = toMins(String(rec.check_in_time).slice(0,5));
      const endMins = toMins(checkoutTime);
      const worked = Math.max(0, endMins - cinMins);
      await db(`
        UPDATE attendance_records
        SET check_out_time=$1, worked_mins=$2,
            is_auto_checkout=true, checkout_type='auto',
            notes=COALESCE(notes||' | ','') || 'Auto checkout — employee did not manually check out',
            updated_at=now()
        WHERE id=$3
      `, [checkoutTime, worked, rec.id]);
      count++;
    }
    res.json({ ok: true, auto_checked_out: count, ts: new Date() });
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