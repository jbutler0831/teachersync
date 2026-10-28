// Fonts are bundled with the app (not loaded from Google), so they work offline once installed.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/public-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/views.css';

import { store, followOtherTabs } from './data/index.js';
import { initTheme } from './lib/theme.js';
import { toast } from './lib/toast.js';
import { mountShell } from './shell.js';
import { startRouter } from './router.js';
import { registerServiceWorker } from './pwa.js';

const loaded = store.load();
followOtherTabs();
initTheme();
const shell = mountShell(document.getElementById('app'));
startRouter((route, opts) => shell.show(route, opts));
if (loaded.problems.length) toast('Some saved data needs attention', { label: 'Details', fn: () => { location.hash = '#/settings'; } });
if (import.meta.env.PROD) registerServiceWorker();
