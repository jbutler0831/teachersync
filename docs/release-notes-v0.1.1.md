A safety, reliability and accessibility update to 0.1.0. Your data stays on your own computer; there are no accounts. Install it over 0.1.0: your classes, lesson plans, assignments and tasks are kept (checked on a Mac; Windows uses the same data folder but hasn't been tested yet). As always, exporting a backup first is a good idea.

TeacherSync is now released under the **MIT License** (Copyright (c) 2026 Jorel Butler). The license is included in the repository and inside the apps.

## What's new

**Safer backups**
- **Exports never drop data.** If TeacherSync opens data saved by a newer version, or finds damaged data it can't set aside, Export backup now saves everything exactly as stored, instead of only what this version understands.
- **Restores stay within limits.** A backup that would go over a limit (for example 60 classes or 10,000 lesson plans) is refused before anything changes, with a message saying which limit. Nothing is quietly trimmed.
- **Large data can still be restored.** Restoring, and deleting a class, used to become impossible once your data was over 1.5 MB, because no safety copy could be saved. The newest safety copy is now kept whatever its size, as long as there's room.
- Settings now says when a backup was last *exported*, because the app can't tell whether you went on to save the file or cancelled.

**Desktop app**
- **Your changes reach the disk within about a second.** Previously, a crash or forced restart within 3–6 seconds of a change could lose it. Quitting normally was always safe.
- **Security hardening.** The app can no longer be run as a general-purpose Node.js engine, have code injected through `NODE_OPTIONS`, or be opened with a debugger (`--inspect`). It loads its code only from its own package and gives no extra powers to local files.

**Accessibility**
- **"Skip to content" works.** For keyboard users it used to jump to Today from any page; it now moves straight to the page's content.
- **Easier-to-read text.** Small labels, status labels (such as Late, Overdue and Planned), finished classes on Today and the dark-theme Delete button now meet the WCAG AA contrast level (4.5:1) in light and dark themes.
- **Clear focus rings on form fields**, including date fields' calendar buttons, so keyboard users can always see where they are.

**Fixes**
- A very long class name no longer makes Today wider than a phone screen on days without classes.

## Downloads

| File | For | Size | SHA-256 |
|---|---|---|---|
| `TeacherSync-0.1.1-mac-arm64.dmg` | Macs with Apple silicon (M1 and later) | 128.2 MB | `f821a020e328dc92b0826f09dab65597034bfe7ddcb091e75efe08ed04fc5335` |
| `TeacherSync-0.1.1-mac-x64.dmg` | Intel Macs | 133.8 MB | `4770729afb4481677f82992101dfb2cb505ba5473328e5c8f6272ddcb8645868` |
| `TeacherSync-Setup-0.1.1.exe` | Windows 10 and 11, 64-bit | 111.8 MB | `8a2499a7cac64e8d3bc270f70af46f2b8ca0b974d0964eb5191b47832eee0e00` |

## First launch

These builds aren't signed by Apple or Microsoft, so your computer asks before opening them the first time:
- **Mac:** open the .dmg, drag TeacherSync to Applications, then right-click TeacherSync → **Open** → **Open** (or System Settings → Privacy & Security → **Open Anyway**).
- **Windows:** if SmartScreen says "Windows protected your PC", choose **More info** → **Run anyway**.

## How this release was tested

| Platform | Status |
|---|---|
| Mac, Apple silicon | **Tested.** The app from this .dmg was run: every section, creating a class, lesson plan, assignment and task, Week, calendar export, backup export and restore, data kept after quitting and reopening, working with the network switched off, opening data from 0.1.0, security settings confirmed |
| Mac, Intel | **Partly tested.** The same checks passed, but on an Apple silicon Mac through Rosetta, not on Intel hardware |
| Windows | **Not tested on Windows.** The installer was built and its contents inspected on a Mac (correct version, security settings, same app code as the Mac builds), but it hasn't been installed or run on a Windows PC. A [testing checklist](https://github.com/jbutler0831/teachersync/blob/main/docs/windows-testing.md) is ready; reports are welcome |
| Web app in Chrome, Firefox and WebKit (Safari's engine) on a Mac | **Tested automatically.** 365 automated tests; every section and the main tasks at phone, tablet and desktop widths in Chrome 156, the real Firefox 155 and WebKit 27.2; works offline after the first visit (Chrome) |
| Accessibility | **Tested automatically.** No WCAG 2.1 A/AA problems found by axe-core on every section and the main dialogs, in light and dark themes, in all three browser engines; every section usable with the keyboard alone |
| Safari itself, iPhone, iPad, Android | **Not tested.** WebKit is Safari's engine, but the real Safari app and real phones and tablets haven't been tested |
| Screen readers (VoiceOver, NVDA) | **Not tested** |

## Known issues and limitations

- **Windows hasn't been tested on a real PC yet** (see above).
- **Not tested in Safari itself, on physical phones or tablets, or with a screen reader.**
- **No Apple notarization or Developer ID signing, and no Windows code signing.** The Mac apps are ad-hoc signed and the Windows installer is unsigned, so the first-launch prompts above appear.
- The web app (in a browser) can still lose the last few seconds of changes if the browser crashes; that's controlled by the browser. The desktop app is protected (see above).
- Only weekly class schedules; A/B and rotating days aren't supported yet.
- The calendar export hasn't been imported into Apple Calendar, Google Calendar or Outlook yet (the file is checked against the iCalendar format rules).
- The desktop app doesn't check its own package for tampering at startup (planned once the apps are properly code-signed).
