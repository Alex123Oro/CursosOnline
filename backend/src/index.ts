import express from 'express';
import cors from 'cors';
import { supabase } from './config/supabase.js';
import { prisma } from './config/prisma.js';
import { courseRoutes } from './modules/courses/course.routes.js';
import { errorMiddleware } from './shared/error.middleware.js';

const app = express();
const port = Number(process.env.PUERTO ?? 3000);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
	response.json({ ok: true, servicio: 'backend' });
});

app.use('/api/courses', courseRoutes);

app.get('/api/supabase/health', async (_request, response) => {
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
