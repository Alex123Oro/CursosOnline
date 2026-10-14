import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../shared/http-error.js';
import { instructorAuth } from './instructor-auth.js';
import { degreeLabel, degreeValues, type InstructorInput } from './instructor.rules.js';
import type { User } from '@prisma/client';

const toResponse = (user: User) => ({ id: String(user.id), name: user.name, email: user.email, degree: degreeLabel(user.degree),
  sis: user.sis, phone: user.phone, role: user.role, participantTypeId: null, participantTypeName: null });
const definitivePersistenceFailure = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;
  if ('name' in error && error.name === 'PrismaClientValidationError') return true;
  return 'code' in error && typeof error.code === 'string' && ['P2000', 'P2002', 'P2003', 'P2004', 'P2011', 'P2012', 'P2014', 'P2025'].includes(error.code);
};

const duplicate = (paths: string[]) => new HttpError(409, 'Ya existe una cuenta con estos datos.',
  paths.map(path => ({ path, message: path === 'sis' ? 'El SIS ya está registrado.' : 'El correo ya está registrado.' })));

export const instructorService = {
  async create(input: InstructorInput) {
    let existing;
    try {
      existing = await prisma.user.findFirst({
        where: { OR: [{ email: { equals: input.email, mode: 'insensitive' } }, { sis: input.sis }] },
        select: { email: true, sis: true }
      });
    } catch { throw new HttpError(500, 'No se pudo verificar el instructor.'); }
    if (existing) {
      const paths = [];
      if (existing.email.toLowerCase() === input.email) paths.push('email');
      if (existing.sis === input.sis) paths.push('sis');
      throw duplicate(paths);
    }
    let authId: string;
    try { authId = await instructorAuth.createIdentity({ name: input.name, email: input.email, password: input.password }); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, 'No se pudo crear la cuenta de acceso.'); }
    try {
      const user = await prisma.user.create({ data: {
        authId, name: input.name, email: input.email, degree: degreeValues[input.degree],
        sis: input.sis, phone: input.phone, role: 'INSTRUCTOR', participantTypeId: null
      } });
      return toResponse(user);
    } catch (error) {
      if (!definitivePersistenceFailure(error)) {
        let persisted;
        try { persisted = await prisma.user.findUnique({ where: { authId } }); }
        catch {
          console.error('instructor_profile_creation_unresolved', { authId });
          throw new HttpError(503, 'No se pudo confirmar el alta del instructor.');
        }
        if (persisted) {
          if (persisted.authId === authId && persisted.email === input.email && persisted.sis === input.sis &&
              persisted.name === input.name && persisted.phone === input.phone && persisted.degree === degreeValues[input.degree] &&
              persisted.role === 'INSTRUCTOR' && persisted.participantTypeId === null) return toResponse(persisted);
          console.error('instructor_profile_creation_unresolved', { authId });
          throw new HttpError(503, 'No se pudo confirmar el alta del instructor.');
        }
      }
      try { await instructorAuth.deleteIdentity(authId); }
      catch {
        console.error('instructor_identity_cleanup_failed', { authId });
        throw new HttpError(500, 'No se pudo completar el alta del instructor.');
      }
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const target = 'meta' in error ? (error.meta as { target?: unknown } | undefined)?.target : undefined;
        const targets = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
        const columns = { email: ['email', 'correo', 'User_email_key', 'usuarios_correo_key'], sis: ['sis', 'codigo_sis', 'User_sis_key', 'usuarios_codigo_sis_key'] };
        throw duplicate(Object.entries(columns).filter(([, names]) => targets.some(value => typeof value === 'string' && names.includes(value))).map(([field]) => field));
      }
      throw new HttpError(500, 'No se pudo guardar el instructor.');
    }
  }
};
