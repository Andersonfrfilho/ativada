// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const REPOSITORY = 'src/price-alerts/price-alert.repository.ts';
const MIGRATION = 'drizzle/0017_price_alerts.sql';

function dropConstraint(name: string, statement: string): DatabaseMutant {
  return { name, edits: [{ file: MIGRATION, find: statement, replace: '' }] };
}

// Cada mutante quebra UMA regra do alerta de preço no banco; o juiz roda os checks no Postgres real.
const MUTANTS: readonly DatabaseMutant[] = [
  {
    name: 'FIND_WITHOUT_THE_OWNER',
    edits: [
      {
        file: REPOSITORY,
        find: 'return and(ownerCondition(scope, priceAlerts.userId), eq(priceAlerts.id, alertId));',
        replace: 'return eq(priceAlerts.id, alertId);',
      },
    ],
  },
  {
    name: 'LIST_WITHOUT_THE_OWNER',
    edits: [
      {
        file: REPOSITORY,
        find: '.where(and(ownerCondition(scope, priceAlerts.userId), isBeforeCursor(params.after)))',
        replace: '.where(isBeforeCursor(params.after))',
      },
    ],
  },
  {
    name: 'CEILING_COUNTS_EVERY_ALERT',
    edits: [
      {
        file: REPOSITORY,
        find: '.where(and(ownerCondition(scope, priceAlerts.userId), eq(priceAlerts.isEnabled, true)));',
        replace: '.where(ownerCondition(scope, priceAlerts.userId));',
      },
    ],
  },
  {
    name: 'CEILING_WITHOUT_THE_OWNER_LOCK',
    edits: [
      {
        file: REPOSITORY,
        find: "    .for('no key update');",
        replace: ';',
      },
    ],
  },
  {
    name: 'REARM_KEEPS_THE_TRIGGER',
    edits: [
      {
        file: REPOSITORY,
        find: '...(patch.isEnabled === true ? { triggeredAt: null } : {})',
        replace: '',
      },
    ],
  },
  {
    name: 'REARM_IGNORES_THE_CEILING',
    edits: [
      {
        file: REPOSITORY,
        find: 'if (isRearming && (await countEnabled(transaction, scope)) >= params.maxEnabled) {',
        replace: 'if (false) {',
      },
    ],
  },
  {
    name: 'DELETE_WITHOUT_THE_OWNER',
    edits: [
      {
        file: REPOSITORY,
        find: '.where(ownedAlert(scope, alertId))\n    .returning({ id: priceAlerts.id });',
        replace: '.where(eq(priceAlerts.id, alertId))\n    .returning({ id: priceAlerts.id });',
      },
    ],
  },
  dropConstraint(
    'NO_SYMBOL_CHECK',
    'CONSTRAINT "price_alerts_symbol_check" CHECK ("price_alerts"."symbol" ~ \'^[A-Z0-9]{2,16}USDT$\'),\n\t',
  ),
  dropConstraint(
    'NO_DIRECTION_CHECK',
    'CONSTRAINT "price_alerts_direction_check" CHECK ("price_alerts"."direction" in (\'above\', \'below\')),\n\t',
  ),
  dropConstraint(
    'NO_ORIGIN_CHECK',
    'CONSTRAINT "price_alerts_origin_check" CHECK ("price_alerts"."origin" in (\'manual\', \'plan\')),\n\t',
  ),
  dropConstraint(
    'NO_VALUE_CHECK',
    'CONSTRAINT "price_alerts_value_check" CHECK ("price_alerts"."value" > 0),\n\t',
  ),
  {
    name: 'TRIGGERED_AND_ENABLED_ALLOWED',
    edits: [
      {
        file: MIGRATION,
        find: ',\n\tCONSTRAINT "price_alerts_triggered_is_disabled_check" CHECK ("price_alerts"."triggered_at" is null or not "price_alerts"."is_enabled")',
        replace: '',
      },
    ],
  },
];

try {
  await runDatabaseMutantSuite({
    label: 'price-alert',
    judge: 'test-support/price-alert-test.ts',
    mutants: MUTANTS,
  });
} catch (error: unknown) {
  process.stderr.write(
    `price-alert-mutants: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
