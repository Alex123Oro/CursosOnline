import { boliviaDateOnly } from './business-date';

describe('Bolivia business calendar',() => {
  it('keeps the current Bolivian day after UTC has crossed midnight',() => {
    expect(boliviaDateOnly(new Date('2026-10-23T01:00:00Z'))).toBe('2026-10-22');
  });
  it('changes date at midnight in Bolivia',() => {
    expect(boliviaDateOnly(new Date('2026-10-23T03:59:59Z'))).toBe('2026-10-22');
    expect(boliviaDateOnly(new Date('2026-10-23T04:00:00Z'))).toBe('2026-10-23');
  });
});
