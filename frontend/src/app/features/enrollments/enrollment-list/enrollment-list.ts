import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, computed, input, signal } from '@angular/core';
import { Enrollment } from '../../../core/enrollment.service';

@Component({
  selector: 'app-enrollment-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './enrollment-list.html',
  styleUrl: './enrollment-list.scss'
})
export class EnrollmentList {
  readonly enrollments = input<Enrollment[]>([]);
  readonly loading = input(false);
  @Output() assignScholarship = new EventEmitter<Enrollment>();
  @Output() registerPayment = new EventEmitter<Enrollment>();
  @Output() confirmEnrollment = new EventEmitter<Enrollment>();

  readonly query = signal('');

  readonly filteredEnrollments = computed(() =>
    this.enrollments().filter(enrollment =>
      `${enrollment.participantName} ${enrollment.courseName} ${enrollment.courseCode} ${enrollment.participantTypeName}`
        .toLowerCase()
        .includes(this.query().toLowerCase())
    )
  );

  onSearch(value: string) {
    this.query.set(value);
  }
}
