// Every section of the app. `tab: true` sections are in the phone tab bar (five fit); the others are top-bar
// icons on phones. On computers the sidebar lists them all, the tab ones first.
import * as today from './views/today.js';
import * as settings from './views/settings.js';
import * as classes from './views/classes.js';
import * as lessons from './views/lessons.js';
import { week, assignments, tasks } from './views/sections.js';

export const ROUTES = [
  { id: 'today', label: 'Today', icon: 'today', tab: true, view: today },
  { id: 'week', label: 'Week', icon: 'week', tab: true, view: week },
  { id: 'lessons', label: 'Lessons', icon: 'lessons', tab: true, view: lessons },
  { id: 'assignments', label: 'Assignments', icon: 'assignments', tab: true, view: assignments },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', tab: true, view: tasks },
  { id: 'classes', label: 'Classes', icon: 'classes', tab: false, view: classes },
  { id: 'settings', label: 'Settings', icon: 'settings', tab: false, view: settings },
];

export const DEFAULT_ROUTE = 'today';
