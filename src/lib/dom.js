export const $ = id => document.getElementById(id);

// Escapes text for HTML (from SemesterSync, plus single quotes for attributes written with them).
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
