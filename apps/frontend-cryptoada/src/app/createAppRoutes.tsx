// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RouteObject } from 'react-router';

import { AccountPage } from '../account/AccountPage.page.js';
import { AppShell } from '../layout/AppShell.component.js';
import { NotFoundPage } from '../layout/NotFoundPage.page.js';
import { RootLayout } from '../layout/RootLayout.component.js';
import { OverviewPage } from '../overview/OverviewPage.page.js';
import { AuthCallbackPage } from '../session/AuthCallbackPage.page.js';
import { LoginPage } from '../session/LoginPage.page.js';
import { RequireSession } from '../session/RequireSession.component.js';
import { ROUTE_PATH } from './app.constant.js';

// Toda rota nasce sob `RootLayout`, que traz o aviso de simulação; só o grupo interno exige sessão.
export function createAppRoutes(): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      children: [
        { path: ROUTE_PATH.LOGIN, element: <LoginPage /> },
        { path: ROUTE_PATH.AUTH_CALLBACK, element: <AuthCallbackPage /> },
        {
          element: <RequireSession />,
          children: [
            {
              element: <AppShell />,
              children: [
                { index: true, element: <OverviewPage /> },
                { path: ROUTE_PATH.ACCOUNT, element: <AccountPage /> },
              ],
            },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
