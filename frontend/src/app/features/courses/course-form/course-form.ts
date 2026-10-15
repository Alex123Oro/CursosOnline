import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Course, CoursePayload, ParticipantTypeOption } from '../../../core/course.service';
import { InstructorOption } from '../../../core/instructor-attendance.service';

const courseDates = (control: AbstractControl) => {
  const { startDate, endDate, preinscriptionStart, preinscriptionEnd, capacity, minimumEnrollment } = control.value;
  return {
    ...(capacity != null && minimumEnrollment > capacity ? { minimumEnrollmentCapacity: true } : {}),
    ...(startDate && endDate && endDate < startDate ? { courseDateOrder: true } : {}),
    ...(preinscriptionStart && preinscriptionEnd && preinscriptionEnd < preinscriptionStart ? { preinscriptionDateOrder: true } : {})
  } as Record<string, boolean>;
};
const integer = (control: AbstractControl) => Number.isInteger(control.value) ? null : { integer: true };

@Component({
  selector: 'app-course-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './course-form.html',
  styleUrl: './course-form.scss'
})
export class CourseForm implements OnChanges {
  @Input() presentation: 'modal' | 'page' = 'modal';
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() course: Course | null = null;
  @Input() participantTypes: ParticipantTypeOption[] = [];
  @Input() instructors: InstructorOption[] = [];
  @Input() instructorsLoading = false;
  @Input() instructorsError = '';
  @Output() retryInstructors = new EventEmitter<void>();
  @Input() saving = false;
  @Input() saveError = '';
  @Output() save = new EventEmitter<CoursePayload>();
  @Output() cancel = new EventEmitter<void>();
  readonly priceValues = signal<Record<string, number | null>>({});
  readonly priceError = signal('');
  get priceCategories() {
    return this.participantTypes.filter(type => {
      const name = type.name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return !/^(docentes?|administrativ[oa]s?)$/.test(name);
    });
  }

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    content: ['', [Validators.required, Validators.minLength(10)]],
    durationHours: [1, [Validators.required, Validators.min(1), integer]],
    instructorId: ['', Validators.required],
    schedule: [''],
    approvalCriteria: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^(?=.*\S).+$/)]],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    capacity: [null as number | null, [Validators.required, Validators.min(1), integer]],
    minimumEnrollment: [1, [Validators.required, Validators.min(1), integer]],
    preinscriptionStart: ['', Validators.required],
    preinscriptionEnd: ['', Validators.required]
  }, { validators: control => { const errors = courseDates(control); return Object.keys(errors).length ? errors : null; } });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['course']) {
      const course = this.course;
      this.form.reset({
        name: course?.name ?? '',
        content: course?.content ?? '',
        durationHours: course?.durationHours ?? 1,
        instructorId: course?.instructorId ?? '',
        schedule: course?.schedule ?? '',
        approvalCriteria: course?.approvalCriteria ?? '',
        startDate: course?.startDate ?? '',
        endDate: course?.endDate ?? '',
        capacity: course?.capacity ?? null,
        minimumEnrollment: course?.minimumEnrollment ?? 1,
        preinscriptionStart: course?.preinscriptionStart ?? '',
        preinscriptionEnd: course?.preinscriptionEnd ?? ''
      });
      this.priceValues.set(Object.fromEntries((this.course?.prices ?? []).map(price => [price.participantTypeId, price.basePrice])));
    }
    if ((changes['course'] || changes['instructors']) && !this.form.controls.instructorId.value && this.course?.instructor) {
      const match = this.instructors.filter(instructor => instructor.name.trim() === this.course?.instructor.trim());
      if (match.length === 1) this.form.controls.instructorId.setValue(match[0].id);
    }
    if (changes['participantTypes'] && this.participantTypes.length) {
      const existing = this.priceValues();
      this.priceValues.set(Object.fromEntries(this.priceCategories.map(type => [type.id, existing[type.id] ?? null])));
    }
  }

  priceValue(typeId: string) { return this.priceValues()[typeId] ?? ''; }
  setPrice(typeId: string, raw: string) { this.priceValues.update(values => ({ ...values, [typeId]: raw === '' ? null : Number(raw) })); this.priceError.set(''); }

  fieldError(name: keyof typeof this.form.controls) {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  submit() {
    if (this.saving || this.instructorsLoading || this.instructorsError) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const instructor = this.instructors.find(option => option.id === this.form.controls.instructorId.value);
    if (!instructor) { this.form.controls.instructorId.setErrors({ invalidInstructor: true }); return; }

    const prices = this.priceCategories.map(type => ({ participantTypeId: type.id, basePrice: this.priceValues()[type.id] }));
    if (!prices.length) {
      this.priceError.set('No hay categorías de participantes configuradas para asignar precios.');
      return;
    }
    if (prices.some(price => price.basePrice === null || !Number.isFinite(price.basePrice) || price.basePrice < 0)) {
      this.priceError.set('Ingresa un precio válido y no negativo para cada categoría.');
      return;
    }

    const value = this.form.getRawValue();
    this.save.emit({
      name: value.name.trim(),
      content: value.content.trim(),
      durationHours: Number(value.durationHours),
      instructor: instructor.name,
      instructorId: instructor.id,
      approvalCriteria: value.approvalCriteria.trim(),
      startDate: value.startDate || null,
      endDate: value.endDate || null,
      capacity: Number(value.capacity),
      minimumEnrollment: Number(value.minimumEnrollment),
      preinscriptionStart: value.preinscriptionStart,
      preinscriptionEnd: value.preinscriptionEnd,
      prices: prices.map(price => ({ participantTypeId: price.participantTypeId, basePrice: price.basePrice! }))
    });
  }
}
