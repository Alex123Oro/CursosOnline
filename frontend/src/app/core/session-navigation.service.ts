import { computed, effect, inject, Injectable, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from './session.service';
import { profileHome } from './role.guard';

@Injectable({ providedIn: 'root' })
export class SessionNavigationService {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly home = computed(() => profileHome(this.session.currentUser()?.role));
  constructor() {
    let previousId: string | null = null;
    effect(() => {
      if (!this.session.ready()) return;
      const user = this.session.currentUser();
      const id = user?.id ?? '';
      if (previousId !== null && previousId !== id) {
        untracked(() => { void this.router.navigateByUrl(profileHome(user?.role)); });
      }
      previousId = id;
    });
  }
}
