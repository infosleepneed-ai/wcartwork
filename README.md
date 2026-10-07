# WC Artwork Hub

Artwork request, review and approval system for West-Coast Pharmaceutical Works Ltd.
React + Vite frontend, Supabase backend (database, login, file storage, realtime), deployed on Vercel.

---

## Deploy in 5 steps (about 20 minutes)

### Step 1 — Create the Supabase project
1. Go to https://supabase.com → **New project**.
2. Name: `wc-artwork-hub`. Region: **Mumbai (ap-south-1)** (closest to Gujarat).
3. Set a strong database password and save it somewhere safe.
4. Wait about 2 minutes for the project to start.

### Step 2 — Create the database
1. In Supabase, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it, click **Run**.
3. You should see `Success. No rows returned`.
   (The file is safe to run again later — it won't duplicate anything.)

This creates all tables, the 6-stage approval workflow, security rules, the private
`artwork-files` storage bucket, realtime, and seeds countries plus 5 products.

### Step 3 — Push the code to GitHub
1. Create a new **private** repository on GitHub, e.g. `wc-artwork-hub`.
2. Upload the contents of this folder (not the folder itself) — `package.json` must be at the repo root.
   Do **not** upload `node_modules` or a `.env` file.

### Step 4 — Deploy on Vercel
1. Go to https://vercel.com → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Vite** (auto-detected). Leave build settings as they are.
3. Open **Environment Variables** and add:

   | Name | Value (from Supabase → Project Settings → API) |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL, e.g. `https://abcd1234.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `anon` `public` key |
   | `VITE_ENABLE_MICROSOFT` | `false` |

4. Click **Deploy**. Copy your live URL, e.g. `https://wc-artwork-hub.vercel.app`.

### Step 5 — Connect login to your live URL
1. Supabase → **Authentication → URL Configuration**.
2. **Site URL**: your Vercel URL.
3. **Redirect URLs** → add: `https://YOUR-APP.vercel.app/**`
4. Save.

Done. Open the app and click **Create an account**.

---

## First login — set up roles

**The first person to sign up becomes Admin automatically.** Everyone after that joins as Design.

1. Sign up yourself first (you become Admin).
2. Ask colleagues to sign up with their work email.
3. Go to **Admin → Users & Roles** and set each person's role:

| Role | Can sign |
|---|---|
| Design | Design Review; creates artwork, uploads versions, fixes corrections |
| Regulatory | Regulatory Review |
| Export | Export Review and Customer Approval |
| QA | Final Approval |
| Management | Views everything, signs nothing |
| Admin | Any step, manages users |

Tip: to stop strangers signing up, go to Supabase → **Authentication → Sign In / Providers → Email**
and turn off **Allow new users to sign up** once your team has joined. Invite new people from
Supabase → **Authentication → Users → Invite user**.

---

## How the workflow runs

```
Artwork Created → Design Review → Regulatory Review → Export Review → Customer Approval → Final Approval
```

- **Create Request** (sidebar or `+ Create`): product → market → packaging → files → review. The form autosaves.
- **Review**: open an artwork, turn on **Comment**, click on the artwork to drop a numbered pin.
- **Request Correction** sends it back to Design. When Design uploads a new version, it returns to the same step.
- **Approve**: on the Approval page, pick a decision and confirm with your password (electronic signature).
- Every action is written to the **audit trail** and notifies the next team in the app.

Artwork files: **PDF, PNG, JPG** preview in the viewer. Reference documents can be any type (DOCX, XLSX…).

Keyboard: **Ctrl K** (or ⌘ K) opens search from anywhere.

---

## Optional — Microsoft 365 login
1. Azure Portal → App registrations → New registration. Redirect URI:
   `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
2. Create a client secret.
3. Supabase → Authentication → Sign In / Providers → **Azure** → paste Client ID, Secret,
   and Tenant URL `https://login.microsoftonline.com/YOUR-TENANT-ID`. Enable it.
4. In Vercel set `VITE_ENABLE_MICROSOFT=true` and redeploy.

Microsoft users sign approvals with a confirmation checkbox instead of a password.

---

## Run on your computer (optional)
```bash
npm install
cp .env.example .env      # then fill in your Supabase URL and anon key
npm run dev               # opens http://localhost:5173
```
Add `http://localhost:5173/**` to Supabase Redirect URLs for local login.

---

## Troubleshooting

| What you see | Fix |
|---|---|
| "Supabase isn't connected yet" on login | Env variables missing in Vercel → add them → **Redeploy** |
| Login email link opens localhost | Step 5: Site URL must be the Vercel URL |
| "relation … does not exist" | Step 2 wasn't run, or ran in a different project |
| "Only the Regulatory team can sign…" | Correct — change the person's role in Users & Roles |
| Page 404 after refresh | `vercel.json` must be in the repo root |
| New user can't log in | Supabase sends a confirmation email first; check spam |

## Project structure
```
supabase/schema.sql      Database, workflow engine, security, storage
src/pages/               Login, Dashboard, AllArtwork, ArtworkReview, ArtworkApproval, Users & Roles, Master data
src/components/          Sidebar, Topbar, Command palette, Notifications, WC Assist, Viewer, Modals
src/lib/                 Supabase client, data API, auth, shared store
```
Dossier, Reports, Analytics and Settings screens show a "coming next" page — the menu is ready for them.
