// Sections that are still empty in this version. Each describes what it will hold.
import { placeholder } from './placeholder.js';

export const week = placeholder({
  eyebrow: 'Calendar',
  title: 'This week',
  lede: 'Lessons, due dates and grading for the whole week on one calendar.',
  empty: {
    icon: 'week',
    heading: 'Nothing scheduled yet',
    body: 'Once you add classes, lessons and assignments, your week appears here.',
    points: ['See each day’s classes and lessons at a glance', 'Spot heavy grading days before they arrive', 'Export to Apple Calendar, Google Calendar or Outlook'],
  },
});

export const tasks = placeholder({
  eyebrow: 'To do',
  title: 'Tasks',
  lede: 'Everything else on your plate: copies, meetings, emails, duties.',
  empty: {
    icon: 'tasks',
    heading: 'No tasks yet',
    body: 'Type a task the way you’d say it, like “Email parents about the field trip Friday”, and TeacherSync fills in the date.',
  },
});
