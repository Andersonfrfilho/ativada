// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { SimulationNotice } from './SimulationNotice.component.js';

// Tudo o que é rota passa por aqui, então o aviso de simulação nunca some (login, retorno, 404 e telas internas).
export function RootLayout(): ReactElement {
  return (
    <>
      <SimulationNotice />
      <Outlet />
    </>
  );
}
