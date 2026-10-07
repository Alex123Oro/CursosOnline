import { prisma } from '../../config/prisma.js';
import { currentUser } from '../../shared/auth.js';
import type { Request } from 'express';

const toUserResponse = (user: {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'PARTICIPANT' | 'INSTRUCTOR';
  participantTypeId: number | null;
  participantType: { name: string } | null;
}) => ({
  id: String(user.id),
  name: user.name,
  email: user.email,
  role: user.role,
  participantTypeId: user.participantTypeId ? String(user.participantTypeId) : null,
  participantTypeName: user.participantType?.name ?? null
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  participantTypeId: true,
  participantType: {
    select: { name: true }
  }
} as const;

export const sessionService = {
  async listUsers() {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { id: 'asc' }
    });

    return users.map(toUserResponse);
  },

  me(request: Request) {
    const user = currentUser(request);
    return {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
      participantTypeId: user.participantTypeId ? String(user.participantTypeId) : null
    };
  }
};
