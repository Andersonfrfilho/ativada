// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RouteObject } from 'react-router';

import { BacktestDetailPage } from '../backtests/BacktestDetailPage.page.js';
import { BacktestsPage } from '../backtests/BacktestsPage.page.js';
import { ComparePage } from '../backtests/ComparePage.page.js';
import { StrategiesPage } from '../strategies/StrategiesPage.page.js';
import { StrategyDetailPage } from '../strategies/StrategyDetailPage.page.js';
import { AccountPage } from '../account/AccountPage.page.js';
import { AlertsPage } from '../alerts/AlertsPage.page.js';
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
                { path: ROUTE_PATH.BACKTESTS, element: <BacktestsPage /> },
                { path: ROUTE_PATH.BACKTEST_COMPARE, element: <ComparePage /> },
                { path: ROUTE_PATH.BACKTEST, element: <BacktestDetailPage /> },
                { path: ROUTE_PATH.STRATEGIES, element: <StrategiesPage /> },
                { path: ROUTE_PATH.STRATEGY, element: <StrategyDetailPage /> },
                { path: ROUTE_PATH.ALERTS, element: <AlertsPage /> },
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
