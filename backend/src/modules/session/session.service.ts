import type { Request } from 'express';
import { prisma } from '../../config/prisma.js';
import { currentUser } from '../../shared/auth.js';
import { degreeLabel } from '../instructors/instructor.rules.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  participantTypeId: true,
  degree: true,
  sis: true,
  phone: true,
  participantType: { select: { name: true } }
} as const;

type UserView = {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'PARTICIPANT' | 'INSTRUCTOR';
  participantTypeId: number | null;
  participantType: { name: string } | null;
  degree: 'STUDENT' | 'ENGINEER' | 'TECHNICIAN' | null;
  sis: string | null;
  phone: string | null;
};

const toUserResponse = (user: UserView) => ({
  id: String(user.id),
  name: user.name,
  email: user.email,
  role: user.role,
  participantTypeId: user.participantTypeId == null ? null : String(user.participantTypeId),
  participantTypeName: user.participantType?.name ?? null,
  degree: degreeLabel(user.degree),
  sis: user.sis,
  phone: user.phone
});

export const sessionService = {
  async listUsers() {
    const users = await prisma.user.findMany({ select: userSelect, orderBy: { id: 'asc' } });
    return users.map(toUserResponse);
  },

  me(request: Request) {
    const user = currentUser(request);
    return {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
      participantTypeId: user.participantTypeId == null ? null : String(user.participantTypeId)
    };
  }
};
