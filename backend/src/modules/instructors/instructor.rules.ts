import { z } from 'zod';

export const instructorInputSchema = z.strictObject({
  name: z.string().trim().min(1, 'El nombre es obligatorio.'),
  email: z.string().trim().toLowerCase().email('El correo no es válido.'),
  degree: z.enum(['Estudiante', 'Ingeniero', 'Técnico'], { error: 'Seleccione un grado válido.' }),
  sis: z.string().regex(/^\d{9}$/, 'El SIS debe contener exactamente nueve dígitos.'),
  phone: z.string().trim().regex(/^[\d+ ().-]+$/, 'El teléfono no es válido.').regex(/\d/, 'El teléfono debe contener al menos un dígito.'),
  password: z.string().min(12, 'La contraseña debe contener al menos 12 caracteres.')
});
export type InstructorInput = z.infer<typeof instructorInputSchema>;
export const degreeValues = { Estudiante: 'STUDENT', Ingeniero: 'ENGINEER', Técnico: 'TECHNICIAN' } as const;
export const degreeLabel = (value: 'STUDENT' | 'ENGINEER' | 'TECHNICIAN' | null | undefined) =>
  value ? ({ STUDENT: 'Estudiante', ENGINEER: 'Ingeniero', TECHNICIAN: 'Técnico' } as const)[value] : null;

export const assignInstructorSchema = z.strictObject({
  courseId: z.coerce.number().int().positive(),
  instructorId: z.coerce.number().int().positive()
});
export const updateAssignmentSchema = z.strictObject({
  instructorId: z.coerce.number().int().positive()
});
