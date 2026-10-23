import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks=vi.hoisted(() => ({ findUnique:vi.fn(),verify:vi.fn() }));
vi.mock('../src/config/prisma.js',() => ({ prisma:{ user:{ findUnique:mocks.findUnique } } }));
vi.mock('../src/modules/auth/auth.service.js',() => ({ verifyAccessToken:mocks.verify }));
import { requireAdmin, requireParticipant, requireUser, type AuthedRequest } from '../src/shared/auth.js';

const invoke=(middleware:typeof requireUser) => new Promise<AuthedRequest>((resolve,reject) => {
  const request={ header:() => 'Bearer valid-token' } as unknown as Request;
  middleware(request,{} as Response,error => error ? reject(error) : resolve(request));
});

describe('session and role authorization across modules',() => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verify.mockResolvedValue({ id:'auth-1' });
    mocks.findUnique.mockResolvedValue({ id:1,name:'User',email:'user@example.test',role:'ADMIN',active:true,participantTypeId:null });
  });
  it.each([false,null,undefined])('authorizes a valid administrator regardless of active=%s',async active => {
    mocks.findUnique.mockResolvedValue({ id:1,name:'User',email:'user@example.test',role:'ADMIN',active,participantTypeId:null });
    for (const middleware of [requireUser,requireAdmin]) {
      await expect(invoke(middleware)).resolves.toMatchObject({ user:{ id:1,role:'ADMIN' } });
    }
    await expect(invoke(requireParticipant)).rejects.toMatchObject({ statusCode:403 });
  });
  it('authorizes an administrator without requesting account state',async () => {
    await expect(invoke(requireAdmin)).resolves.toMatchObject({ user:{ id:1,role:'ADMIN' } });
    expect(mocks.findUnique.mock.calls[0][0].select).not.toHaveProperty('active');
  });
  it('preserves role restrictions for a participant with active=false',async () => {
    mocks.findUnique.mockResolvedValue({ id:2,role:'PARTICIPANT',active:false });
    await expect(invoke(requireParticipant)).resolves.toMatchObject({ user:{ role:'PARTICIPANT' } });
    await expect(invoke(requireAdmin)).rejects.toMatchObject({ statusCode:403 });
  });
  it('rejects an invalid session before loading its profile',async () => {
    mocks.verify.mockResolvedValue(null);
    await expect(invoke(requireUser)).rejects.toMatchObject({ statusCode:401 });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it('rejects a session without a linked local profile',async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(invoke(requireUser)).rejects.toMatchObject({ statusCode:401 });
  });
});
