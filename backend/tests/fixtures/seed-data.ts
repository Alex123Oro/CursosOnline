export type SeedCourse = {
  code: string;
  name: string;
  content: string;
  durationHours: number;
  instructor: string;
  schedule: string;
  approvalCriteria: string;
  status: 'PUBLISHED';
  startDate: string;
  endDate: string;
  capacity: number;
  preinscriptionStart: string;
  preinscriptionEnd: string;
};

export const SEED_PARTICIPANT_TYPES = ['Estudiante', 'Docente', 'Administrativo', 'Externo'] as const;

export const SEED_PRICES: Record<(typeof SEED_PARTICIPANT_TYPES)[number], number> = {
  Estudiante: 400,
  Docente: 500,
  Administrativo: 450,
  Externo: 700
};

export const SEED_USERS = [
  { name: 'Ana Admin', email: 'admin@eva.local', role: 'ADMIN' as const, participantTypeName: null },
  { name: 'Luis Estudiante', email: 'luis@eva.local', role: 'PARTICIPANT' as const, participantTypeName: 'Estudiante' },
  { name: 'Marta Docente', email: 'marta@eva.local', role: 'PARTICIPANT' as const, participantTypeName: 'Docente' },
  { name: 'Pedro Externo', email: 'pedro@eva.local', role: 'PARTICIPANT' as const, participantTypeName: 'Externo' }
];

export const SEED_INSTRUCTORS = [
  { name: 'Ing. Carla Mendoza', email: 'carla.instructor@eva.local' },
  { name: 'Téc. Diego Quispe', email: 'diego.instructor@eva.local' },
  { name: 'Lic. Valeria Ríos', email: 'valeria.instructor@eva.local' },
  { name: 'Ing. Mauricio Flores', email: 'mauricio.instructor@eva.local' },
  { name: 'Ing. Andrea Salazar', email: 'andrea.instructor@eva.local' },
  { name: 'Lic. Daniel Paredes', email: 'daniel.instructor@eva.local' }
];

export const SEED_COURSES: SeedCourse[] = [
  {
    code: 'INF-PG-201',
    name: 'PostgreSQL Intermedio',
    content: 'Diseño de consultas avanzadas, índices, transacciones, vistas y optimización básica de bases de datos PostgreSQL.',
    durationHours: 30,
    instructor: 'Ing. Carla Mendoza',
    schedule: 'Lunes y miércoles de 19:00 a 21:30',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-10-05',
    endDate: '2026-11-11',
    capacity: 20,
    preinscriptionStart: '2026-09-01',
    preinscriptionEnd: '2026-12-31'
  },
  {
    code: 'INF-HW-110',
    name: 'Mantenimiento y Reparación de PC',
    content: 'Diagnóstico de fallas, mantenimiento preventivo, ensamblaje, instalación de componentes y solución de problemas de hardware.',
    durationHours: 24,
    instructor: 'Téc. Diego Quispe',
    schedule: 'Martes y jueves de 18:30 a 21:00',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-10-06',
    endDate: '2026-11-05',
    capacity: 16,
    preinscriptionStart: '2026-09-01',
    preinscriptionEnd: '2026-12-31'
  },
  {
    code: 'INF-JS-101',
    name: 'Programación con JavaScript',
    content: 'Fundamentos de JavaScript moderno, funciones, arreglos, objetos, asincronía y desarrollo de aplicaciones web interactivas.',
    durationHours: 32,
    instructor: 'Lic. Valeria Ríos',
    schedule: 'Lunes, miércoles y viernes de 18:30 a 20:30',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-10-12',
    endDate: '2026-11-18',
    capacity: 24,
    preinscriptionStart: '2026-09-01',
    preinscriptionEnd: '2026-12-31'
  },
  {
    code: 'INF-LNX-120',
    name: 'Administración Básica de Linux',
    content: 'Uso de terminal, gestión de usuarios, permisos, servicios, red básica y automatización elemental en distribuciones Linux.',
    durationHours: 28,
    instructor: 'Ing. Mauricio Flores',
    schedule: 'Martes y jueves de 19:00 a 21:00',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-10-13',
    endDate: '2026-11-17',
    capacity: 18,
    preinscriptionStart: '2026-09-01',
    preinscriptionEnd: '2026-12-31'
  },
  {
    code: 'INF-NET-130',
    name: 'Redes de Computadoras',
    content: 'Conceptos de redes, direccionamiento IPv4, subnetting, configuración básica de routers y resolución de incidentes de conectividad.',
    durationHours: 30,
    instructor: 'Ing. Andrea Salazar',
    schedule: 'Sábados de 08:30 a 13:30',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-10-10',
    endDate: '2026-11-14',
    capacity: 20,
    preinscriptionStart: '2026-09-01',
    preinscriptionEnd: '2026-12-31'
  },
  {
    code: 'INF-GIT-140',
    name: 'Git y GitHub para Proyectos Colaborativos',
    content: 'Control de versiones con Git, ramas, resolución de conflictos, pull requests y flujos de trabajo colaborativo con GitHub.',
    durationHours: 20,
    instructor: 'Lic. Daniel Paredes',
    schedule: 'Viernes de 18:00 a 22:00',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-10-09',
    endDate: '2026-11-06',
    capacity: 22,
    preinscriptionStart: '2026-09-01',
    preinscriptionEnd: '2026-12-31'
  },
  // HU4: Public test course with one slot for the full-capacity scenario.
  {
    code: 'INF-UX-150',
    name: 'Diseño de Experiencia de Usuario',
    content: 'Principios de investigación, arquitectura de información, prototipado y evaluación de interfaces digitales.',
    durationHours: 24,
    instructor: 'Ing. Carla Mendoza',
    schedule: 'Martes y jueves de 18:00 a 20:00',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-11-02',
    endDate: '2026-11-30',
    capacity: 1,
    preinscriptionStart: '2026-10-01',
    preinscriptionEnd: '2026-12-01'
  },
  // HU4: Public test course with available slots for successful pre-registration.
  {
    code: 'INF-PY-160',
    name: 'Python para Análisis de Datos',
    content: 'Procesamiento de datos con Python, estructuras tabulares, limpieza de información y visualización básica.',
    durationHours: 30,
    instructor: 'Téc. Diego Quispe',
    schedule: 'Lunes y miércoles de 18:30 a 21:00',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2026-12-01',
    endDate: '2026-12-22',
    capacity: 20,
    preinscriptionStart: '2026-10-01',
    preinscriptionEnd: '2026-11-25'
  },
  // HU4: Public test course for catalog, detail, and open-period checks.
  {
    code: 'INF-CYB-170',
    name: 'Fundamentos de Ciberseguridad',
    content: 'Buenas prácticas de seguridad, amenazas comunes, protección de cuentas y respuesta inicial ante incidentes.',
    durationHours: 20,
    instructor: 'Lic. Valeria Ríos',
    schedule: 'Sábados de 09:00 a 13:00',
    approvalCriteria: 'Nota final mínima de 70/100 y asistencia mínima de 80%.',
    status: 'PUBLISHED',
    startDate: '2027-01-11',
    endDate: '2027-02-08',
    capacity: 18,
    preinscriptionStart: '2026-10-01',
    preinscriptionEnd: '2027-01-05'
  }
];
