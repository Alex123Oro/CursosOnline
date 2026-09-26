import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ParticipantHeader } from './participant-header';

describe('ParticipantHeader', () => {
  let fixture: ComponentFixture<ParticipantHeader>;
  let component: ParticipantHeader;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantHeader],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(ParticipantHeader);
    component = fixture.componentInstance;
  });

  it('renders EVA branding, the catalogue link and the default label', async () => {
    await fixture.whenStable();

    const header = fixture.nativeElement as HTMLElement;
    const brand = header.querySelector<HTMLAnchorElement>('.catalog-brand');
    expect(brand?.getAttribute('href')).toBe('/catalogo');
    expect(header.textContent).toContain('EVA');
    expect(header.textContent).toContain('Formación continua');
  });

  it('renders a custom label', async () => {
    fixture.componentRef.setInput('label', 'Aprendizaje profesional');

    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aprendizaje profesional');
  });
});
