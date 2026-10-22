// Registration windows and academic records use the same business calendar.
export const boliviaDateOnly = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);
