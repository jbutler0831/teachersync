# TeacherSync

Plan classes, lessons, assignments, grading and daily tasks in one place. A web app that installs on phones and computers (a PWA) and works offline. Everything is saved on the device; there are no accounts, no student records and no AI features in version 1.

**Status:** Phases 1–8 of the MVP: the app shell, navigation, themes and offline install; the data layer (classes, days off, lesson plans, assignments, tasks, settings) with backup and restore in Settings; Classes & schedule (classes, weekly meeting times, days off, a dated week); the Today dashboard; Lesson plans; Assignments & grading; Tasks with Quick Add; and the Week view with calendar export. Every section is in place.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, reloads as you edit (no offline support in dev)
npm test           # unit, shell and build tests
npm run build      # production copy in dist/, including the offline service worker
npm run preview    # serve dist/ at http://localhost:4173 to try Install and offline
npm run check      # tests, then build
```

To try it on a phone, run `npm run dev -- --host` and open the address it prints from a phone on the same Wi-Fi. Install and offline need HTTPS (or `localhost`), so they only work on a phone once the app is hosted.

## How it's put together

| Path | What it does |
|---|---|
| `index.html` | The one page. Applies a saved light/dark choice before the first paint |
| `src/main.js` | Starts the app: fonts, styles, theme, shell, router, service worker |
| `src/routes.js` | Every section, its icon, and whether it's in the phone tab bar |
| `src/router.js` | Hash addresses (`#/today`, `#/lessons`, …), which work on any static host |
| `src/shell.js` | Sidebar (computers), top bar, tab bar (phones), and showing a section |
| `src/views/` | One file per section (`today.js`, `week.js`: Week and calendar export, `classes.js`: Classes & schedule, `lessons.js`, `assignments.js`, `tasks.js`: Tasks and Quick Add, `settings.js`); `placeholder.js` has the shared heading and empty-state card |
| `src/data/` | The data layer (see below) |
| `src/lib/` | Small shared helpers: storage, theme, dates, toast, dialog, files, HTML escaping, icons |
| `src/styles/` | `tokens.css` (colors, fonts, light and dark), `base.css` (buttons, panels…), `shell.css` (layout), `views.css` (section pages and form sheets) |
| `src/pwa.js`, `src/sw-template.js` | Offline support. The build writes `sw.js` with the list of files to save (see `vite.config.js`) |
| `public/` | Manifest and icons; `npm run icons` redraws the PNG icons (`scripts/make-icons.js`) |
| `test/` | Vitest tests: helpers, theme, shell, navigation and Settings in jsdom; the data layer in `test/data/` (against in-memory storage that can fill up or fail); manifest and production build in Node |

**Layout:** 900px and wider shows a sidebar with every section. Narrower screens get a top bar and a bottom tab bar with Today, Week, Lessons, Assignments and Tasks; Classes and Settings are icons in the top bar.

## Data

Everything is saved in this browser's `localStorage`. Nothing is sent anywhere, and no record has a field for student names, grades or contact details.

| File | What it does |
|---|---|
| `src/data/fields.js` | Rules for single fields (text, dates, times, choices…). Each returns a value that's safe to save plus an error for forms |
| `src/data/schema.js` | The record types and their rules, settings, `SCHEMA_VERSION` and upgrade steps for older data |
| `src/data/store.js` | `createStore()`: load, create, update, remove (with Undo), settings, safety copies, restore. Storage, clock and ids can be swapped in tests |
| `src/data/backup.js` | Backup files: make, read and check, merge |
| `src/data/schedule.js` | Which classes meet on a date (weekly schedules, skipping days off), overlapping meeting times, a week's dates |
| `src/data/agenda.js` | What one day holds, for Today: classes with their lesson plans, overdue and due tasks, grading, the next 7 days |
| `src/data/lessons.js` | Finding lesson plans: search, filters, date groups, a class's next meeting dates, copies |
| `src/data/assignments.js` | Assignment status rules (past due, late, needs attention) and the list's views, filters and sorting |
| `src/data/tasks.js` | Task status rules (overdue, due today) and the list's views, filters and sorting |
| `src/data/week.js` | One week for the Week view: each day's day off, all-day items and class meetings (with their lesson plans) |
| `src/data/ics.js` | Calendar export: the events of a date range as an iCalendar (.ics) file |
| `src/data/search.js` | Text search shared by Lesson plans and Assignments |
| `src/data/index.js` | The app's store, and reloading it when another tab saves a change |

**Keys:** `tsync-classes`, `tsync-days-off`, `tsync-lessons`, `tsync-assignments`, `tsync-tasks`, `tsync-settings`, `tsync-meta` (schema version), `tsync-snapshots` (safety copies) and `tsync-damaged` (originals of anything that couldn't be read). Every key starts with `tsync-` (`src/lib/storage.js`), so TeacherSync never reads or overwrites SemesterSync's `ssync-` data or anything else.

**Rules the store keeps:**
- Every change is checked, then saved, and only then shown. If saving fails (storage full or blocked), nothing changes and the result says why. A change to several collections is all or nothing.
- Loading cleans every record. One damaged collection doesn't affect the others; unusable items are set aside, and their original text is kept in `tsync-damaged` (downloadable from Settings). Data from an older version is upgraded. Data from a newer version is shown but never written over.
- A safety copy of everything is saved before a restore, or before removing a class together with its lessons and assignments. The last 10 are kept, and Settings can go back to any of them.
- Backups (`TeacherSync-backup-YYYY-MM-DD.json`) contain every record and setting. Restoring a backup either replaces everything or adds what's missing (where both copies have the same item, the newer change wins). Only TeacherSync's own collections are read from a file; anything else in it is ignored, and SemesterSync backups are recognized and refused.

To change what's stored: edit the rules in `schema.js`, bump `SCHEMA_VERSION`, and add a step to `MIGRATIONS` that upgrades the previous version's data.

## Classes & schedule

- A class has a name, optional subject, room and notes, a color, and weekly meeting times. In the form, days that share a time are picked together (Mon, Wed, Fri 8:00–8:50); each day is saved as its own meeting.
- A class can't meet twice at the same time (refused, also by the store). Overlapping *another* class is allowed after a warning, because combined and co-taught sections exist. Back-to-back times don't count as overlapping.
- Days off are a single day or a range (at most a year, which catches a mistyped year). No class is shown as meeting on any of their days, on Today or in the Schedule week.
- Deleting a class asks first, says how many lesson plans and assignments go with it, saves a safety copy, and offers Undo. Deleting a day off offers Undo.

## Today

The home screen answers what's on, what needs attention and what's next, for today or any other day.

- **Classes** for the day in time order, with times, subject, room, notes and that day's lesson plan. On today, finished classes are dimmed and the current and next class are marked; this follows the clock while the app is open, including past midnight. On a day off, its name and dates, and when the next class is.
- **Needs attention** and **Next 7 days** count only what's saved and use only explicit statuses: a task is open until marked done; an assignment is waiting to be graded when its status is *To grade*, and late once its grading deadline has passed. Overdue tasks are shown on today only. Until lesson plans, assignments and tasks have their own sections, this panel says so instead of showing zeros.
- **Quick actions** open the same Add class and Add day off forms as Classes & schedule (the day off starts on the day shown). There are no actions for lesson plans, assignments or tasks yet, because those sections don't exist.
- **Days:** previous and next, a date picker, and Back to today. Another day's heading says which day it is and how far from today ("In 2 days"); the year is shown when it isn't this year.

All of it is computed by `src/data/agenda.js` from the store with the same rules as Classes & schedule (`schedule.js`); Today keeps no data of its own.

## Lesson plans

- A plan needs a **title** and a **class**. Everything else is optional: date, objectives, lesson & activities, materials & resources, closing & assessment, notes. A plan with no date is kept under *No date yet* until it's scheduled.
- **Status:** Draft (still being prepared), Planned (ready for its date), Taught (kept for reuse). Stored as `draft`, `ready` and `taught`, as since Phase 2; only the label of `ready` changed (Ready → Planned).
- The form suggests the class's next meeting dates (skipping days off) and says when the chosen date is a day off or a day the class doesn't meet. It still saves: plans can be written for any day.
- **Lesson plans** lists upcoming and unscheduled plans by date (soonest first) and can search (title, every text field and the class name; accents and case don't matter) and filter by class, status and date (upcoming, past, no date, all, or one day). On phones the class, status and date filters fold behind a Filters button.
- **Duplicate** opens a copy as a new Draft with no date, for another day or class; saving it creates a new plan and never changes the original.
- **Delete** asks first, removes only that plan, and offers Undo. Deleting a class still removes its plans (and assignments) after a safety copy, as before.
- **Today** shows each class's plan and status, opens it, and offers *Plan a lesson* (for that class and day) when there isn't one. **Classes** shows each class's number of plans and the next one, links to its plans, and offers *Plan a lesson*. All of them open the same sheets and read the same records, so a change shows everywhere at once.

**Data model (Phase 5):** two optional text fields, `activities` and `assessment`, were added to lesson plans, and their `date` became optional. Both changes are backward compatible: plans and backups saved before load unchanged (the new fields read as empty, and they aren't rewritten just to add them), so no migration or schema version change was needed.

## Assignments & grading

- An assignment needs a **title** and a **class**. Everything else is optional: assigned date (filled with today for a new one), due date, grading deadline, instructions, notes. There are no fields for student names, submissions or scores.
- The **grading deadline** fills in as the due date plus the days in Settings, and follows the due date until the teacher changes it. It can't be before the due date, and the due date can't be before the assigned date.
- **Statuses** (unchanged since Phase 2): *Assigned* (given out, not collected), *To grade* (collected, waiting to be graded), *Graded*, *Returned* (handed back). Each list item has a button for the next step; the view sheet can also go back (Graded or Returned → To grade, To grade → Assigned). Status changes offer Undo.
- **Status rules** (`src/data/assignments.js`, used by both Assignments and Today):
  - *Past due*: still Assigned after its due date. Not on the due date itself, and not without a due date.
  - *Late*: To grade after its grading deadline. Not on the deadline itself, not without one, and never once Graded or Returned.
  - *Needs attention*: past due or To grade.
  - Dates are calendar days compared with the teacher's own today, so time zones don't move them.
- **The list** has four views with counts: *Needs attention* (default; late first, then past due, then To grade by deadline), *Upcoming* (Assigned and not past due; soonest due first, no due date last), *Graded* (Graded and Returned) and *All* (most recent due date first). Search covers title, instructions, notes and class name; filters cover class, status and due date (today, next 7 days, passed, none). Status is always written out (Late, Past due, To grade…), never shown by color alone.
- **Delete** asks first, removes only that assignment, and offers Undo. Deleting a class still removes its assignments after a safety copy, as before.
- **Today** shows, with each assignment in one group only: *Past due, not collected* (on today only), *Assignments due today* (or *this day*), and *To grade*, which is the current pile whatever day is shown and is labelled *now, all classes* on other days. Items open the assignment; *See all in Assignments* opens the Needs attention list. Due dates and grading deadlines in the next 7 days open too. Quick actions include *New assignment*.
- **Classes** shows each class's number of assignments and how many are waiting to be graded, linking to that class's list, and an *Add assignment* button.

**Data model (Phase 6):** two optional text fields, `description` (instructions) and `notes`, were added to assignments. Assignments and backups saved before load unchanged and aren't rewritten; no migration or schema version change.

## Tasks & Quick Add

- A task needs only a **title**. Optional: notes, due date, priority (Low, Normal, High; Normal unless chosen) and a class. Most tasks have no class.
- **Quick Add** (top of Tasks, and in Today's Quick actions): type a title and press Enter or Add. Due date, priority and class are folded under a summary line that shows their current values (*No due date · Normal priority · No class*); they stay as set for the next task. On Today the due date starts as the day shown and follows it. An empty title is refused next to the box. Each added task offers Undo.
- **Status rules** (`src/data/tasks.js`, used by Tasks and Today):
  - *Overdue*: not done and due before today. A task due today is *Due today*, not overdue.
  - Done tasks are never overdue. Reopening one recalculates from its due date (it's overdue again if that date has passed).
  - Tasks without a due date are never overdue and never get a date invented.
  - Dates are calendar days in the teacher's own time zone. Records never change just because time passes.
- **The list** has five views with counts: *To do* (default: every open task; overdue oldest first, then due today, then by date, then no date; higher priority first within each), *Needs attention* (overdue or due today), *Upcoming* (due after today), *Done* (most recently done first) and *All*. Search covers title, notes and class name; filters cover due date (overdue, today, next 7 days, none), priority and class (including *No class*). Complete or reopen with the checkbox; focus moves to the next task's checkbox when a completed one leaves the list. Status is always written out (Overdue, Due today, High priority, Done).
- **Delete** asks first, removes only that task, and offers Undo.
- **Today** shows *Overdue tasks* (on today only) and *Tasks due today* (or *this day*), each task in one group only; items and tasks in the next 7 days open the task; *See all in Tasks* opens Needs attention.
- **Classes** shows a class's open tasks (only when it has some), linking to Tasks for that class. **Deleting a class keeps its tasks** as general tasks (their class is cleared, never the task); the confirmation says so, and Undo links them again unless a task was given another class in the meantime.

**Data model (Phase 7):** tasks gained an optional `classId`. Tasks and backups saved before load unchanged as general tasks and aren't rewritten; no migration or schema version change. The store checks an optional link only when it changes, so a task whose class is gone can still be completed.

## Week & calendar export

- **Week** shows one week, starting on the day set in Settings (Monday or Sunday): previous and next week, a date picker, and *This week*. The label gives the dates and how far the week is from this one (*Next week*, *3 weeks ago*); today is highlighted. Moving between weeks never changes saved data.
- Each day lists its **day off**, then its **all-day items** (assignment due dates, grading deadlines until graded, lesson plans whose class doesn't meet that day, dated tasks with open ones first), then its **class meetings** in time order, each with that day's lesson plan. Classes don't appear on days off. Every item is labelled in words (*Class, Lesson plan, Due, Grade by, Task, Day off*), with status and *Past due / Late / Overdue* from the same rules as the other sections. Lesson plans and tasks without a date are never placed on a day; a note counts them and links to them.
- Saturday and Sunday appear only when something is on them (or the week starts on Sunday). A busy day shows five items and *Show N more*.
- Items open their usual sheets (lesson plan, assignment, task, day off); a class meeting opens a sheet with its lesson plan (or *Plan a lesson* for that day) and *Edit class*. A day's heading opens that day in Today.
- Layout: a seven-column grid on computers, a wrapping grid on tablets, and one day after another on phones.

**Export to calendar** saves an `.ics` file (iCalendar, RFC 5545; `text/calendar`, named `TeacherSync-<from>-to-<to>.ics`) for the week shown, 4 weeks or 12 weeks, with any of these included:

| Event | Calendar form | Included when |
|---|---|---|
| Class meetings | Timed, one event per meeting (no repeat rule), in UTC from the teacher's local time on that date, so daylight-saving changes come out right | the class meets that day and it isn't a day off |
| Lesson plans | All-day (`VALUE=DATE`) | the plan has a date |
| Assignment due dates | All-day | there's a due date |
| Grading deadlines | All-day | there's a deadline and the assignment isn't Graded or Returned |
| Tasks | All-day | the task is open and has a due date |
| Days off | All-day, the whole break (exclusive end date) | it overlaps the range |

Each event has a stable `UID` (for example `due-<assignment id>@teachersync.app`, or `class-<class>-<meeting>-<date>@teachersync.app`), a summary that says what it is (*Due:*, *Grade by:*, *Lesson plan:*, *Task:*, *No classes:*) and a category. Text is escaped and lines are folded at 75 octets with CRLF line endings. Only names, rooms and statuses are written: notes, instructions and app timestamps stay in TeacherSync. Records without the dates they need are left out, never given invented ones, and exporting changes nothing saved.

**Export is not sync.** The file is a one-time copy to import into Apple Calendar, Google Calendar or Outlook. Changes made later in TeacherSync don't reach the calendar until you export and import again; calendars that honor UIDs then update the events they already have instead of adding copies. TeacherSync doesn't connect to any calendar service.

## Known issues

- **Exporting data from a newer version loses that version's new fields.** If this copy opens data saved by a newer TeacherSync (it's then read-only), Export backup writes what this version understands, so fields only the newer version knows are left out of the file. The data on the device is unaffected, and restore is blocked in that state. Fix later by exporting the newer data unchanged; deliberately left alone for now (no risky changes to backups).
- **Restore doesn't enforce the per-type limits** (for example 60 classes); only device storage limits it, and a restore that doesn't fit changes nothing.
- **Weekly schedules only.** A/B and rotating days aren't implemented (planned as a new `settings.schedule.kind`).
- **Not yet tested on real devices or other browsers.** Automated checks run in jsdom and headless Chrome only (layout checks compare the page with the device width at 320, 390, 768 and 1280px, including very long words and pasted links); Safari (iPhone, iPad, Mac), Firefox and Android Chrome still need testing by hand, including installing the app and the date and time pickers.

## Relationship to SemesterSync

TeacherSync is a separate project. Some design and helper code was copied from [SemesterSync](https://github.com/jbutler0831/semestersync) at commit `6955db9` and adapted: the color tokens and light/dark themes, buttons, panels and toast, the theme toggle, and the date helpers. SemesterSync itself is unchanged.
