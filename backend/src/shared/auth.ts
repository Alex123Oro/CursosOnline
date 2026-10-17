import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from './async-handler.js';
import { HttpError } from './http-error.js';
import { verifyAccessToken } from '../modules/auth/auth.service.js';

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

  const account = user;

  if (!account) {
    throw new HttpError(401, 'La sesion no es valida.');
  }

  request.user = toRequestUser(account);
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
