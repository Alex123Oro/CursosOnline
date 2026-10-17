export const certificateDate = (value: string): string =>
  new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'America/La_Paz' }).format(new Date(value));
export const certificateType = (value: string): string => value === 'aprobacion' ? 'Aprobación' : 'Participación';
