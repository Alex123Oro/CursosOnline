import { describe, expect, it } from 'vitest';
import { certificateBulkSchema, certificateCodeSchema, certificateIdSchema, certificateInputSchema } from '../src/modules/certificates/certificate.rules.js';
import { certificateDatabaseId } from '../src/modules/certificates/certificate-id.js';

describe('certificate validation', () => {
  it('rejects imprecise numeric database IDs but preserves string IDs', () => {
    expect(() => certificateDatabaseId(9007199254740992)).toThrow();
    expect(certificateDatabaseId('9007199254740993')).toBe('9007199254740993');
  });
  it('normalizes hexadecimal codes', () => expect(certificateCodeSchema.parse(' 8f72a91c ')).toBe('8F72A91C'));
  it.each(['', 'ABC', '8F72A91CZ', 'ZZZZZZZZ', '../abcde', '1234 678'])('rejects invalid code %s', code => {
    expect(certificateCodeSchema.safeParse(code).success).toBe(false);
  });
  it.each(['0','-1','1.1','abc','9223372036854775808'])('rejects invalid id %s', id => expect(certificateIdSchema.safeParse(id).success).toBe(false));
  it('does not lose bigint precision', () => expect(certificateIdSchema.parse('9007199254740993')).toBe('9007199254740993'));
  it('does not accept participant IDs or an unsupported certificate type', () => {
    expect(certificateInputSchema.safeParse({ enrollmentId: '1', participantId: '2' }).success).toBe(false);
    expect(certificateInputSchema.safeParse({ enrollmentId: '1', type: 'instructor' }).success).toBe(false);
  });
  it('bounds batch size and rejects duplicate enrollments', () => {
    expect(certificateBulkSchema.safeParse({ enrollmentIds: ['1','1'] }).success).toBe(false);
    expect(certificateBulkSchema.safeParse({ enrollmentIds: Array.from({ length: 101 }, (_, i) => String(i + 1)) }).success).toBe(false);
  });
  it('accepts participation in individual and bulk issuance', () => {
    expect(certificateInputSchema.parse({ enrollmentId: '1', type: 'participacion' }).type).toBe('participacion');
    expect(certificateBulkSchema.parse({ enrollmentIds: ['1'], type: 'participacion' }).type).toBe('participacion');
  });
});
