import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lsGet, lsSet, lsRemove, PREFIX } from '../src/lib/storage.js';
import { iso, fromIso, addDays, fmtLongDate, greeting } from '../src/lib/dates.js';
import { esc } from '../src/lib/dom.js';
import { toast } from '../src/lib/toast.js';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('saves every key with the tsync- prefix, never touching SemesterSync keys', () => {
    localStorage.setItem('ssync-theme', 'dark');
    lsSet('theme', 'light');
    expect(PREFIX).toBe('tsync-');
    expect(localStorage.getItem('tsync-theme')).toBe('light');
    expect(localStorage.getItem('ssync-theme')).toBe('dark');
    expect(lsGet('theme')).toBe('light');
    lsRemove('theme');
    expect(lsGet('theme')).toBeNull();
    expect(localStorage.getItem('ssync-theme')).toBe('dark');
  });

  it('never throws when storage is blocked', () => {
    const boom = () => { throw new Error('blocked'); };
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    const rm = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom);
    expect(lsGet('x')).toBeNull();
    expect(lsSet('x', '1')).toBe(false);
    expect(() => lsRemove('x')).not.toThrow();
    get.mockRestore(); set.mockRestore(); rm.mockRestore();
  });
});

describe('dates', () => {
  it('round-trips calendar days', () => {
    const d = new Date(2026, 9, 27, 15, 30);
    expect(iso(d)).toBe('2026-10-27');
    expect(fromIso('2026-10-27')).toEqual(new Date(2026, 9, 27));
  });

  it('adds days across months and daylight saving', () => {
    expect(iso(addDays(new Date(2026, 9, 31), 1))).toBe('2026-11-01');
    expect(iso(addDays(new Date(2026, 10, 1), 7))).toBe('2026-11-08');
    expect(iso(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });

  it('formats the long date and greeting', () => {
    expect(fmtLongDate(new Date(2026, 9, 27), 'en-US')).toBe('Tuesday, October 27');
    expect(greeting(new Date(2026, 9, 27, 7))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 27, 13))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 27, 19))).toBe('Good evening');
  });
});

describe('esc', () => {
  it('escapes HTML and attribute quotes', () => {
    expect(esc(`<b a="1" b='2'>&</b>`)).toBe('&lt;b a=&quot;1&quot; b=&#39;2&#39;&gt;&amp;&lt;/b&gt;');
    expect(esc(null)).toBe('');
  });
});

describe('toast', () => {
  beforeEach(() => { document.body.innerHTML = '<div class="toast" id="toast"></div>'; vi.useFakeTimers(); });

  it('shows a message, then hides it', () => {
    toast('Saved');
    const t = document.getElementById('toast');
    expect(t.textContent).toBe('Saved');
    expect(t.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(2700);
    expect(t.classList.contains('show')).toBe(false);
    vi.useRealTimers();
  });

  it('runs its action and hides', () => {
    const fn = vi.fn();
    toast('Updated', { label: 'Reload', fn });
    const t = document.getElementById('toast');
    t.querySelector('button').click();
    expect(fn).toHaveBeenCalledOnce();
    expect(t.classList.contains('show')).toBe(false);
    vi.useRealTimers();
  });
});
