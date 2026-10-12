import { calculateEnrollmentAmount } from './enrollment-amount';

describe('calculateEnrollmentAmount', () => {
  it('calculates partial, total and never-negative amounts', () => {
    expect(calculateEnrollmentAmount(500, 30)).toEqual({ benefitAmount: 150, finalAmount: 350 });
    expect(calculateEnrollmentAmount(800, 25)).toEqual({ benefitAmount: 200, finalAmount: 600 });
    expect(calculateEnrollmentAmount(500, 100)).toEqual({ benefitAmount: 500, finalAmount: 0 });
    expect(calculateEnrollmentAmount(100, 150)).toEqual({ benefitAmount: 100, finalAmount: 0 });
  });
});
