# SmartAi Attendance — Railway-Only Deploy Guide
# Everything runs on Railway: PostgreSQL + Express API + React PWA
# One service. One URL. One bill.
# ============================================================

## HOW IT WORKS

```
Your Railway Project
├── PostgreSQL service   (managed database)
└── Web service          (Node.js — does EVERYTHING)
    ├── npm run build    → compiles React into dist/
    ├── node server/index.js → starts Express
    │   ├── GET /api/*   → handles all API requests
    │   └── GET /*       → serves dist/index.html (React PWA)
    └── One URL for everything: https://smartai-attendance.up.railway.app
```

No Netlify. No separate frontend hosting. No CORS issues.
In production, the frontend and API are the same origin.

---

## COMPLETE FOLDER STRUCTURE

```
smartai-attendance/          ← your GitHub repo root
├── server/
│   └── index.js             ← Express (API + static serving)
├── src/
│   ├── lib/
│   │   └── api.js           ← frontend API client
│   ├── App.jsx              ← your React app
│   ├── main.jsx
│   └── pages/
│       ├── admin/
│       └── employee/
├── public/
│   ├── manifest.json        ← PWA config
│   ├── sw.js                ← service worker
│   └── icons/               ← app icons
├── supabase/
│   └── schema.sql           ← run once on Railway PostgreSQL
├── package.json             ← single package.json for everything
├── vite.config.js
├── .env                     ← local only, never commit
└── .env.example             ← commit this (no real values)
```

---

## STEP 1 — PUSH CODE TO GITHUB

```bash
git init
git add .
git commit -m "Initial SmartAi Attendance"
git remote add origin https://github.com/YOUR_USERNAME/smartai-attendance.git
git push -u origin main
```

---

## STEP 2 — CREATE RAILWAY PROJECT

1. Go to railway.app → Login with GitHub
2. New Project → Empty Project
3. Name it: `smartai-attendance`

---

## STEP 3 — ADD POSTGRESQL

1. Inside the project → **+ Add Service** → **Database** → **PostgreSQL**
2. Railway provisions it in ~30 seconds
3. Click the PostgreSQL service → **Data** tab → **Query**
4. Paste the entire `supabase/schema.sql` file and click **Run**
5. You'll see confirmation that all tables were created

---

## STEP 4 — ADD WEB SERVICE

1. **+ Add Service** → **GitHub Repo** → select your repo
2. Railway detects Node.js automatically

### Set these environment variables:
Click the Web service → **Variables** tab → add each one:

```
DATABASE_URL   = (click "Add Reference" → select your PostgreSQL service → DATABASE_URL)
               ↑ Railway links this automatically — no manual copying needed

JWT_SECRET     = (paste a 64-char random string — generate below)
CRON_SECRET    = (another random string)
NODE_ENV       = production
PORT           = 3001
```

### Generate secrets (run in any terminal):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run twice — once for JWT_SECRET, once for CRON_SECRET.

### Set build and start commands:
- **Build Command:** `npm install && npm run build`
- **Start Command:** `node server/index.js`

---

## STEP 5 — DEPLOY

Railway auto-deploys when you push to GitHub.

The deploy process:
1. `npm install` — installs all dependencies
2. `npm run build` — Vite compiles React → `dist/`
3. `node server/index.js` — Express starts, serves `dist/` + API

Your app will be live at:
`https://smartai-attendance-production.up.railway.app`

Test it:
```
https://your-app.up.railway.app/health
```
Should return: `{"ok":true,"db":"connected"}`

---

## STEP 6 — SET SUPER ADMIN PASSWORD

The schema seeds a placeholder password. Change it immediately.

In Railway → PostgreSQL → **Data** → **Query**:

```sql
-- Replace YOUR_PASSWORD with your actual password
UPDATE users
SET password_hash = crypt('YOUR_PASSWORD', gen_salt('bf', 10))
WHERE phone = '9999999999' AND role = 'super_admin';
```

---

## STEP 7 — AUTO-CHECKOUT CRON

Railway doesn't have built-in cron. Use cron-job.org (free):

1. Go to cron-job.org → Create free account
2. New cronjob:
   - **URL:** `https://your-app.up.railway.app/api/cron/auto-checkout`
   - **Method:** POST
   - **Headers:** Add header `x-cron-secret` = your CRON_SECRET value
   - **Schedule:** Every minute `* * * * *`
3. Save

That's it — auto-checkout runs every minute for all orgs.

---

## STEP 8 — CUSTOM DOMAIN (optional)

Railway Web service → **Settings** → **Networking** → **+ Custom Domain**

Add: `attendance.yourdomain.com`

Then in your domain DNS, add a CNAME:
```
attendance  →  your-app.up.railway.app
```

Railway auto-provisions HTTPS (Let's Encrypt) — takes ~2 minutes.

---

## LOCAL DEVELOPMENT

```bash
# 1. Copy env file
cp .env.example .env

# 2. Fill in .env with your Railway DATABASE_URL
#    Get it from: Railway → PostgreSQL → Variables → DATABASE_URL

# 3. Install deps
npm install

# 4. Run both API and frontend together
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001
- Vite proxy automatically forwards /api → 3001 in development

---

## ENVIRONMENT FILES

### .env (local development — NEVER commit)
```
DATABASE_URL=postgresql://postgres:password@containers-us-west.railway.app:5432/railway
JWT_SECRET=your-64-char-secret-here
CRON_SECRET=another-secret-here
NODE_ENV=development
PORT=3001
```

### .env.example (commit this — no real values)
```
DATABASE_URL=
JWT_SECRET=
CRON_SECRET=
NODE_ENV=production
PORT=3001
```

---

## COST ON RAILWAY (under 50 employees)

| Resource          | Usage           | Monthly cost     |
|-------------------|-----------------|------------------|
| PostgreSQL        | ~50–100MB       | ~$2–3  (~₹250)  |
| Web service       | Low traffic     | ~$3–5  (~₹420)  |
| **Total**         |                 | **~₹600–700/mo** |

Railway bills per-second — if nobody is using the app at 3am, you're not being charged for idle compute.

---

## RE-DEPLOY AFTER CODE CHANGES

Just push to GitHub:
```bash
git add .
git commit -m "your change"
git push
```
Railway detects the push, rebuilds, and redeploys automatically in ~2 minutes.
Zero downtime — Railway keeps the old version running until the new one is ready.

---

## SECURITY CHECKLIST

- [ ] Super admin password changed from seed data
- [ ] JWT_SECRET is 64+ random characters (not a word)
- [ ] CRON_SECRET is set and used in cron-job.org
- [ ] DATABASE_URL is only in Railway environment variables
- [ ] .env is in .gitignore
- [ ] All employee default passwords (1234) changed after first login

---

## TROUBLESHOOTING

**App loads but API returns errors:**
- Check Railway Web service logs → Deploy tab → View Logs
- Make sure DATABASE_URL is linked (not manually typed)
- Run `/health` endpoint to test DB connection

**White screen / React not loading:**
- Check build logs — Vite build must succeed before Express starts
- Make sure `dist/` folder exists in deploy logs

**Login fails:**
- Confirm schema.sql was run successfully
- Check users table has rows: `SELECT phone, role FROM users LIMIT 5;`
- Password hash must be bcrypt — regenerate if seeding manually

**Geo-fence not working:**
- Browser requires HTTPS for geolocation API
- Railway provides HTTPS automatically — local dev uses http so geo will fallback
