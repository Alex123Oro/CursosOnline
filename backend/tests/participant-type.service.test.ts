import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), upsert: vi.fn() }));
vi.mock('../src/config/prisma.js', () => ({ prisma: { participantType: mocks } }));
import { participantTypeService } from '../src/modules/participant-types/participant-type.service.js';
describe('external course prices', () => {
  beforeEach(() => vi.resetAllMocks());
  it('returns a persisted external category even on installations missing the seed', async () => {
    mocks.findMany.mockResolvedValue([{ id: 1, name: 'Estudiante' }]);
    mocks.upsert.mockResolvedValue({ id: 4, name: 'Externo' });
    expect(await participantTypeService.list()).toEqual([{ id: '1', name: 'Estudiante' }, { id: '4', name: 'Externo' }]);
  });
  it('preserves existing category identifiers', async () => {
    mocks.findMany.mockResolvedValue([{ id: 7, name: 'Externo' }]);
    expect(await participantTypeService.list()).toEqual([{ id: '7', name: 'Externo' }]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
