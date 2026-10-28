// Offline support and updates. Only built copies register the service worker (see sw-template.js);
// `npm run dev` always loads fresh files.
import { toast } from './lib/toast.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // A page that already had a worker gets a new one when TeacherSync is updated; offer to reload into it.
  const hadWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadWorker) toast('TeacherSync was updated', { label: 'Reload', fn: () => location.reload() });
  });
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
