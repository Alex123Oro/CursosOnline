import { describe, expect, it } from 'vitest';
import { groupCourseSchedule } from './course-presentation';

describe('catalogue schedule presentation', () => {
  it('groups repeated time slots, preserving different days and times', () => {
    expect(groupCourseSchedule('Lun 18:00–19:00 · Mar 18:00–19:00 · Mié 18:00–19:00 · Vie 19:00–20:00')).toEqual([
      { days: ['Lun', 'Mar', 'Mié'], time: '18:00 – 19:00', label: '' },
      { days: ['Vie'], time: '19:00 – 20:00', label: '' }
    ]);
  });
  it('preserves legacy schedules without guessing or losing information', () => {
    expect(groupCourseSchedule('Martes y jueves · 19:00 – 21:00')).toEqual([
      { days: [], time: '', label: 'Martes y jueves · 19:00 – 21:00' }
    ]);
    expect(groupCourseSchedule('')).toEqual([]);
  });
});
