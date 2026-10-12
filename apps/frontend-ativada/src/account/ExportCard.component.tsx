// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ApiError } from '../http/api.error.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { ACCOUNT_ERROR_CODE } from './account.constant.js';
import { useExportMutation } from './account.query.js';

function describeFailure(error: Error): string {
  if (error instanceof ApiError && error.code === ACCOUNT_ERROR_CODE.RATE_LIMITED) {
    return 'Você já exportou há pouco. Tente de novo em até 1 hora.';
  }
  return 'Não foi possível exportar. Tente novamente.';
}

export function ExportCard(): ReactElement {
  const exportData = useExportMutation();

  return (
    <Card title="Exportar meus dados">
      <p className={controls.muted}>
        Baixe um arquivo com tudo o que o sistema guarda sobre você. É possível exportar uma vez por
        hora.
      </p>
      <button
        type="button"
        className={controls.button}
        disabled={exportData.isPending}
        onClick={() => exportData.mutate()}
      >
        Exportar meus dados
      </button>
      {exportData.isSuccess ? (
        <p role="status">Arquivo {exportData.data.fileName} baixado.</p>
      ) : null}
      {exportData.isError ? (
        <p role="alert" className={controls.error}>
          {describeFailure(exportData.error)}
        </p>
      ) : null}
    </Card>
  );
}
