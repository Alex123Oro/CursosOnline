import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Course, CourseService } from './course.service';

describe('CourseService', () => {
  let service: CourseService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(CourseService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('requests one public course by id', () => {
    service.catalogById('42').subscribe();

    const request = httpTesting.expectOne('http://localhost:3000/api/courses/catalog/42');
    expect(request.request.method).toBe('GET');
    request.flush({} as Course);
  });
});
