import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService, SessionUser } from '../../core/session.service';
import { AccountDirectoryPage } from './account-directory-page';

describe('AccountDirectoryPage', () => {
  let fixture: ComponentFixture<AccountDirectoryPage>;
  let routeData: BehaviorSubject<{ directory: string }>;
  const users: SessionUser[] = [
    { id: '1', name: 'Ana Admin', email: 'admin@example.test', role: 'ADMIN', participantTypeId: null, participantTypeName: null },
    { id: '2', name: 'Luis Estudiante', email: 'luis@example.test', role: 'PARTICIPANT', participantTypeId: '1', participantTypeName: 'Estudiante' },
    { id: '3', name: 'Carla Instructora', email: 'carla@example.test', role: 'INSTRUCTOR', participantTypeId: null, participantTypeName: null, sis: '001234567', degree: 'Ingeniero', phone: '+591 700' }
  ];

  beforeEach(async () => {
    routeData = new BehaviorSubject({ directory: 'users' });
    await TestBed.configureTestingModule({
      imports: [AccountDirectoryPage],
      providers: [
        provideRouter([]),
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

  it('announces the created instructor from navigation state', () => {
    const previousState = history.state;
    history.replaceState({ instructorCreated: 'Carla' }, '');
    fixture.destroy();
    routeData.next({ directory: 'instructors' });
    fixture = TestBed.createComponent(AccountDirectoryPage); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Instructor Carla creado correctamente');
    history.replaceState(previousState, '');
  });

  it('filters the instructors directory by role and search term', () => {
    routeData.next({ directory: 'instructors' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Instructores');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Carla Instructora');
    expect(fixture.nativeElement.textContent).toContain('001234567');
    expect(fixture.nativeElement.textContent).toContain('+591 700');
    expect(Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('th'), header => header.textContent?.trim()))
      .toEqual(['Nombre', 'Correo', 'Código SIS', 'Teléfono']);

    const search = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    search.value = '001234567'; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    search.value = 'no existe';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('No hay cuentas para mostrar');
  });

  it.each(['001234567', '+591 700', '591700', 'carla@example.test', 'Carla'])('finds instructors by %s', term => {
    routeData.next({ directory: 'instructors' }); fixture.detectChanges();
    const search = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    search.value = term; search.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(search.placeholder).toBe('Nombre, correo, SIS o teléfono');
  });
});
