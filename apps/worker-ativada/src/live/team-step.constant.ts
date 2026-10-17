// Copyright (c) 2026 Ada Technology. All rights reserved.

// Por que a vela ficou sem leitura da equipe (vai para `team_run_inputs.failure_code`, no máximo 48 caracteres).
// `MISSING` e `PENDING` vêm do pacote puro (`NO_READING_CODE`); o relatório que falhou leva o código da própria falha.
export const TEAM_NO_READING = {
  // O fechamento da vela não cai na grade do ritmo: nenhum relatório foi pedido.
  NOT_SCHEDULED: 'NOT_SCHEDULED',
  // Decidido depois do prazo: nunca aplicado.
  LATE: 'LATE',
  // A linha gravada não passa no esquema (corrompida): trata-se como sem leitura.
  UNREADABLE: 'UNREADABLE',
  UNKNOWN: 'UNKNOWN',
} as const;
