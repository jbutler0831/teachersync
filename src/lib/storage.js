// Everything TeacherSync saves on the device goes through here. Every key starts with `tsync-`, so it can
// never read or overwrite SemesterSync's `ssync-` keys, even if both apps were served from the same address.
// Reads and writes never throw: private windows and blocked storage just behave as if nothing was saved.
export const PREFIX = 'tsync-';

export function lsGet(key) {
  try { return localStorage.getItem(PREFIX + key); } catch (_) { return null; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(PREFIX + key, value); return true; } catch (_) { return false; }
}
export function lsRemove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (_) {}
}
