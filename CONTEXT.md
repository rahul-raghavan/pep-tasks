# PEP Tasks — Project Context

## What
Internal task ticketing system for school staff. Higher-ups assign tasks with due dates and priority levels, staff provide updates, mark complete, and a higher-up verifies. Monthly reports show task completion and timeliness per person.

## Users
~15 people — mix of teachers and admin staff. Three roles:

- **Super Admin** — Can assign tickets to anyone (super admins, admins, staff). Sees reports for everyone.
- **Admin** — Can assign tickets to admins and staff. Sees reports for admins and staff.
- **Staff** — Does the work. Cannot assign tickets. Sees only their own tasks.

Reports flow upward — you can see summary reports for anyone at your level or below.

### User Management
- **Super Admin** can create/invite users at any level (super admin, admin, staff)
- **Admin** can create/invite users at their level or below (admin, staff)
- **Staff** cannot create users

## Core Workflow
1. Super Admin or Admin creates a task and assigns it to someone (with due date + priority)
2. Assignee works on the task, posting updates in the task's **thread**
3. Anyone involved can comment in the thread to clarify or discuss
4. Assignee marks the task as complete
5. The assigner (or someone at their level or above) verifies completion
6. Monthly report: tasks assigned per person, on-time vs late completion

## MVP Features
- Task creation with: title, description, assignee, due date, priority (Urgent/High/Normal/Low)
- Task statuses: Open → In Progress → Completed → Verified
- **Threads**: comment thread on each task for discussion and daily updates
- **Activity log**: auto-tracks status changes, reassignments, due date edits (audit trail)
- **Priority levels**: Urgent / High / Normal / Low
- **Monthly reports**: tasks assigned, completed, verified, overdue — viewable by role hierarchy
- Role-based permissions for assignment and report visibility

## Tech Stack
- **Frontend:** Next.js (deployed on Vercel)
- **Backend/DB:** Supabase (shared project — use `pep_` table prefix)
- **Auth:** Google OAuth via Supabase (school domain)

## Data & Privacy
- Tasks may reference students by name in descriptions but no grades or sensitive records
- Task content is private to the organization
- Google OAuth restricted to school domain(s)

## Maintenance
- Rahul maintains the app
- Runs on existing Supabase free tier + Vercel free tier
