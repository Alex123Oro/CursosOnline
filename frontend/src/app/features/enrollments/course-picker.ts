import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { EnrollmentCourseSummary } from '../../core/enrollment.service';
import { EnrollmentStatus } from '../../core/course.service';

@Component({
  selector: 'app-enrollment-course-picker',
  template: ` <div class="picker" (focusout)="leave($event)">
    <label for="enrollment-course">Curso</label>
    <div class="input-row">
      <input
        id="enrollment-course"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="course-options"
        [attr.aria-expanded]="open()"
        [attr.aria-activedescendant]="
          open() && filtered()[active()] ? 'course-option-' + filtered()[active()].id : null
        "
        autocomplete="off"
        placeholder="Busca por nombre o código y selecciona un curso"
        [value]="open() ? query() : selectedLabel()"
        (focus)="show()"
        (input)="type($any($event.target).value)"
        (keydown)="key($event)"
      />
      @if (value()) {
        <button type="button" aria-label="Limpiar curso seleccionado" (click)="clear()">×</button>
      }
      <button type="button" aria-label="Mostrar cursos" (click)="open() ? open.set(false) : show()">
        ⌄
      </button>
    </div>
    @if (open()) {
      <ul id="course-options" role="listbox" aria-label="Cursos disponibles">
        @for (course of filtered(); track course.id; let index = $index) {
          <li
            role="option"
            [id]="'course-option-' + course.id"
            [attr.aria-selected]="course.id === value()"
            [class.active]="index === active()"
            (mousedown)="$event.preventDefault()"
            (click)="choose(course.id)"
          >
            <div>
              <strong>{{ course.name }}</strong
              ><small
                >{{ course.code || 'Sin código'
                }}{{ course.status === 'DRAFT' ? ' · Borrador' : '' }}</small
              >
            </div>
            <span>{{
              status() === 'INSCRITO' ? course.enrolledCount : course.preenrolledCount
            }}</span>
          </li>
        } @empty {
          <li class="empty" role="presentation">No hay cursos que coincidan con la búsqueda.</li>
        }
      </ul>
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
      }
      .picker {
        position: relative;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 700;
        color: #174b48;
      }
      .input-row {
        display: flex;
        border: 1px solid #a9c0b9;
        border-radius: 8px;
        background: #fff;
      }
      .input-row:focus-within {
        outline: 3px solid #b4dcd3;
        outline-offset: 2px;
      }
      input {
        flex: 1;
        min-width: 0;
        padding: 12px;
        border: 0;
        border-radius: 8px;
        font: inherit;
        font-size: 16px;
        color: #174b48;
        background: transparent;
        outline: 0;
      }
      button {
        min-width: 44px;
        min-height: 46px;
        border: 0;
        background: transparent;
        color: #17645e;
        font-size: 22px;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 3px solid #087f78;
      }
      ul {
        position: absolute;
        inset: auto 0 auto;
        z-index: 4;
        max-height: 300px;
        overflow: auto;
        margin: 8px 0 0;
        padding: 6px;
        list-style: none;
        border: 1px solid #b9d3cb;
        border-radius: 10px;
        background: #fff;
        box-shadow: 0 12px 30px #174b4820;
      }
      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px;
        border-radius: 6px;
        color: #174b48;
        cursor: pointer;
      }
      li.active,
      li:hover {
        background: #eaf5f2;
      }
      li[aria-selected='true'] {
        box-shadow: inset 3px 0 #087f78;
      }
      li strong {
        font-size: 14px;
      }
      li small {
        display: block;
        margin-top: 5px;
        color: #526d68;
        font-size: 12px;
      }
      li span {
        padding: 5px 9px;
        border-radius: 20px;
        background: #eaf5f2;
        font-weight: 700;
        font-size: 13px;
      }
      .empty {
        font-size: 14px;
        cursor: default;
      }
    `,
  ],
})
export class EnrollmentCoursePicker {
  readonly courses = input<EnrollmentCourseSummary[]>([]);
  readonly value = input('');
  readonly status = input<EnrollmentStatus>('PREINSCRITO');
  readonly changeCourse = output<string>();
  readonly open = signal(false);
  readonly query = signal('');
  readonly active = signal(0);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly selectedLabel = computed(() => {
    const course = this.courses().find((course) => course.id === this.value());
    return course ? `${course.name}${course.code ? ' · ' + course.code : ''}` : '';
  });
  readonly filtered = computed(() => {
    const normalize = (text: string) =>
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const search = normalize(this.query().trim());
    return this.courses().filter((course) =>
      normalize(course.name + ' ' + course.code).includes(search)
    );
  });
  constructor() {
    afterRenderEffect(() => {
      this.active();
      if (this.open())
        this.element.nativeElement.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' });
    });
  }
  show() {
    this.query.set('');
    this.active.set(0);
    this.open.set(true);
  }
  type(text: string) {
    this.query.set(text);
    this.active.set(0);
    this.open.set(true);
  }
  clear() {
    this.changeCourse.emit('');
    this.query.set('');
    this.open.set(false);
  }
  choose(id: string) {
    this.changeCourse.emit(id);
    this.open.set(false);
  }
  leave(event: FocusEvent) {
    if (!this.element.nativeElement.contains(event.relatedTarget as Node | null))
      this.open.set(false);
  }
  key(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.open.set(false);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) {
        this.show();
        return;
      }
      const size = this.filtered().length;
      this.active.set(
        size ? (this.active() + (event.key === 'ArrowDown' ? 1 : -1) + size) % size : 0
      );
    } else if (event.key === 'Enter' && this.open()) {
      event.preventDefault();
      const course = this.filtered()[this.active()];
      if (course) this.choose(course.id);
    }
  }
}
