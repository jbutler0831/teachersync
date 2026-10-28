// Hash routes (#/today, #/lessons, …). They work on any static host with no server rules, and the
// service worker only ever has to serve one page.
import { ROUTES, DEFAULT_ROUTE } from './routes.js';

export const hrefFor = id => `#/${id}`;

export function routeFromHash(hash) {
  const id = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES.find(r => r.id === id) || ROUTES.find(r => r.id === DEFAULT_ROUTE);
}

/** Calls onRoute(route, { initial }) now and on every change. Unknown addresses are replaced with Today's. */
export function startRouter(onRoute) {
  const go = initial => {
    const route = routeFromHash(location.hash);
    if (location.hash !== hrefFor(route.id)) history.replaceState(null, '', hrefFor(route.id));
    onRoute(route, { initial });
  };
  const onHash = () => go(false);
  addEventListener('hashchange', onHash);
  go(true);
  return () => removeEventListener('hashchange', onHash);
}
