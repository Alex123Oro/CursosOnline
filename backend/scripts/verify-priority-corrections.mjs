import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Refuse all remote/business database URLs. This script creates synthetic records.
const connection=process.env.TEST_DATABASE_URL;
assert(connection,'Set TEST_DATABASE_URL to the isolated local eva_priority_test database.');
const target=new URL(connection);
assert(['127.0.0.1','localhost','[::1]'].includes(target.hostname) && target.pathname==='/eva_priority_test',
  'Only the isolated local eva_priority_test database is allowed.');
process.env.DATABASE_URL=connection;
const { prisma:db }=await import('../dist/config/prisma.js');
const { courseService }=await import('../dist/modules/courses/course.service.js');
const { courseSessionService }=await import('../dist/modules/course-sessions/course-session.service.js');
const { enrollmentService }=await import('../dist/modules/enrollments/enrollment.service.js');
const checks=[];
const passed=name => checks.push({ name,passed:true });
try {
  const category=await db.participantType.create({ data:{ name:`Audit ${randomUUID()}` } });
  const account=async role => db.user.create({ data:{ authId:randomUUID(),name:`Isolated ${role}`,
    email:`${randomUUID()}@example.test`,role,participantTypeId:role==='PARTICIPANT'?category.id:null } });
  const admin=await account('ADMIN');
  const instructor=await account('INSTRUCTOR');
  const input={ name:'Curso aislado',content:'Contenido de las pruebas aisladas',durationHours:10,
    instructor:instructor.name,instructorId:instructor.id,approvalCriteria:'Nota y asistencia',
    capacity:20,startDate:'2026-11-01',endDate:'2026-11-30',preinscriptionStart:'2026-10-01',preinscriptionEnd:'2026-10-31' };
  await assert.rejects(courseService.create({ ...input,status:'PUBLISHED' }),error => error.statusCode===400);
  passed('Direct publication on creation is rejected');
  const created=await courseService.create(input);
  const courseId=Number(created.id);
  await courseService.replacePrices(courseId,[{ participantTypeId:category.id,basePrice:100 }]);
  await assert.rejects(courseService.publish(courseId),error => error.statusCode===400);
  await courseSessionService.create(courseId,{ sessionNumber:1,date:'2026-11-02',startTime:'18:00',durationMinutes:60 },admin);
  assert.equal((await courseService.publish(courseId)).status,'PUBLISHED');
  await assert.rejects(courseService.update(courseId,{ ...input,capacity:null }),error => error.statusCode===400);
  passed('Draft preparation and dedicated publication work; invalid published edits fail');

  const enrollment=async (overrides={}) => {
    const participant=await account('PARTICIPANT');
    return db.enrollment.create({ data:{ courseId,participantId:participant.id,participantTypeId:category.id,
      basePrice:100,finalAmount:100,payment:{ create:{ amount:100 } },...overrides } });
  };
  const funded=await enrollment();
  const confirmations=await Promise.allSettled([enrollmentService.confirm(funded.id),enrollmentService.confirm(funded.id)]);
  assert.equal(confirmations.filter(item => item.status==='fulfilled').length,1);
  assert.equal(confirmations.find(item => item.status==='rejected').reason.statusCode,400);
  passed('Two simultaneous confirmations of one enrollment produce one success');

  // Repeat against different rows to exercise both writers under real PostgreSQL locks.
  for (let iteration=0;iteration<5;iteration++) {
    const row=await enrollment();
    const operations=await Promise.allSettled([enrollmentService.confirm(row.id),enrollmentService.registerPayment(row.id,0)]);
    assert.equal(operations.filter(item => item.status==='fulfilled').length,1);
    const saved=await db.enrollment.findUniqueOrThrow({ where:{ id:row.id },include:{ payment:true } });
    assert(saved.status!=='INSCRITO' || Number(saved.payment?.amount ?? 0)>=Number(saved.finalAmount));
    for (const operation of operations) if(operation.status==='rejected') assert([400,409].includes(operation.reason.statusCode));
  }
  passed('Concurrent payment reductions and confirmations never leave a confirmed debt (5 races)');

  const grant=await enrollment({ status:'INSCRITO',scholarshipActive:true,scholarshipPercent:100,
    benefitAmount:100,finalAmount:0,payment:{ create:{ amount:0 } },confirmedAt:new Date() });
  await assert.rejects(enrollmentService.deactivateScholarship(grant.id),error => error.statusCode===409);
  assert.equal((await db.enrollment.findUniqueOrThrow({ where:{ id:grant.id } })).scholarshipActive,true);
  await enrollmentService.registerPayment(grant.id,100);
  const withoutGrant=await enrollmentService.deactivateScholarship(grant.id);
  assert.equal(withoutGrant.status,'INSCRITO');
  assert.equal(withoutGrant.finalAmount,100);
  assert.equal(withoutGrant.paymentStatus,'PAGADO');
  passed('Removing a confirmed grant requires funding and succeeds after the full payment');

  await assert.rejects(enrollmentService.registerPayment(grant.id,0),error => error.statusCode===409);
  assert.equal(Number((await db.payment.findUniqueOrThrow({ where:{ enrollmentId:grant.id } })).amount),100);
  passed('Rejected economic changes preserve the prior payment');
  await mkdir(new URL('../.local/',import.meta.url),{ recursive:true });
  await writeFile(new URL('../.local/priority-integration.json',import.meta.url),JSON.stringify({
    isolated:true,checks,passed:checks.length
  },null,2));
  console.log(JSON.stringify({ isolated:true,checks,passed:checks.length },null,2));
} finally { await db.$disconnect(); }
