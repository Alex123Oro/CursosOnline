import express from 'express';
import cors from 'cors';
import { supabase } from './config/supabase.js';
import { prisma } from './config/prisma.js';
import { courseRoutes } from './modules/courses/course.routes.js';
import { enrollmentRoutes } from './modules/enrollments/enrollment.routes.js';
import { participantTypeRoutes } from './modules/participant-types/participant-type.routes.js';
import { sessionRoutes } from './modules/session/session.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { progressRoutes } from './modules/progress/progress.routes.js';
import { evaluationRoutes } from './modules/progress/evaluation.routes.js';
import { courseSessionRoutes, teachingRoutes } from './modules/course-sessions/course-session.routes.js';
import { attendanceRoutes } from './modules/attendance/attendance.routes.js';
import { instructorAttendanceRoutes } from './modules/instructor-attendance/instructor-attendance.routes.js';
import { instructorRoutes } from './modules/instructors/instructor.routes.js';
import { errorMiddleware } from './shared/error.middleware.js';

const app = express();
const port = Number(process.env.PUERTO ?? 3000);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
	response.json({ ok: true, servicio: 'backend' });
});

app.use('/api/courses', courseRoutes);
app.use('/api/courses', courseSessionRoutes);
app.use('/api/courses', attendanceRoutes);
app.use('/api/admin', instructorAttendanceRoutes);
app.use('/api/admin', instructorRoutes);
app.use('/api/teaching', teachingRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/participant-types', participantTypeRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/courses', evaluationRoutes);

app.get('/api/supabase/health', async (_request, response) => {
	if (!supabase) {
		response.status(503).json({ ok: false, servicio: 'supabase-auth', error: 'Supabase no esta configurado.' });
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

app.use(errorMiddleware);

app.listen(port, () => {
	console.log(`Backend escuchando en http://localhost:${port}`);
});
