import { themePref, setThemePref, onThemeChange } from '../lib/theme.js';
import { store } from '../data/index.js';
import { backupText, backupFileName, parseBackup, describeCounts, countsOf, MAX_BACKUP_CHARS } from '../data/backup.js';
import { downloadText, pickFile } from '../lib/files.js';
import { ask } from '../lib/dialog.js';
import { toast } from '../lib/toast.js';
import { esc } from '../lib/dom.js';
import { viewHead } from './placeholder.js';
import pkg from '../../package.json';

const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const WEEK_STARTS = [[0, 'Sunday'], [1, 'Monday']];
const fmtWhen = ms => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const seg = (label, id, opts, attr) => `<div class="seg" role="group" aria-labelledby="${id}">
  ${opts.map(([v, text]) => `<button type="button" ${attr}="${v}">${text}</button>`).join('')}</div>`;

export function render(container) {
  container.innerHTML = `<section class="view">
    ${viewHead({ eyebrow: 'Settings', title: 'Settings' })}
    <div id="dataNotice"></div>
    <div class="panel">
      <div class="panel-head"><h2>Appearance</h2></div>
      <div class="panel-body setting">
        <div><h3 id="themeLabel">Theme</h3><p>System follows your device’s light or dark mode.</p></div>
        ${seg('Theme', 'themeLabel', THEMES, 'data-theme-pref')}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Planning</h2></div>
      <div class="panel-body setting">
        <div><h3 id="weekLabel">Week starts on</h3><p>For the week view and calendar.</p></div>
        ${seg('Week starts on', 'weekLabel', WEEK_STARTS, 'data-week-start')}
      </div>
      <div class="panel-body setting">
        <div><h3><label for="gradingDays">Grading deadline</label></h3><p>New assignments get a grading deadline this many days after they’re due.</p>
          <p class="field-error" id="gradingErr" hidden></p></div>
        <div><input class="field-in n" id="gradingDays" type="number" inputmode="numeric" min="0" max="60" step="1"> days</div>
      </div>
    </div>
    <div id="dataPanels"></div>
    <p class="eyebrow">TeacherSync ${pkg.version}</p>
  </section>`;
  // Listeners go on this page's own element, so they go away with it.
  const el = container.querySelector('section.view');

  const paintPrefs = () => {
    const s = store.settings();
    for (const b of el.querySelectorAll('[data-theme-pref]')) b.setAttribute('aria-pressed', String(b.dataset.themePref === themePref()));
    for (const b of el.querySelectorAll('[data-week-start]')) b.setAttribute('aria-pressed', String(+b.dataset.weekStart === s.weekStartsOn));
    const g = el.querySelector('#gradingDays');
    if (document.activeElement !== g) g.value = s.gradingDays;
  };

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.themePref) setThemePref(b.dataset.themePref);
    else if (b.dataset.weekStart) report(store.updateSettings({ weekStartsOn: +b.dataset.weekStart }));
    else if (b.dataset.act === 'export') exportBackup();
    else if (b.dataset.act === 'import') importBackup();
    else if (b.dataset.act === 'damaged') downloadDamaged();
    else if (b.dataset.snap) restoreSnapshot(b.dataset.snap);
  });
  el.querySelector('#gradingDays').addEventListener('change', e => {
    const res = store.updateSettings({ gradingDays: e.target.value });
    const err = el.querySelector('#gradingErr');
    err.hidden = res.ok;
    err.textContent = res.ok ? '' : res.errors.gradingDays || res.errors._;
    if (!res.ok) e.target.value = store.settings().gradingDays;
  });

  const paintAll = () => { paintPrefs(); paintData(el); };
  // Stop listening once this page is gone.
  const offTheme = onThemeChange(() => { if (!el.isConnected) offTheme(); else paintPrefs(); });
  const offStore = store.subscribe(() => { if (!el.isConnected) offStore(); else paintAll(); });
  paintAll();
}

function report(res) { if (!res.ok && res.errors._) toast(res.errors._); return res; }

function paintData(el) {
  const counts = countsOf(store.exportData());
  const last = store.settings().lastExportAt;
  const snaps = store.snapshots();
  const rep = store.report();
  const damaged = store.damagedCopies();

  el.querySelector('#dataNotice').innerHTML = rep.problems.length || store.isReadOnly() ? `
    <div class="callout warn" role="alert">
      <h2>Your saved data needs attention</h2>
      <ul>${rep.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      ${damaged.length ? '<div><button class="btn" type="button" data-act="damaged">Download the damaged data</button></div>' : ''}
    </div>` : '';

  el.querySelector('#dataPanels').innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>Your data</h2></div>
      <div class="panel-body stack">
        <p class="note">Everything is saved on this device only: <strong>${esc(describeCounts(counts))}</strong>. Nothing is sent anywhere, and TeacherSync never asks for student names or grades.</p>
        <p class="note">Last backup: ${last ? esc(fmtWhen(last)) : 'never'}. Export a backup now and then, and before clearing your browser or switching devices.</p>
        <div class="row-btns">
          <button class="btn primary" type="button" data-act="export">Export backup</button>
          <button class="btn" type="button" data-act="import"${store.isReadOnly() ? ' disabled' : ''}>Restore from a file…</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Safety copies</h2></div>
      <div class="panel-body">
        ${snaps.length ? `<ul class="snap-list">${snaps.map(s => `<li>
            <div><b>${esc(fmtWhen(s.at))}</b><span>${esc(s.reason)} · ${esc(describeCounts(s.counts))}</span></div>
            <button class="btn" type="button" data-snap="${esc(s.id)}"${store.isReadOnly() ? ' disabled' : ''}>Go back to this</button>
          </li>`).join('')}</ul>`
          : '<p class="note">None yet. TeacherSync saves one automatically before restoring a backup or removing a class with its lessons and assignments.</p>'}
      </div>
    </div>`;
}

function exportBackup() {
  const now = Date.now();
  downloadText(backupFileName(now), backupText(store.exportData(), now));
  store.updateSettings({ lastExportAt: now });
  toast('Backup saved to your downloads');
}

async function importBackup() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  if (file.size > MAX_BACKUP_CHARS * 2) { toast('That file is too large to be a TeacherSync backup.'); return; }
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) {
    await ask({ title: 'Can’t restore this file', body: `<p>${esc(parsed.error)}</p>`, actions: [], cancel: 'OK' });
    return;
  }
  const hasData = Object.values(countsOf(store.exportData())).some(Boolean);
  const when = parsed.exportedAt ? ` from ${esc(fmtWhen(Date.parse(parsed.exportedAt)))}` : '';
  const body = `
    <p>This backup${when} has <strong>${esc(describeCounts(parsed.counts))}</strong>.</p>
    ${parsed.skipped ? `<p>${parsed.skipped} damaged item${parsed.skipped === 1 ? '' : 's'} in it can’t be used and will be skipped.</p>` : ''}
    ${parsed.orphans ? `<p>${parsed.orphans} lesson plan${parsed.orphans === 1 ? '' : 's'} or assignment${parsed.orphans === 1 ? '' : 's'} in it belong to a class that isn’t in the backup. They’ll be kept; choose a class when you edit them.</p>` : ''}
    ${hasData ? `<p><strong>Add what’s missing</strong> keeps everything here and adds what the backup has; where both have the same item, the newer change is kept.
      <strong>Replace everything</strong> makes this device match the backup, settings included.</p>
      <p>Either way, a safety copy of what you have now is saved first.</p>` : ''}`;
  const choice = await ask({
    title: 'Restore this backup?', body,
    actions: hasData
      ? [{ label: 'Replace everything', value: 'replace', danger: true }, { label: 'Add what’s missing', value: 'merge', primary: true }]
      : [{ label: 'Restore', value: 'replace', primary: true }],
  });
  if (!choice) return;
  const res = store.restore(parsed.data, choice);
  if (!res.ok) { toast(res.errors._); return; }
  const s = res.summary;
  toast(choice === 'merge' ? `Added ${s.added}, updated ${s.updated}` : 'Backup restored');
}

async function restoreSnapshot(id) {
  const snap = store.snapshots().find(s => s.id === id);
  if (!snap) return;
  const ok = await ask({
    title: 'Go back to this safety copy?',
    body: `<p>Everything goes back to how it was on <strong>${esc(fmtWhen(snap.at))}</strong> (${esc(describeCounts(snap.counts))}).</p><p>What you have now is saved as a safety copy first.</p>`,
    actions: [{ label: 'Go back', value: 'yes', primary: true }],
  });
  if (!ok) return;
  const res = store.restoreSnapshot(id);
  toast(res.ok ? 'Restored the safety copy' : res.errors._);
}

function downloadDamaged() {
  downloadText(`TeacherSync-damaged-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.damagedCopies(), null, 2));
}
