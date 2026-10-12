import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService, SessionUser } from '../../core/session.service';
import { AccountDirectoryPage } from './account-directory-page';

describe('AccountDirectoryPage', () => {
  let fixture: ComponentFixture<AccountDirectoryPage>;
  let routeData: BehaviorSubject<{ directory: string }>;
  const users: SessionUser[] = [
    { id: '1', name: 'Ana Admin', email: 'admin@example.test', role: 'ADMIN', participantTypeId: null, participantTypeName: null },
    { id: '2', name: 'Luis Estudiante', email: 'luis@example.test', role: 'PARTICIPANT', participantTypeId: '1', participantTypeName: 'Estudiante' },
    { id: '3', name: 'Carla Instructora', email: 'carla@example.test', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null }
  ];

  beforeEach(async () => {
    routeData = new BehaviorSubject({ directory: 'users' });
    await TestBed.configureTestingModule({
      imports: [AccountDirectoryPage],
      providers: [
        { provide: ActivatedRoute, useValue: { data: routeData } },
        { provide: SessionService, useValue: { users: () => users, ready: () => true } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AccountDirectoryPage);
    fixture.detectChanges();
  });

  it('lists every account in the users directory', () => {
    expect(fixture.nativeElement.textContent).toContain('Usuarios');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('filters the instructors directory by role and search term', () => {
    routeData.next({ directory: 'instructors' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Instructores');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Carla Instructora');

    const search = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    search.value = 'no existe';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('No hay cuentas para mostrar');
  });
});