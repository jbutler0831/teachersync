// Text search shared by Lesson plans and Assignments.

// Lowercase without accents, so "resume" finds "Résumé".
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** True when every word of the query appears somewhere in these texts. An empty query matches everything. */
export function matchesText(texts, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(texts.join('\n'));
  return words.every(w => hay.includes(w));
}
