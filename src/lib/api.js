// ============================================================
// SmartAi Attendance — Frontend API Client
// src/lib/api.js
//
// KEY DIFFERENCE from Netlify version:
// In Railway full-stack deployment, the frontend and API are
// on the SAME origin — no cross-origin requests, no CORS issues,
// no VITE_API_URL env var needed in production.
//
// Dev: Vite proxy forwards /api → localhost:3001
// Prod: Express handles /api directly, serves React for everything else
// ============================================================

// No base URL needed — same origin in production
// Vite proxy handles /api in development automatically
const BASE = '';

// ── TOKEN ────────────────────────────────────────────────────
export const token = {
  get:   () => localStorage.getItem('saa_token'),
  set:   (t) => localStorage.setItem('saa_token', t),
  clear: () => localStorage.removeItem('saa_token'),
};

// ── FETCH WRAPPER ─────────────────────────────────────────────
async function req(method, path, body, params) {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token.get() ? { Authorization: `Bearer ${token.get()}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401) {
    token.clear();
    window.location.href = '/';
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

const get  = (path, params) => req('GET',   path, null, params);
const post = (path, body)   => req('POST',  path, body);
const patch= (path, body)   => req('PATCH', path, body);

// ── AUTH ──────────────────────────────────────────────────────
export const auth = {
  login:          (phone, password)                  => post('/api/auth/login', { phone, password }),
  changePassword: (current_password, new_password)   => post('/api/auth/change-password', { current_password, new_password }),
};

// ── ORGANIZATIONS ─────────────────────────────────────────────
export const orgs = {
  list:           ()                     => get('/api/orgs'),
  create:         (data)                 => post('/api/orgs', data),
  getSettings:    (org_id = 'me')        => get(`/api/orgs/${org_id}/settings`),
  updateSettings: (settings, org_id='me')=> patch(`/api/orgs/${org_id}/settings`, settings),
};

// ── BRANCHES ──────────────────────────────────────────────────
export const branches = {
  list:   (org_id)      => get('/api/branches', { org_id }),
  create: (data)        => post('/api/branches', data),
  update: (id, data)    => patch(`/api/branches/${id}`, data),
};

// ── EMPLOYEES ─────────────────────────────────────────────────
export const employees = {
  list:          (org_id)          => get('/api/employees', { org_id }),
  create:        (data)            => post('/api/employees', data),
  update:        (id, data)        => patch(`/api/employees/${id}`, data),
  resetPassword: (id, password)    => post(`/api/employees/${id}/reset-password`, { password }),
};

// ── SHIFTS ────────────────────────────────────────────────────
export const shifts = {
  list:   (org_id) => get('/api/shifts', { org_id }),
  create: (data)   => post('/api/shifts', data),
  update: (id, data) => patch(`/api/shifts/${id}`, data),
};

// ── SCHEDULES ─────────────────────────────────────────────────
export const schedules = {
  list:     ({ from, to, employee_id, org_id }) => get('/api/schedules', { from, to, employee_id, org_id }),
  bulk:     (data)                              => post('/api/schedules/bulk', data),
  override: (data)                              => post('/api/schedules/override', data),
};

// ── SHIFT REQUESTS ────────────────────────────────────────────
export const shiftRequests = {
  list:   (org_id)          => get('/api/shift-requests', { org_id }),
  create: (data)            => post('/api/shift-requests', data),
  decide: (id, status)      => patch(`/api/shift-requests/${id}`, { status }),
};

// ── ATTENDANCE ────────────────────────────────────────────────
export const attendance = {
  list:      ({ from, to, date, employee_id, org_id }) =>
               get('/api/attendance', { from, to, date, employee_id, org_id }),
  checkIn:   (data) => post('/api/attendance/checkin', data),
  checkOut:  (data) => post('/api/attendance/checkout', data),
  adminMark: (data) => post('/api/attendance/admin-mark', data),
  update:    (id, data) => patch(`/api/attendance/${id}`, data),
};

// ── APPROVALS ─────────────────────────────────────────────────
export const approvals = {
  list:   (org_id)       => get('/api/approvals', { org_id }),
  decide: (id, status)   => patch(`/api/approvals/${id}`, { status }),
};

// ── LEAVES ────────────────────────────────────────────────────
export const leaves = {
  list:   ({ employee_id, from, to, org_id }) => get('/api/leaves', { employee_id, from, to, org_id }),
  create: (data)                              => post('/api/leaves', data),
};

// ── REPORTS ───────────────────────────────────────────────────
export const reports = {
  salary: ({ year, month, org_id }) => get('/api/salary-report', { year, month, org_id }),
};

// ── UTILITIES ─────────────────────────────────────────────────
export const todayIST = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const dateRange = {
  thisMonth: () => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    return {
      from: `${y}-${String(m).padStart(2,'0')}-01`,
      to: new Date(y, m, 0).toISOString().split('T')[0],
    };
  },
  lastNDays: (n) => {
    const to = todayIST();
    const d = new Date(); d.setDate(d.getDate() - n);
    return { from: d.toISOString().split('T')[0], to };
  },
};

export const fmt = {
  currency: (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
  date:     (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' }),
  dateFull: (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
  time:     (t) => t ? String(t).slice(0, 5) : '—',
};
