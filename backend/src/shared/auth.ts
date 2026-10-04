import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from './async-handler.js';
import { HttpError } from './http-error.js';

export type RequestUser = {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'PARTICIPANT';
  participantTypeId: number | null;
};

export type AuthedRequest = Request & { user?: RequestUser };

const toRequestUser = (user: {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'PARTICIPANT';
  participantTypeId: number | null;
}): RequestUser => user;

const loadUser = async (request: AuthedRequest) => {
  const header = request.header('x-user-id');
  if (!header) {
    return null;
  }

  const userId = Number(header);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpError(401, 'La sesion no es valida.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      participantTypeId: true
    }
  });

  if (!user) {
    throw new HttpError(401, 'La sesion no es valida.');
  }

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
