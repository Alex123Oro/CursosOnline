import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Course, CourseService } from '../../../core/course.service';
import { ParticipantHeader } from '../shared/participant-header/participant-header';
import { shortCourseDate } from '../shared/course-presentation';

@Component({
  selector: 'app-participant-catalog-page',
  standalone: true,
  imports: [RouterLink, ParticipantHeader],
  templateUrl: './participant-catalog-page.html',
  styleUrls: ['./catalog-hero.scss', './catalog-cards.scss', './participant-catalog-page.scss']
})
export class ParticipantCatalogPage {
  readonly shortDate = shortCourseDate;
  startingPrice(course: Course): number | null {
    return course.prices.length ? Math.min(...course.prices.map(price => price.basePrice)) : null;
  }
  private readonly courseService = inject(CourseService);
  readonly query = signal('');
  readonly onlyAvailable = signal(false);
  readonly onlyFree = signal(false);
  readonly duration = signal('all');
  readonly instructor = signal('all');
  readonly sort = signal('recent');
  readonly filtersOpen = signal(false);
  readonly failedCovers = signal(new Set<string>());
  hasCover(course: Course) { return !!course.coverUrl && !this.failedCovers().has(course.coverUrl); }
  coverFailed(url: string) { this.failedCovers.update(failed => new Set([...failed, url])); }
  readonly page = signal(1);
  readonly pageSize = 12;
  readonly courses = signal<Course[]>([]);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly instructors = computed(() => [...new Set(this.courses().map(course => course.instructor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')));
  readonly activeFilterCount = computed(() => Number(this.onlyAvailable()) + Number(this.onlyFree()) + Number(this.duration() !== 'all') + Number(this.instructor() !== 'all'));
  readonly filteredCourses = computed(() => {
    const term = this.normalize(this.query().trim());
    const courses = this.courses().filter(course => {
      const searchableCourse = this.normalize(`${course.name} ${course.code} ${course.instructor}`);
      return (!term || searchableCourse.includes(term))
        && (!this.onlyAvailable() || this.isOpen(course))
        && (!this.onlyFree() || this.startingPrice(course) === 0)
        && (this.instructor() === 'all' || course.instructor === this.instructor())
        && (this.duration() === 'all' || (this.duration() === 'short' ? course.durationHours > 0 && course.durationHours <= 20 : course.durationHours > 20));
    });
    return courses.sort((a, b) => this.sort() === 'name' ? a.name.localeCompare(b.name, 'es')
      : this.sort() === 'price' ? (this.startingPrice(a) ?? Infinity) - (this.startingPrice(b) ?? Infinity)
      : b.createdAt.localeCompare(a.createdAt));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredCourses().length / this.pageSize)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  readonly visibleCourses = computed(() => this.filteredCourses().slice((this.currentPage() - 1) * this.pageSize, this.currentPage() * this.pageSize));
  readonly firstResult = computed(() => this.filteredCourses().length ? (this.currentPage() - 1) * this.pageSize + 1 : 0);
  readonly lastResult = computed(() => Math.min(this.currentPage() * this.pageSize, this.filteredCourses().length));
  readonly pageNumbers = computed(() => Array.from({ length: this.pageCount() }, (_, index) => index + 1));
  private readonly today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/La_Paz' }).format(new Date());

  private normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(); }
  isOpen(course: Course) {
    return course.remainingSlots !== 0 && !!course.preinscriptionStart && !!course.preinscriptionEnd
      && course.preinscriptionStart <= this.today && course.preinscriptionEnd >= this.today;
  }
  artwork(course: Course): string {
    const name = this.normalize(course.name);
    if (/sql|datos|excel/.test(name)) return 'data';
    if (/javascript|python|web|programacion|git/.test(name)) return 'code';
    if (/seguridad|redes|linux/.test(name)) return 'systems';
    return ['learning', 'sand', 'coral', 'sky'][[...course.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4];
  }
  coverLabel(course: Course): string {
    const name = this.normalize(course.name);
    return /sql/.test(name) ? 'SQL' : /python/.test(name) ? 'Py' : /javascript/.test(name) ? 'JS'
      : /excel/.test(name) ? 'XLS' : /git/.test(name) ? 'git' : /web/.test(name) ? '</>' : '';
  }

  constructor() {
    this.courseService.catalog().subscribe({
      next: courses => {
        this.courses.set(courses);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      }
    });
  }

  onSearch(value: string) { this.query.set(value); this.page.set(1); }
  setFilter(filter: 'available' | 'free', value: boolean) {
    (filter === 'available' ? this.onlyAvailable : this.onlyFree).set(value); this.page.set(1);
  }
  setDuration(value: string) { this.duration.set(value); this.page.set(1); }
  setInstructor(value: string) { this.instructor.set(value); this.page.set(1); }
  setSort(value: string) { this.sort.set(value); this.page.set(1); }
  scrollTo(id: string) {
    const target = document.getElementById(id);
    target?.scrollIntoView?.({ block: 'start' });
    target?.focus({ preventScroll: true });
  }
  changePage(value: number) {
    this.page.set(Math.max(1, Math.min(value, this.pageCount())));
    this.scrollTo('results-title');
  }
  clearFilters() {
    this.query.set(''); this.onlyAvailable.set(false); this.onlyFree.set(false);
    this.duration.set('all'); this.instructor.set('all'); this.page.set(1);
  }
}
