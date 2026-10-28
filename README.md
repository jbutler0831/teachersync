# TeacherSync

Plan classes, lessons, assignments, grading and daily tasks in one place. A web app that installs on phones and computers (a PWA) and works offline. Everything is saved on the device; there are no accounts, no student records and no AI features in version 1.

**Status:** Phases 1–3 of the MVP: the app shell, navigation, themes and offline install; the data layer (classes, days off, lesson plans, assignments, tasks, settings) with backup and restore in Settings; and Classes & schedule (classes, weekly meeting times, days off, a dated week, and today's classes on Today). Lessons, Assignments, Tasks and Week are still empty.

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
| `src/views/` | One file per section (`classes.js`: Classes & schedule); `sections.js` holds the ones that are still empty |
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

## Known issues

- **Exporting data from a newer version loses that version's new fields.** If this copy opens data saved by a newer TeacherSync (it's then read-only), Export backup writes what this version understands, so fields only the newer version knows are left out of the file. The data on the device is unaffected, and restore is blocked in that state. Fix later by exporting the newer data unchanged; deliberately left alone for now (no risky changes to backups).
- Restoring a backup doesn't apply the per-collection limits (for example 60 classes); only device storage limits it, and a restore that doesn't fit changes nothing.
- Only weekly schedules exist. A/B and rotating days are planned (`settings.schedule.kind`).

## Relationship to SemesterSync

TeacherSync is a separate project. Some design and helper code was copied from [SemesterSync](https://github.com/jbutler0831/semestersync) at commit `6955db9` and adapted: the color tokens and light/dark themes, buttons, panels and toast, the theme toggle, and the date helpers. SemesterSync itself is unchanged.
