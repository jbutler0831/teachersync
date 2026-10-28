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

export const assignments = placeholder({
  eyebrow: 'Grading',
  title: 'Assignments',
  lede: 'Track what’s due, what’s waiting to be graded and what’s been handed back.',
  empty: {
    icon: 'assignments',
    heading: 'No assignments yet',
    body: 'Add an assignment with its due date and TeacherSync suggests a “grade by” date.',
    points: ['Assigned → To grade → Graded → Returned', 'A grading queue sorted by what’s most urgent', 'No student names or scores are stored'],
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
