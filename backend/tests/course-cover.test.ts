import { describe, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ getBucket: vi.fn(), createBucket: vi.fn(), from: vi.fn(), upload: vi.fn(), getPublicUrl: vi.fn() }));
vi.mock('../src/config/supabase.js', () => ({ getServerSupabase: () => ({ storage }) }));
import { courseCoverService, validateCoverUpload } from '../src/modules/courses/course-cover.service.js';
import { courseInputSchema } from '../src/modules/courses/course.rules.js';
const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
describe('course covers', () => {
  it('accepts valid raster signatures and rejects mismatched or oversized uploads', () => {
    expect(validateCoverUpload(png,'image/png').extension).toBe('png');
    expect(validateCoverUpload(Buffer.from([255,216,255,0]),'image/jpeg').extension).toBe('jpg');
    expect(() => validateCoverUpload(Buffer.from('<script>'), 'image/png')).toThrow();
    expect(() => validateCoverUpload(png, 'image/svg+xml')).toThrow();
    expect(() => validateCoverUpload(Buffer.alloc(5*1024*1024+1), 'image/png')).toThrow();
  });
  it('uploads under the administrator ID with an unpredictable name and returns a durable public URL', async () => {
    storage.getBucket.mockResolvedValue({data:{id:'course-covers'}});
    storage.from.mockReturnValue(storage);
    storage.upload.mockResolvedValue({error:null});
    storage.getPublicUrl.mockReturnValue({data:{publicUrl:'https://example.com/cover.png'}});
    expect(await courseCoverService.upload(png, 'image/png', 26)).toEqual({coverUrl:'https://example.com/cover.png'});
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^26\/[0-9a-f-]+\.png$/),png,expect.objectContaining({upsert:false}));
  });
  it('validates cover URLs without changing the existing required course fields', () => {
    const data={name:'Python',content:'Aprende a programar con Python',durationHours:24,instructor:'Ana',approvalCriteria:'Proyecto final'};
    expect(courseInputSchema.safeParse({...data,coverUrl:'https://example.com/cover.jpg'}).success).toBe(true);
    expect(courseInputSchema.safeParse({...data,coverUrl:'/images/course-covers/python.svg'}).success).toBe(true);
    for(const coverUrl of ['javascript:alert(1)','data:image/svg+xml,test','http://example.com/a','https://user:pass@example.com/a'])expect(courseInputSchema.safeParse({...data,coverUrl}).success).toBe(false);
  });
});
