-- Restore source ACLs after local Supabase default grants. No rows or business rules change.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon,authenticated,service_role;
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION certificate_assessment(p_course_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.certificate_assessment(p_course_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.certificate_assessment(p_course_id bigint) TO service_role;


--
-- Name: FUNCTION certificate_assessment_for_type(p_course_id bigint, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.certificate_assessment_for_type(p_course_id bigint, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.certificate_assessment_for_type(p_course_id bigint, p_type text) TO service_role;


--
-- Name: FUNCTION certificate_candidates(p_course_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.certificate_candidates(p_course_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.certificate_candidates(p_course_id bigint) TO service_role;


--
-- Name: FUNCTION certificate_candidates_for_type(p_course_id bigint, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.certificate_candidates_for_type(p_course_id bigint, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.certificate_candidates_for_type(p_course_id bigint, p_type text) TO service_role;


--
-- Name: FUNCTION clean_certificate_display_name(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_certificate_display_name() TO anon;
GRANT ALL ON FUNCTION public.clean_certificate_display_name() TO authenticated;
GRANT ALL ON FUNCTION public.clean_certificate_display_name() TO service_role;


--
-- Name: FUNCTION clean_course_display_name(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_course_display_name() TO anon;
GRANT ALL ON FUNCTION public.clean_course_display_name() TO authenticated;
GRANT ALL ON FUNCTION public.clean_course_display_name() TO service_role;


--
-- Name: FUNCTION clean_demo_display_name(value text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_demo_display_name(value text) TO anon;
GRANT ALL ON FUNCTION public.clean_demo_display_name(value text) TO authenticated;
GRANT ALL ON FUNCTION public.clean_demo_display_name(value text) TO service_role;


--
-- Name: FUNCTION clean_user_display_name(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clean_user_display_name() TO anon;
GRANT ALL ON FUNCTION public.clean_user_display_name() TO authenticated;
GRANT ALL ON FUNCTION public.clean_user_display_name() TO service_role;


--
-- Name: FUNCTION crear_usuario_desde_auth(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.crear_usuario_desde_auth() FROM PUBLIC;
GRANT ALL ON FUNCTION public.crear_usuario_desde_auth() TO anon;
GRANT ALL ON FUNCTION public.crear_usuario_desde_auth() TO authenticated;
GRANT ALL ON FUNCTION public.crear_usuario_desde_auth() TO service_role;


--
-- Name: FUNCTION emit_certificate(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.emit_certificate(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.emit_certificate(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint) TO service_role;


--
-- Name: FUNCTION emit_certificate_for_type(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.emit_certificate_for_type(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.emit_certificate_for_type(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text) TO service_role;


--
-- Name: FUNCTION emit_certificate_with_template(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text, p_template_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.emit_certificate_with_template(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text, p_template_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.emit_certificate_with_template(p_enrollment_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_type text, p_template_id bigint) TO service_role;


--
-- Name: FUNCTION guard_certified_academic_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_certified_academic_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_certified_academic_change() TO service_role;


--
-- Name: FUNCTION preserve_issued_result(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.preserve_issued_result() FROM PUBLIC;
GRANT ALL ON FUNCTION public.preserve_issued_result() TO service_role;


--
-- Name: FUNCTION preserve_payment_movement(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.preserve_payment_movement() TO anon;
GRANT ALL ON FUNCTION public.preserve_payment_movement() TO authenticated;
GRANT ALL ON FUNCTION public.preserve_payment_movement() TO service_role;


--
-- Name: FUNCTION reissue_certificate(p_certificate_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_reason text, p_type text, p_template_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reissue_certificate(p_certificate_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_reason text, p_type text, p_template_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reissue_certificate(p_certificate_id bigint, p_code text, p_public_url text, p_actor_id bigint, p_reason text, p_type text, p_template_id bigint) TO service_role;


--
-- Name: FUNCTION revoke_certificate(p_certificate_id bigint, p_actor_id bigint, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_certificate(p_certificate_id bigint, p_actor_id bigint, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_certificate(p_certificate_id bigint, p_actor_id bigint, p_reason text) TO service_role;


--
-- Name: FUNCTION sync_attendance_course(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_attendance_course() TO anon;
GRANT ALL ON FUNCTION public.sync_attendance_course() TO authenticated;
GRANT ALL ON FUNCTION public.sync_attendance_course() TO service_role;


--
-- Name: FUNCTION sync_session_api_time(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_session_api_time() TO anon;
GRANT ALL ON FUNCTION public.sync_session_api_time() TO authenticated;
GRANT ALL ON FUNCTION public.sync_session_api_time() TO service_role;


--
-- Name: TABLE _prisma_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._prisma_migrations TO anon;
GRANT ALL ON TABLE public._prisma_migrations TO authenticated;
GRANT ALL ON TABLE public._prisma_migrations TO service_role;


--
-- Name: TABLE anulaciones_certificados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.anulaciones_certificados TO anon;
GRANT ALL ON TABLE public.anulaciones_certificados TO authenticated;
GRANT ALL ON TABLE public.anulaciones_certificados TO service_role;


--
-- Name: SEQUENCE anulaciones_certificados_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.anulaciones_certificados_id_seq TO anon;
GRANT ALL ON SEQUENCE public.anulaciones_certificados_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.anulaciones_certificados_id_seq TO service_role;


--
-- Name: TABLE asignaciones_instructores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asignaciones_instructores TO anon;
GRANT ALL ON TABLE public.asignaciones_instructores TO authenticated;
GRANT ALL ON TABLE public.asignaciones_instructores TO service_role;


--
-- Name: SEQUENCE asignaciones_instructores_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asignaciones_instructores_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asignaciones_instructores_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asignaciones_instructores_id_seq TO service_role;


--
-- Name: TABLE asistencias_instructores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asistencias_instructores TO anon;
GRANT ALL ON TABLE public.asistencias_instructores TO authenticated;
GRANT ALL ON TABLE public.asistencias_instructores TO service_role;


--
-- Name: SEQUENCE asistencias_instructores_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asistencias_instructores_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asistencias_instructores_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asistencias_instructores_id_seq TO service_role;


--
-- Name: TABLE asistencias_participantes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asistencias_participantes TO anon;
GRANT ALL ON TABLE public.asistencias_participantes TO authenticated;
GRANT ALL ON TABLE public.asistencias_participantes TO service_role;


--
-- Name: SEQUENCE asistencias_participantes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.asistencias_participantes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.asistencias_participantes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.asistencias_participantes_id_seq TO service_role;


--
-- Name: TABLE becas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.becas TO anon;
GRANT ALL ON TABLE public.becas TO authenticated;
GRANT ALL ON TABLE public.becas TO service_role;


--
-- Name: SEQUENCE becas_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.becas_id_seq TO anon;
GRANT ALL ON SEQUENCE public.becas_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.becas_id_seq TO service_role;


--
-- Name: TABLE calificaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calificaciones TO anon;
GRANT ALL ON TABLE public.calificaciones TO authenticated;
GRANT ALL ON TABLE public.calificaciones TO service_role;


--
-- Name: SEQUENCE calificaciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.calificaciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.calificaciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.calificaciones_id_seq TO service_role;


--
-- Name: TABLE certificados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.certificados TO anon;
GRANT ALL ON TABLE public.certificados TO authenticated;
GRANT ALL ON TABLE public.certificados TO service_role;


--
-- Name: SEQUENCE certificados_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.certificados_id_seq TO anon;
GRANT ALL ON SEQUENCE public.certificados_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.certificados_id_seq TO service_role;


--
-- Name: TABLE cursos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cursos TO anon;
GRANT ALL ON TABLE public.cursos TO authenticated;
GRANT ALL ON TABLE public.cursos TO service_role;


--
-- Name: SEQUENCE cursos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.cursos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.cursos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.cursos_id_seq TO service_role;


--
-- Name: TABLE evaluaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evaluaciones TO anon;
GRANT ALL ON TABLE public.evaluaciones TO authenticated;
GRANT ALL ON TABLE public.evaluaciones TO service_role;


--
-- Name: SEQUENCE evaluaciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.evaluaciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.evaluaciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.evaluaciones_id_seq TO service_role;


--
-- Name: TABLE historial_inscripciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.historial_inscripciones TO service_role;


--
-- Name: SEQUENCE historial_inscripciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.historial_inscripciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.historial_inscripciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.historial_inscripciones_id_seq TO service_role;


--
-- Name: TABLE inscripciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inscripciones TO service_role;


--
-- Name: SEQUENCE inscripciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.inscripciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.inscripciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.inscripciones_id_seq TO service_role;


--
-- Name: TABLE movimientos_pago; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.movimientos_pago TO service_role;


--
-- Name: SEQUENCE movimientos_pago_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.movimientos_pago_id_seq TO anon;
GRANT ALL ON SEQUENCE public.movimientos_pago_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.movimientos_pago_id_seq TO service_role;


--
-- Name: TABLE pagos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pagos TO service_role;


--
-- Name: SEQUENCE pagos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.pagos_id_seq TO anon;
GRANT ALL ON SEQUENCE public.pagos_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.pagos_id_seq TO service_role;


--
-- Name: TABLE plantillas_certificados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plantillas_certificados TO service_role;


--
-- Name: SEQUENCE plantillas_certificados_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.plantillas_certificados_id_seq TO anon;
GRANT ALL ON SEQUENCE public.plantillas_certificados_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.plantillas_certificados_id_seq TO service_role;


--
-- Name: TABLE precios_curso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.precios_curso TO service_role;


--
-- Name: SEQUENCE precios_curso_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.precios_curso_id_seq TO anon;
GRANT ALL ON SEQUENCE public.precios_curso_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.precios_curso_id_seq TO service_role;


--
-- Name: TABLE preinscripciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.preinscripciones TO anon;
GRANT ALL ON TABLE public.preinscripciones TO authenticated;
GRANT ALL ON TABLE public.preinscripciones TO service_role;


--
-- Name: SEQUENCE preinscripciones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.preinscripciones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.preinscripciones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.preinscripciones_id_seq TO service_role;


--
-- Name: TABLE resultados_academicos_curso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resultados_academicos_curso TO anon;
GRANT ALL ON TABLE public.resultados_academicos_curso TO authenticated;
GRANT ALL ON TABLE public.resultados_academicos_curso TO service_role;


--
-- Name: SEQUENCE resultados_academicos_curso_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.resultados_academicos_curso_id_seq TO anon;
GRANT ALL ON SEQUENCE public.resultados_academicos_curso_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.resultados_academicos_curso_id_seq TO service_role;


--
-- Name: TABLE resultados_curso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resultados_curso TO anon;
GRANT ALL ON TABLE public.resultados_curso TO authenticated;
GRANT ALL ON TABLE public.resultados_curso TO service_role;


--
-- Name: SEQUENCE resultados_curso_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.resultados_curso_id_seq TO anon;
GRANT ALL ON SEQUENCE public.resultados_curso_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.resultados_curso_id_seq TO service_role;


--
-- Name: TABLE roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.roles TO anon;
GRANT ALL ON TABLE public.roles TO authenticated;
GRANT ALL ON TABLE public.roles TO service_role;


--
-- Name: SEQUENCE roles_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.roles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.roles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.roles_id_seq TO service_role;


--
-- Name: TABLE sesiones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sesiones TO anon;
GRANT ALL ON TABLE public.sesiones TO authenticated;
GRANT ALL ON TABLE public.sesiones TO service_role;


--
-- Name: SEQUENCE sesiones_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.sesiones_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sesiones_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sesiones_id_seq TO service_role;


--
-- Name: TABLE tipos_participante; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tipos_participante TO service_role;


--
-- Name: SEQUENCE tipos_participante_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tipos_participante_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tipos_participante_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tipos_participante_id_seq TO service_role;


--
-- Name: TABLE usuarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usuarios TO service_role;


--
-- Name: SEQUENCE usuarios_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.usuarios_id_seq TO anon;
GRANT ALL ON SEQUENCE public.usuarios_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.usuarios_id_seq TO service_role;


--
-- Name: TABLE usuarios_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usuarios_roles TO anon;
GRANT ALL ON TABLE public.usuarios_roles TO authenticated;
GRANT ALL ON TABLE public.usuarios_roles TO service_role;


--
-- Name: SEQUENCE usuarios_roles_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.usuarios_roles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.usuarios_roles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.usuarios_roles_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



NOTIFY pgrst, 'reload schema';
