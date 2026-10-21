// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { ROUTE_PATH } from '../app/app.constant.js';
import { Card } from '../layout/Card.component.js';
import { LiveSimulationsPanel } from '../overview/LiveSimulationsPanel.component.js';
import { useLiveSimulations } from '../overview/useLiveSimulations.hook.js';
import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';

// Onde ficam as simulações AO VIVO: a mesma lista da Visão geral (moeda, estado, resultado e link), sem o destaque.
export function LiveRunsPage(): ReactElement {
  const live = useLiveSimulations();
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Simulações ao vivo</h1>
      <p className={controls.muted}>
        Aqui estão as simulações que rodam agora, com dinheiro de mentira. Abra uma para ver o
        gráfico, a equipe de modelos e os avisos em tempo real.
      </p>
      {live.runs.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível carregar suas simulações. Tente novamente em instantes.
        </p>
      ) : null}
      {live.runs.isPending ? <p role="status">Carregando…</p> : null}
      {live.runs.isSuccess && live.simulations.length === 0 ? (
        <Card title="Nenhuma simulação ao vivo" icon="activity">
          <p>Nenhuma simulação ao vivo agora.</p>
          <Link to={ROUTE_PATH.GOALS} className={controls.textLink}>
            Iniciar uma a partir de uma meta
          </Link>
        </Card>
      ) : null}
      {live.simulations.length === 0 ? null : (
        <LiveSimulationsPanel {...live} featuredId={undefined} />
      )}
    </div>
  );
}
