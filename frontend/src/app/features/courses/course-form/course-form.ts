import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Course, CoursePayload } from '../../../core/course.service';

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
  @Input() saving = false;
  @Output() save = new EventEmitter<CoursePayload>();
  @Output() cancel = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    code: [''],
    name: ['', [Validators.required, Validators.minLength(3)]],
    content: ['', [Validators.required, Validators.minLength(10)]],
    durationHours: [1, [Validators.required, Validators.min(1)]],
    instructor: ['', [Validators.required, Validators.minLength(2)]],
    schedule: ['', [Validators.required, Validators.minLength(3)]],
    approvalCriteria: ['', [Validators.required, Validators.minLength(3)]]
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
        approvalCriteria: course?.approvalCriteria ?? ''
      });
    }
  }

  fieldError(name: keyof typeof this.form.controls) {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    this.save.emit({
      code: value.code.trim() || undefined,
      name: value.name.trim(),
      content: value.content.trim(),
      durationHours: Number(value.durationHours),
      instructor: value.instructor.trim(),
      schedule: value.schedule.trim(),
      approvalCriteria: value.approvalCriteria.trim()
    });
  }
}
