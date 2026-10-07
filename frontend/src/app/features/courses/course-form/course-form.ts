import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Course, CoursePayload, CoursePricesPayload, ParticipantType } from '../../../core/course.service';
import { SessionUser } from '../../../core/session.service';

const dateRangeValidator = (group: AbstractControl): ValidationErrors | null => {
  const startDate = group.get('startDate')?.value;
  const endDate = group.get('endDate')?.value;
  const preStart = group.get('preinscriptionStart')?.value;
  const preEnd = group.get('preinscriptionEnd')?.value;

  if (startDate && endDate && startDate > endDate) {
    return { dateRange: true };
  }

  if (preStart && preEnd && preStart > preEnd) {
    return { preinscriptionRange: true };
  }

  return null;
};

@Component({
  selector: 'app-course-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './course-form.html',
  styleUrl: './course-form.scss'
})
export class CourseForm implements OnChanges {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() course: Course | null = null;
  @Input() participantTypes: ParticipantType[] = [];
  @Input() instructors: SessionUser[] = [];
  @Input() saving = false;
  @Output() save = new EventEmitter<{ course: CoursePayload; prices: CoursePricesPayload }>();
  @Output() cancel = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    code: [''],
    name: ['', [Validators.required, Validators.minLength(3)]],
    content: ['', [Validators.required, Validators.minLength(10)]],
    durationHours: [1, [Validators.required, Validators.min(1)]],
    instructor: ['', [Validators.required, Validators.minLength(2)]],
    instructorId: [''],
    schedule: ['', [Validators.required, Validators.minLength(3)]],
    startDate: [''],
    endDate: [''],
    capacity: [null as number | null, [Validators.min(1)]],
    preinscriptionStart: [''],
    preinscriptionEnd: [''],
    prices: this.fb.array([])
  }, { validators: dateRangeValidator });

  get prices(): FormArray {
    return this.form.controls.prices;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['participantTypes'] || changes['course']) {
      this.syncPriceControls();
    }

    if (changes['course']) {
      const course = this.course;
      this.form.patchValue({
        code: course?.code ?? '',
        name: course?.name ?? '',
        content: course?.content ?? '',
        durationHours: course?.durationHours ?? 1,
        instructor: course?.instructor ?? '',
        instructorId: course?.instructorId ?? '',
        schedule: course?.schedule ?? '',
        startDate: course?.startDate ?? '',
        endDate: course?.endDate ?? '',
        capacity: course?.capacity ?? null,
        preinscriptionStart: course?.preinscriptionStart ?? '',
        preinscriptionEnd: course?.preinscriptionEnd ?? ''
      });
    }
  }

  fieldError(name: string) {
    const control = this.form.get(name);
    return Boolean(control?.invalid && (control.touched || control.dirty));
  }

  priceError(index: number) {
    const control = this.prices.at(index).get('basePrice');
    return Boolean(control?.invalid && (control.touched || control.dirty));
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving) return;

    const value = this.form.getRawValue();
    this.save.emit({
      course: {
        code: value.code.trim() || undefined,
        name: value.name.trim(),
        content: value.content.trim(),
        durationHours: Number(value.durationHours),
        instructor: value.instructor.trim(),
        instructorId: value.instructorId || null,
        schedule: value.schedule.trim(),
        startDate: value.startDate || null,
        endDate: value.endDate || null,
        capacity: value.capacity === null || value.capacity === undefined || value.capacity === ('' as never) ? null : Number(value.capacity),
        preinscriptionStart: value.preinscriptionStart || null,
        preinscriptionEnd: value.preinscriptionEnd || null
      },
      prices: {
        items: (value.prices as { participantTypeId: string; basePrice: number }[]).map(item => ({
          participantTypeId: item.participantTypeId,
          basePrice: Number(item.basePrice)
        }))
      }
    });
  }

  private syncPriceControls() {
    this.prices.clear();
    for (const type of this.participantTypes) {
      const existing = this.course?.prices.find(price => price.participantTypeId === type.id);
      this.prices.push(this.fb.nonNullable.group({
        participantTypeId: [type.id],
        basePrice: [existing?.basePrice ?? 0, [Validators.required, Validators.min(0)]]
      }));
    }
  }

  selectInstructor(id: string) {
    const instructor = this.instructors.find(user => user.id === id);
    if (instructor) this.form.controls.instructor.setValue(instructor.name);
  }
}
