# PEP Tasks — Feature Guide

A complete walkthrough of everything you can do in PEP Tasks.

---

## Logging In

- Go to the app URL and click **Sign in with Google**
- Use your school Google account (must be a `@pepschoolv2.com`, `@accelschool.in`, or `@ribbons.education` email)
- You'll be taken straight to your Dashboard
- No separate password needed — it's the same Google login you already use

> If you see an error when logging in, it usually means your account hasn't been added to the system yet. Ask an admin to add you.

---

## Your Role

Everyone in PEP Tasks has one of three roles. Your role decides what you can see and do:

| | Staff | Admin | Super Admin |
|---|---|---|---|
| See own tasks | Yes | Yes | Yes |
| See other people's tasks | No | Yes (their team) | Yes (everyone) |
| Create & assign tasks | No | Yes | Yes |
| Verify completed tasks | No | Yes | Yes |
| Delegate tasks | No | Yes (own tasks) | Yes (any task) |
| Manage users | No | Yes (staff & admins) | Yes (everyone) |
| View reports | No | Yes | Yes |
| Set up recurring tasks | No | Yes | Yes |

---

## The Dashboard

This is your home screen. It shows you everything important at a glance.

### Top Cards

- **Open Tasks** — How many tasks are waiting to be done
- **Due This Week** — Tasks with a deadline in the next 7 days
- **Overdue** — Tasks that are past their due date and still not done
- **Pending Verification** (admins only) — Completed tasks waiting for your review

Click any card to jump to that filtered list of tasks.

### Your Tasks

A quick list of tasks assigned to you (or delegated to you). Shows the task name, priority, status, and due date. Overdue tasks are highlighted in red. Click any task to open it.

### Assigned by You (admins only)

Tasks you created and assigned to others. Handy for tracking what your team is working on.

### Recent Comments

The latest comments across all tasks you have access to. Lets you stay on top of conversations without opening each task.

### Recent Activity

A timeline of what's been happening — who created tasks, who completed them, who verified them, etc.

> The dashboard auto-refreshes when you switch back to it from another tab (at most once every 30 seconds to keep things fast). You can also hit the refresh button anytime for an instant update.

---

## Tasks

### Viewing Tasks

- **Staff** see only tasks assigned to them
- **Admins** see tasks for people in their centers, plus their own
- **Super Admins** see all tasks

The task list loads 50 tasks at a time. If you have more, you'll see a **Load More** button at the bottom showing how many you've loaded out of the total (e.g., "Load More (50 of 120)").

You can filter the task list by:
- **Status**: Open, In Progress, Completed, Verified
- **Priority**: Urgent, High, Normal, Low
- **Assignee** (admins): Pick a specific person
- **Center** (admins): Pick a center to see only that team's tasks

Changing any filter resets back to the first page of results.

### Task Priority Levels

| Priority | What it means |
|----------|--------------|
| **Urgent** | Drop everything — do this first |
| **High** | Important, should be done soon |
| **Normal** | Standard task (this is the default) |
| **Low** | Can wait, do when you have time |

### Creating a Task (admins only)

1. Click **New Task** (top right on the Tasks page)
2. Fill in:
   - **Title** — What needs to be done (required)
   - **Description** — Details or instructions (optional)
   - **Assign To** — Who should do this (required)
   - **Due Date** — When it should be done by (optional)
   - **Priority** — How urgent it is (defaults to Normal)
3. Click **Create Task**

The person you assign it to will get a notification.

### Working on a Task (staff)

When you're assigned a task, here's the typical flow:

1. Open the task from your Dashboard or Tasks list
2. Click **Start Working** — this changes the status to "In Progress" so your admin knows you've begun
3. Add comments if you have questions or updates
4. Attach files if needed (photos, documents, etc.)
5. When you're done, click **Mark Complete** — the task goes to your admin for verification

### Editing a Task (admins only)

You can edit a task you created **within 24 hours** of creating it. After that, it's locked. You can change:
- Title, description, assignee, due date, priority

Super Admins can edit any task at any time.

### Deleting a Task (admins only)

You can delete a task you created **within 24 hours**, as long as it hasn't been verified yet.

---

## Verification (admins only)

When a staff member marks a task as "Complete", it's your job to verify it.

### How to Verify

1. Open the completed task (or find it via the "Pending Verification" card on your Dashboard)
2. You'll see a **Verify** section
3. Give a **star rating** (1 to 5):
   - 1 star = Poor
   - 2 stars = Below expectations
   - 3 stars = Meets expectations
   - 4 stars = Good
   - 5 stars = Excellent
4. If you give 3 stars or below, you **must** leave a comment explaining why
5. Click **Verify**

### Two-Person Verification (for delegated tasks)

If a task was delegated (see next section), **two** people need to verify:
1. The admin who created the task
2. The admin the task was originally assigned to

The task only moves to "Verified" status after both have submitted their rating.

### Reopening a Task

If the work isn't good enough, instead of verifying you can click **Reopen** to send it back to "In Progress". The staff member will see it back in their list.

> Staff can see that their task has been verified, but they **cannot** see the star rating. Ratings are only visible to admins.

---

## Delegation

Delegation is for when an admin wants to hand off the actual work to a staff member, while still keeping themselves as the responsible person.

### Example

Say Priya (admin) is assigned a task to "Prepare the monthly attendance report." She knows Ravi (staff) should do the actual work. She can:

1. Open the task
2. Click **Delegate to...** and pick Ravi
3. Ravi now sees this task in his list and does the work
4. When Ravi marks it complete, **both** Priya and the original assigner need to verify

### Rules

- Only admins can delegate
- Admins can only delegate tasks assigned to **them** (Super Admins can delegate any task)
- You can only delegate to staff members
- You can change or remove the delegation at any time

---

## Comments

Anyone involved with a task can add comments — great for asking questions, giving updates, or providing feedback.

- Open any task and scroll to the **Comments** section
- Type your message and click **Post**
- Everyone involved with the task gets a notification

Comments made during verification are tagged with a "Verification" label so you can tell them apart.

---

## Attachments

You can attach files to any task — useful for sharing photos, documents, or reference material.

### How to Upload

1. Open a task
2. Scroll to the **Attachments** section
3. Click **Upload** and pick a file
4. Supported formats: Images (JPG, PNG, GIF, WebP, HEIC), PDFs, Word docs, Excel files, text files
5. Maximum file size: **5 MB** per file

### Downloading

Click on any attachment to download it. The download link is generated fresh each time and works for 1 hour.

### Deleting

Only the person who uploaded the file (or an admin) can delete it. You can't add or remove attachments from verified tasks.

---

## Recurring Tasks (admins only)

For things that happen on a regular schedule — like "Submit weekly report every Monday" or "Review attendance on the 1st of every month."

### Setting Up a Recurring Task

1. Go to **Recurring Tasks** from the sidebar
2. Click **New Recurring Task**
3. Fill in the task details (title, description, assignee, priority) — same as a regular task
4. Choose a **recurrence pattern**:
   - **Daily**: Every N days (e.g., every day, every 3 days)
   - **Weekly**: Every N weeks on specific days (e.g., every week on Monday and Friday)
   - **Monthly**: Either on a specific date (e.g., the 15th of every month) or a pattern (e.g., the last Friday of every month)
5. Pick the **first run date** — when the first task should be created
6. Click **Create**

The system automatically creates a new task on each scheduled date. The assignee gets a notification each time.

### Managing Recurring Tasks

- **Pause**: Temporarily stop creating new tasks (the template is saved, just inactive)
- **Activate**: Resume a paused template
- **Edit**: Change any detail — title, assignee, schedule, etc.
- **Delete**: Remove the template entirely (tasks already created from it stay as-is)

---

## Reports (admins only)

Monthly performance reports showing how each person is doing.

### How to Use

1. Go to **Reports** from the sidebar
2. Pick a month using the date picker (defaults to current month)
3. See a table with one row per person

### What the Numbers Mean

| Column | Meaning |
|--------|---------|
| **Assigned** | Total tasks assigned to this person in the selected month |
| **Completed** | Tasks they finished (marked complete or verified) |
| **Verified** | Tasks that were verified by an admin |
| **On Time** | Tasks completed on or before the due date |
| **Late** | Tasks completed after the due date |
| **Overdue** | Tasks still not done and past their due date |
| **Avg Rating** | Average star rating from verifications (Super Admin only) |

- Numbers in **green** = on time
- Numbers in **gold** = late
- Numbers in **red** = overdue

### Who Can See What

- **Super Admins** see everyone's reports, including the average star rating column
- **Admins** see reports for staff and other admins in their centers (no star ratings)
- **Staff** cannot access reports

---

## User Management (admins only)

### Adding a New User

1. Go to **Users** from the sidebar
2. Click **Add User**
3. Enter their school email address, name, and choose a role
4. Click **Add**

They can now log in with their Google account. They don't need to do anything special — just sign in.

> If a user was previously removed and you're adding them back, the system will automatically re-activate their old account.

### Editing a User

Click the edit (pencil) icon next to any user to:
- Change their display name
- Assign or remove centers (Super Admin only)

### Changing Someone's Role

Use the role dropdown next to their name. Admins can change staff to admin and vice versa. Only Super Admins can promote someone to Super Admin.

### Deactivating a User

Click the toggle next to a user to deactivate them. Deactivated users:
- Can't log in anymore
- Don't show up when assigning tasks
- Their old tasks and history are preserved

You can reactivate them anytime by clicking the toggle again.

### Centers (Super Admin only)

Centers are groups — like branches, departments, or teams. They help organize who can see whose tasks.

- **Create centers** from the Users page (collapsible section at the top)
- **Assign users** to one or more centers when editing their profile
- **Filter tasks** by center on the Tasks page

When an admin is assigned to a center, they can only see tasks and reports for people in their centers.

---

## Notifications

PEP Tasks sends browser notifications so you don't miss important updates.

### When You'll Get Notified

- A new task is assigned to you
- A task is delegated to you
- Someone comments on a task you're involved with
- A recurring task generates a new task for you

### Enabling Notifications

The first time you use the app, your browser will ask if you want to allow notifications. **Click Allow** — otherwise you won't get any alerts.

> Notifications only work in the browser where you enabled them. If you use the app on your phone and laptop, enable notifications on both.

---

## Tips & Shortcuts

- **Click any number on the Dashboard** to jump to that filtered view of tasks
- **Comments are the best way** to ask questions about a task — everyone involved gets notified
- **Attach files** instead of sending them over WhatsApp — they stay with the task and are easy to find later
- **Check your Dashboard daily** — it shows what's overdue and what needs your attention
- **If something looks wrong**, try refreshing the page — the app auto-refreshes when you switch tabs (every 30 seconds), but a manual refresh never hurts
- **Pages load quickly** with animated placeholders while data is being fetched — you'll see the layout appear instantly even on slower connections

---

## Frequently Asked Questions

**Q: I can't log in. What do I do?**
A: Make sure you're using your school Google account. If it still doesn't work, ask an admin to check that your account is added and active in the system.

**Q: I don't see any tasks. Is something broken?**
A: If you're staff, you'll only see tasks specifically assigned to you. If nothing's been assigned yet, your list will be empty. If you're an admin and still see nothing, check that you're not filtering by a specific status or center.

**Q: Can I edit a task after creating it?**
A: Yes, but only within 24 hours of creating it. After that, the task details are locked. You can always add comments though.

**Q: What happens if I mark a task complete by accident?**
A: Tell your admin — they can reopen it for you from the task detail page.

**Q: Can staff see their star ratings?**
A: No. Star ratings are only visible to admins and super admins. Staff can see that their task was verified, but not the rating.

**Q: What happens to old tasks?**
A: Old tasks can be archived by an admin. Archived tasks are hidden from all views but the data is safely preserved.

**Q: I'm not getting notifications.**
A: Make sure you clicked "Allow" when your browser asked about notifications. Also check that notifications aren't turned off in your browser settings.
