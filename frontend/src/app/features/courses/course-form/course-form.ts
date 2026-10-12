import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Course, CoursePayload, ParticipantTypeOption } from '../../../core/course.service';

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
  @Input() participantTypes: ParticipantTypeOption[] = [];
  @Input() saving = false;
  @Output() save = new EventEmitter<CoursePayload>();
  @Output() cancel = new EventEmitter<void>();
  readonly priceValues = signal<Record<string, number | null>>({});
  readonly priceError = signal('');

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    code: [''],
    name: ['', [Validators.required, Validators.minLength(3)]],
    content: ['', [Validators.required, Validators.minLength(10)]],
    durationHours: [1, [Validators.required, Validators.min(1)]],
    instructor: ['', [Validators.required, Validators.minLength(2)]],
    schedule: ['', [Validators.required, Validators.minLength(3)]],
    approvalCriteria: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^(?=.*\S).+$/)]],
    startDate: [''],
    endDate: ['']
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['course']) {
      const course = this.course;
      this.form.reset({
        code: course?.code ?? '',
        name: course?.name ?? '',
        content: course?.content ?? '',
        durationHours: course?.durationHours ?? 1,
        instructor: course?.instructor ?? '',
        schedule: course?.schedule ?? '',
        approvalCriteria: course?.approvalCriteria ?? '',
        startDate: course?.startDate ?? '',
        endDate: course?.endDate ?? ''
      });
      this.priceValues.set(Object.fromEntries((this.course?.prices ?? []).map(price => [price.participantTypeId, price.basePrice])));
    }
    if (changes['participantTypes'] && this.participantTypes.length) {
      const existing = this.priceValues();
      this.priceValues.set(Object.fromEntries(this.participantTypes.map(type => [type.id, existing[type.id] ?? null])));
    }
  }

  priceValue(typeId: string) { return this.priceValues()[typeId] ?? ''; }
  setPrice(typeId: string, raw: string) { this.priceValues.update(values => ({ ...values, [typeId]: raw === '' ? null : Number(raw) })); this.priceError.set(''); }

  fieldError(name: keyof typeof this.form.controls) {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const prices = this.participantTypes.map(type => ({ participantTypeId: type.id, basePrice: this.priceValues()[type.id] }));
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
      code: value.code.trim() || undefined,
      name: value.name.trim(),
      content: value.content.trim(),
      durationHours: Number(value.durationHours),
      instructor: value.instructor.trim(),
      schedule: value.schedule.trim(),
      approvalCriteria: value.approvalCriteria.trim(),
      startDate: value.startDate || null,
      endDate: value.endDate || null,
      prices: prices.map(price => ({ participantTypeId: price.participantTypeId, basePrice: price.basePrice! }))
    });
  }
}
