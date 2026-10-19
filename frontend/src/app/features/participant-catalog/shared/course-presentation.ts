export interface ScheduleGroup { days: string[]; time: string; label: string; }

export function groupCourseSchedule(schedule: string): ScheduleGroup[] {
  if (!schedule.trim()) return [];
  const groups = new Map<string, ScheduleGroup>();
  for (const part of schedule.split('·').map(part => part.trim()).filter(Boolean)) {
    const match = /^(Lun|Mar|Mié|Jue|Vie|Sáb|Dom)\s+(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})$/i.exec(part);
    if (!match) return [{ days: [], time: '', label: schedule.trim() }];
    const time = `${match[2]} – ${match[3]}`;
    const group = groups.get(time) ?? { days: [], time, label: '' };
    if (!group.days.includes(match[1])) group.days.push(match[1]);
    groups.set(time, group);
  }
  return [...groups.values()];
}

export function shortCourseDate(date: string | null): string {
  return date ? new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`)) : 'Por confirmar';
}
