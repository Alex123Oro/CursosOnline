export const returnToCourse = (value: string | null | undefined): string | null =>
  value && /^\/catalogo\/[1-9]\d*$/.test(value) ? value : null;
