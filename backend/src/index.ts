import express from 'express';
import cors from 'cors';
import { supabase } from './config/supabase.js';
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
	const { error } = await supabase.auth.getSession();

	if (error) {
		response.status(503).json({ ok: false, servicio: 'supabase', error: error.message });
		return;
	}

	response.json({ ok: true, servicio: 'supabase' });
});

app.use(errorMiddleware);

app.listen(port, () => {
	console.log(`Backend escuchando en http://localhost:${port}`);
});
