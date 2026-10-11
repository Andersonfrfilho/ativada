// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';

import { HTTP_STATUS } from '@cryptoada/environment';

import { ROUTE_PATH } from '../app/app.constant.js';
import { ApiError } from '../http/api.error.js';
import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';
import { ParameterEditor, type SavedVersion } from './ParameterEditor.component.js';
import { VersionsCard } from './VersionsCard.component.js';
import { WalkForwardCard } from './WalkForwardCard.component.js';
import { useStrategyQuery, useVersionsQuery } from './strategy.query.js';
import { shortHash, type StrategyDetail, type StrategyVersion } from './strategy.validation.js';

function LoadFailure({ error }: { readonly error: Error | null }): ReactElement {
  const isMissing = error instanceof ApiError && error.status === HTTP_STATUS.NOT_FOUND;
  return (
    <div className={runStyles.page}>
      <p role="alert" className={controls.error}>
        {isMissing ? 'Estratégia não encontrada.' : 'Não foi possível carregar a estratégia.'}
      </p>
      <Link to={ROUTE_PATH.STRATEGIES}>Voltar às estratégias</Link>
    </div>
  );
}

type DetailBodyProps = {
  readonly strategy: StrategyDetail;
  readonly versions: readonly StrategyVersion[];
};

function DetailBody({ strategy, versions }: DetailBodyProps): ReactElement {
  const [baseId, setBaseId] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<SavedVersion | undefined>(undefined);
  const latest = versions[0];
  const base = versions.find((version) => version.id === baseId) ?? latest;
  if (latest === undefined || base === undefined)
    return <p>Esta estratégia ainda não tem versão.</p>;
  return (
    <div className={runStyles.page}>
      <header>
        <h1 className={runStyles.title}>{strategy.name}</h1>
        <p className={runStyles.sub}>
          Versão atual: versão {latest.version} ·{' '}
          <span className={runStyles.num}>{shortHash(latest.configHash)}</span>
        </p>
      </header>
      <ParameterEditor
        key={base.id}
        strategyId={strategy.id}
        base={base}
        knownVersionIds={versions.map((version) => version.id)}
        saved={saved}
        onSaved={(result) => {
          setSaved(result);
          setBaseId(result.version.id);
        }}
      />
      <VersionsCard
        versions={versions}
        baseId={base.id}
        onUseAsBase={(versionId) => {
          setSaved(undefined);
          setBaseId(versionId);
        }}
      />
      <WalkForwardCard version={latest} />
    </div>
  );
}

export function StrategyDetailPage(): ReactElement {
  const { strategyId = '' } = useParams();
  const strategy = useStrategyQuery(strategyId);
  const versions = useVersionsQuery(strategyId);
  if (strategy.isError || versions.isError)
    return <LoadFailure error={strategy.error ?? versions.error} />;
  if (strategy.data === undefined || versions.data === undefined)
    return <p role="status">Carregando…</p>;
  return <DetailBody strategy={strategy.data} versions={versions.data} />;
}
