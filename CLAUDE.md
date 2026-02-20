# CLAUDE.md

## What This App Is

PEP Tasks — internal task ticketing system for PEP School staff (~15 people). Higher-ups assign tasks with due dates and priority, staff provide updates, mark complete, and admins verify. Monthly reports show task completion and timeliness per person.

## Commands

- `nvm use 20 && npm run dev` — start dev server (requires Node 20+)
- `npm run build` — production build
- `npm run lint` — run ESLint

## Tech Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **Supabase** — auth (Google OAuth), database (Postgres), shared project with `pep_` table prefix
- **shadcn/ui** (new-york style) with Tailwind CSS v4
- **Vercel** deployment

## Architecture

### Route Groups

- `(auth)/` — login page
- `(dashboard)/` — all authenticated pages wrapped in `DashboardLayout` (sidebar + header)

### Auth Flow

1. Google OAuth only, restricted to school domains (see `ALLOWED_DOMAINS` in `src/lib/auth.ts`)
2. Middleware redirects unauthenticated users to `/login`
3. After OAuth callback, checks `pep_users` table — user must exist AND be `is_active`
4. `auth_id` linked on first login (separates "invited" from "logged in")

### Supabase Clients

- `src/lib/supabase/client.ts` — browser client for React components
- `src/lib/supabase/server.ts` — server client (cookies) + `createServiceRoleClient()` (bypasses RLS)
- `src/lib/supabase/middleware.ts` — session refresh + route protection

### Roles & Permissions

- **super_admin** — full access, can assign to anyone, manage all users, see all reports
- **admin** — can assign to admin + staff, manage admin + staff users, see admin + staff reports
- **staff** — can only see own tasks, update status, post comments

Pure permission functions in `src/lib/permissions.ts` (client-safe). Server-only auth helpers in `src/lib/auth.ts`.

### Data Model

Tables (all `pep_` prefixed): `pep_users`, `pep_tasks`, `pep_comments`, `pep_activity_log`. Schema in `supabase/schema.sql`.

### Task Statuses

Open → In Progress → Completed → Verified

### API Routes

- `/api/auth/callback` — Google OAuth callback
- `/api/dashboard` — task stats (open, due this week, overdue)
- `/api/tasks` — GET (list, role-filtered) / POST (create)
- `/api/tasks/[id]` — GET (detail) / PATCH (update status, fields)
- `/api/tasks/[id]/comments` — GET (list) / POST (create)
- `/api/tasks/[id]/activity` — GET (audit log)
- `/api/users` — GET (list) / POST (create/invite)
- `/api/users/[id]` — PATCH (update role, toggle active)
- `/api/reports` — GET (monthly per-person stats)

### Environment Variables

See `.env.local.example`:
- `NEXT_PUBLIC_SUPABASE_URL` — must include `https://`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Database Setup

Run `supabase/schema.sql` in Supabase SQL editor. Seeds Rahul as super admin.
