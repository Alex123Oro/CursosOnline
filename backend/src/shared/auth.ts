import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from './async-handler.js';
import { HttpError } from './http-error.js';
import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { env } from '../config/env.js';

export type RequestUser = {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'PARTICIPANT' | 'INSTRUCTOR';
  participantTypeId: number | null;
};

export type AuthedRequest = Request & { user?: RequestUser };

const toRequestUser = (user: {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'PARTICIPANT' | 'INSTRUCTOR';
  participantTypeId: number | null;
}): RequestUser => user;

const loadUser = async (request: AuthedRequest) => {
  const authorization = request.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
      return loadTestUser(request);
    }
    return null;
  }

  const identity = await verifyAccessToken(match[1] ?? '');
  if (!identity) {
    throw new HttpError(401, 'La sesion no es valida.');
  }

  const user = await prisma.user.findUnique({
    where: { authId: identity.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      participantTypeId: true
    }
  });

  const account = user ?? (identity.email ? await prisma.user.findUnique({
    where: { email: identity.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      participantTypeId: true
    }
  }) : null);

  if (!account) {
    throw new HttpError(401, 'La sesion no es valida.');
  }

  request.user = toRequestUser(account);
  return request.user;
};

const loadTestUser = async (request: AuthedRequest) => {
  const header = request.header('x-user-id');
  if (!header) return null;
  const userId = Number(header);
  if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(401, 'La sesion no es valida.');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: {
    id: true, name: true, email: true, role: true, participantTypeId: true
  } });
  if (!user) throw new HttpError(401, 'La sesion no es valida.');
  request.user = toRequestUser(user);
  return request.user;
};

export const optionalAuth = asyncHandler(async (request: Request, _response: Response, next: NextFunction) => {
  await loadUser(request);
  next();
});

export const requireUser = asyncHandler(async (request: Request, _response: Response, next: NextFunction) => {
  const user = await loadUser(request);
  if (!user) {
    throw new HttpError(401, 'Debe identificarse para continuar.');
  }

  next();
});

export const requireAdmin = asyncHandler(async (request: Request, _response: Response, next: NextFunction) => {
  const user = await loadUser(request);
  if (!user) {
    throw new HttpError(401, 'Debe identificarse para continuar.');
  }

  if (user.role !== 'ADMIN') {
    throw new HttpError(403, 'No tiene permisos para realizar esta operacion.');
  }

  next();
});

export const requireParticipant = asyncHandler(async (request: Request, _response: Response, next: NextFunction) => {
  const user = await loadUser(request);
  if (!user) {
    throw new HttpError(401, 'Debe identificarse para continuar.');
  }

  if (user.role !== 'PARTICIPANT') {
    throw new HttpError(403, 'Solo un participante puede realizar esta operacion.');
  }

  next();
});

export const currentUser = (request: Request) => {
  const user = (request as AuthedRequest).user;
  if (!user) {
    throw new HttpError(401, 'Debe identificarse para continuar.');
  }

  return user;
};
