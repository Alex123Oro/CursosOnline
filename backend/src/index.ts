import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { env } from './config/env.js';
import { supabase } from './config/supabase.js';
import { prisma } from './config/prisma.js';
import { courseRoutes } from './modules/courses/course.routes.js';
import { enrollmentRoutes } from './modules/enrollments/enrollment.routes.js';
import { participantTypeRoutes } from './modules/participant-types/participant-type.routes.js';
import { sessionRoutes } from './modules/session/session.routes.js';
import { errorMiddleware } from './shared/error.middleware.js';
import { courseSessionRoutes, teachingRoutes } from './modules/course-sessions/course-session.routes.js';
import { attendanceRoutes } from './modules/attendance/attendance.routes.js';
import { instructorAttendanceRoutes } from './modules/instructor-attendance/instructor-attendance.routes.js';

const app = express();
const allowAnyOrigin = env.corsOrigins.includes('*');

app.use(cors({
	origin: allowAnyOrigin ? true : env.corsOrigins,
	optionsSuccessStatus: 204
}));
app.use(express.json());

app.get('/api/health', (_request, response) => {
	response.json({ ok: true, servicio: 'backend' });
});

app.use('/api/courses', courseRoutes);
app.use('/api/courses', courseSessionRoutes);
app.use('/api/courses', attendanceRoutes);
app.use('/api/admin', instructorAttendanceRoutes);
app.use('/api/teaching', teachingRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/participant-types', participantTypeRoutes);
app.use('/api/session', sessionRoutes);

app.get('/api/supabase/health', async (_request, response) => {
	if (!supabase) {
		response.status(503).json({
			ok: false,
			servicio: 'supabase-auth',
			error: 'Supabase no esta configurado.'
		});
		return;
	}

	const { error: authError } = await supabase.auth.getSession();

	if (authError) {
		response.status(503).json({ ok: false, servicio: 'supabase-auth', error: authError.message });
		return;
	}

	try {
		await prisma.$queryRaw`SELECT 1`;
		response.json({ ok: true, servicio: 'supabase', auth: true, database: true });
	} catch (databaseError) {
		const message = databaseError instanceof Error ? databaseError.message : 'No se pudo conectar con PostgreSQL.';
		response.status(503).json({ ok: false, servicio: 'supabase-database', auth: true, database: false, error: message });
	}
});

const frontendDirectory = fileURLToPath(new URL('../../frontend/dist/frontend/browser/', import.meta.url));
const frontendIndex = join(frontendDirectory, 'index.html');

if (existsSync(frontendIndex)) {
	app.use(express.static(frontendDirectory));
	app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
		response.sendFile(frontendIndex);
	});
}

app.use(errorMiddleware);

app.listen(env.port, () => {
	console.log(`Backend escuchando en http://localhost:${env.port}`);
});
