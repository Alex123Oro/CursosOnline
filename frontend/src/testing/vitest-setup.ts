import { afterEach, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

beforeEach(() => localStorage.clear());
afterEach(() => TestBed.resetTestingModule());
