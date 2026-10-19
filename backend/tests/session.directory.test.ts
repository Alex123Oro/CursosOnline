import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../src/config/prisma.js', () => ({ prisma: { user: mocks } }));
import { sessionService } from '../src/modules/session/session.service.js';
describe('administrative session directory', () => {
  beforeEach(() => vi.resetAllMocks());
  it('includes instructor profile fields without Auth identifiers', async () => {
    mocks.findMany.mockResolvedValue([{ id: 7, name: 'Ana', email: 'ana@example.com', role: 'INSTRUCTOR', participantTypeId: null, participantType: null, degree: 'TECHNICIAN', sis: '001234567', phone: '+59170012345', authId: 'private' }]);
    expect(await sessionService.listUsers()).toEqual([{ id: '7', name: 'Ana', email: 'ana@example.com', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null, degree: 'Técnico', sis: '001234567', phone: '+59170012345' }]);
    expect(mocks.findMany.mock.calls[0]?.[0].select).toMatchObject({ degree: true, sis: true, phone: true }); expect(mocks.findMany.mock.calls[0]?.[0].select.authId).toBeUndefined();
  });
  it('preserves nullable legacy profiles', async () => { mocks.findMany.mockResolvedValue([{ id: 1, name: 'Admin', email: 'admin@example.com', role: 'ADMIN', participantTypeId: null, participantType: null, degree: null, sis: null, phone: null }]); expect((await sessionService.listUsers())[0]).toMatchObject({ degree: null, sis: null, phone: null }); });
});
