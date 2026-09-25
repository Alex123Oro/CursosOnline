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
};

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
    endDate: '2026-11-11'
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
    endDate: '2026-11-05'
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
    endDate: '2026-11-18'
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
    endDate: '2026-11-17'
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
    endDate: '2026-11-14'
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
    endDate: '2026-11-06'
  }
];
