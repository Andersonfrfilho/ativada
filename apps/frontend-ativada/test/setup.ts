// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach } from 'bun:test';

import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
