# Windows testing checklist

**Status: not yet performed.** The Windows installer has been built and inspected on a Mac only. Until this checklist has been completed on a real Windows PC, Windows support is untested; don't describe it as tested.

Use temporary test data only. Never test on a Windows account where someone already uses TeacherSync for real planning.

## Before you start

- **Use a separate Windows user account** that has never run TeacherSync (Settings → Accounts → Other users → Add account; a local account is fine). Everything TeacherSync saves goes in that account's own folders, so nothing real can be touched.
- Have a second place ready for the restore test: a **separate data folder**, opened with `--user-data-dir` (step 6). It keeps the restored copy apart from the first one.
- Where TeacherSync keeps things on Windows (per-user install, no administrator rights needed):
  - The app: `%LOCALAPPDATA%\Programs\TeacherSync\TeacherSync.exe`
  - Its data: `%APPDATA%\TeacherSync`

## 1. Download and install

1. Download `TeacherSync-Setup-<version>.exe` from the GitHub release.
2. Check the SHA-256 checksum against the release notes: in PowerShell, `Get-FileHash .\TeacherSync-Setup-<version>.exe -Algorithm SHA256`.
3. Run it. The installer isn't signed, so Windows SmartScreen will warn: choose **More info → Run anyway**. Record exactly what Windows shows.
4. Keep "Only for me" (per-user). Note the install folder it offers; change it only if you're testing that option.
5. Finish, and let it start TeacherSync (or start it from the Start menu).

- [ ] Installer ran; SmartScreen behaved as expected
- [ ] Start menu shortcut "TeacherSync" exists
- [ ] Desktop shortcut created (if offered)

## 2. Launch and check every section

- [ ] The window opens on **Today**, with the TeacherSync icon in the taskbar
- [ ] Sidebar works: Today, Week, Lessons, Assignments, Tasks, Classes, Settings each open and show their heading
- [ ] Menu bar has File (with Exit), Edit, View and Window; there are no developer tools
- [ ] Settings shows the version (bottom of the page): it matches the installer
- [ ] Light and dark: switch the theme in Settings, and try Windows' own dark mode with the theme on System
- [ ] Resize the window narrow (phone width) and wide: nothing is cut off and nothing scrolls sideways
- [ ] Fonts look right (not a plain system font)

## 3. Create test data

Use obviously fake names, for example "Test Class W1".

- [ ] **Class**: "Test Class W1", room 101, meeting Monday, Wednesday and Friday, 9:00–9:50
- [ ] **Day off**: add one for a day this week; the class doesn't show on that day in Classes → Schedule or Week
- [ ] **Lesson plan**: for Test Class W1 on its next meeting day, status Planned, with an objective
- [ ] **Assignment**: for Test Class W1, due in two days; the grading deadline fills in by itself
- [ ] **Task** with Quick Add: type "Test task W1" and press Enter; then a second one with a due date of today and High priority
- [ ] **Today** shows the class (if it meets today), the task due today, and the assignment in the next 7 days
- [ ] **Week** shows all of the above on the right days; clicking an item opens it

## 4. Close and reopen

- [ ] Close the window with the X, then **File → Exit**. Check Task Manager: no TeacherSync is left running
- [ ] Start TeacherSync again: every item from step 3 is still there, unchanged
- [ ] (Optional, crash safety) Make a change, wait 3 seconds, end TeacherSync in Task Manager (End task), and reopen: the change is still there

## 5. Export a backup

- [ ] Settings → **Export backup**: a Save dialog opens in Downloads; save the file
- [ ] The file `TeacherSync-backup-<date>.json` exists and isn't empty
- [ ] Settings now shows "Last backup exported: <time>"
- [ ] Also try cancelling the Save dialog once: nothing breaks (the app can't tell it was cancelled, which is expected)

## 6. Restore into a separate test environment

Quit TeacherSync, then start a second copy with its own empty data folder (in PowerShell or the Run box, `Win+R`):

```
"%LOCALAPPDATA%\Programs\TeacherSync\TeacherSync.exe" --user-data-dir="%TEMP%\TeacherSync-restore-test"
```

- [ ] It opens empty ("Start with your classes"); the data from step 3 is **not** shown, so the folders are separate
- [ ] Settings → **Restore from a file…** → choose the backup from step 5
- [ ] The confirmation lists what's in the file (1 class, 1 lesson plan, 1 assignment, 2 tasks, 1 day off); choose **Restore**

## 7. Verify the restored data

- [ ] Every item from step 3 is there, with the same names, dates, times, statuses and priority
- [ ] Quit and start the same command again: the restored data is still there
- [ ] Start TeacherSync normally (Start menu): the original data from step 3 is unchanged

## 8. Check for errors

- [ ] No error messages or blank screens at any point
- [ ] Settings shows no "Your saved data needs attention" message
- [ ] Links to websites (if any) open in the browser, not inside the app
- [ ] Note anything slow, odd or wrong, with a screenshot (`Win+Shift+S`)

## 9. Uninstall and reinstall

TeacherSync's uninstaller removes the app but **keeps its data** (`%APPDATA%\TeacherSync`). Only delete that folder if this is the dedicated test account.

1. Settings → Apps → Installed apps → TeacherSync → **Uninstall**.
- [ ] The app and its Start menu shortcut are gone
- [ ] `%APPDATA%\TeacherSync` still exists
2. Install again with the same installer.
- [ ] TeacherSync opens with the step 3 data still there
3. Clean up (test account only): uninstall, then delete `%APPDATA%\TeacherSync` and `%TEMP%\TeacherSync-restore-test`, or remove the test Windows account.

## 10. Record the results

Copy this into the GitHub issue or release discussion:

| | |
|---|---|
| Date | |
| Tested by | |
| Windows edition and version (`winver`) | e.g. Windows 11 Home 24H2, build 26100.xxxx |
| PC (processor; x64 or ARM) | |
| Installer filename | |
| Installer SHA-256 matches the release notes | yes / no |
| SmartScreen message | |
| Steps 1–9 | pass / fail for each, with notes |
| Errors seen (with screenshots) | |
| Overall | pass / pass with problems / fail |

The installer is for 64-bit (x64) Windows 10 and 11. On a Windows on ARM PC it runs through Windows' built-in x64 emulation; record that if it applies.
