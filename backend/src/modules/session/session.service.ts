import { prisma } from '../../config/prisma.js';
import { currentUser } from '../../shared/auth.js';
import type { Request } from 'express';
import { degreeLabel } from '../instructors/instructor.rules.js';

const toUserResponse = (user: {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'PARTICIPANT' | 'INSTRUCTOR';
  participantTypeId: number | null;
  participantType: { name: string } | null;
  degree?: 'STUDENT' | 'ENGINEER' | 'TECHNICIAN' | null;
  sis?: string | null;
  phone?: string | null;
}) => ({
  id: String(user.id),
  name: user.name,
  email: user.email,
  role: user.role,
  participantTypeId: user.participantTypeId ? String(user.participantTypeId) : null,
  participantTypeName: user.participantType?.name ?? null,
  degree: degreeLabel(user.degree),
  sis: user.sis ?? null,
  phone: user.phone ?? null
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  participantTypeId: true,
  degree: true,
  sis: true,
  phone: true,
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
