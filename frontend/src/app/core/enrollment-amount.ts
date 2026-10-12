export const calculateEnrollmentAmount = (basePrice: number, scholarshipPercent: number) => {
  const price = Math.max(0, Number(basePrice) || 0);
  const percent = Math.min(100, Math.max(0, Number(scholarshipPercent) || 0));
  const benefitAmount = Math.round((price * percent) / 100 * 100) / 100;
  const finalAmount = Math.max(0, Math.round((price - benefitAmount) * 100) / 100);

  return { benefitAmount, finalAmount };
};
