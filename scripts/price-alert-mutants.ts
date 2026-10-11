// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runDatabaseMutantSuite, type DatabaseMutant } from './mutants/run-database-mutants.js';

const REPOSITORY = 'src/price-alerts/price-alert.repository.ts';
const MIGRATION = 'drizzle/0017_price_alerts.sql';
const EVALUATION = 'src/price-alerts/price-alert-evaluation.repository.ts';

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
  {
    name: 'CLEAR_FIRED_WITHOUT_THE_OWNER',
    edits: [
      {
        file: REPOSITORY,
        find: '.where(and(ownerCondition(scope, priceAlerts.userId), isNotNull(priceAlerts.triggeredAt)))',
        replace: '.where(isNotNull(priceAlerts.triggeredAt))',
      },
    ],
  },
  {
    name: 'CLEAR_FIRED_ALSO_DELETES_THE_ARMED',
    edits: [
      {
        file: REPOSITORY,
        find: '.where(and(ownerCondition(scope, priceAlerts.userId), isNotNull(priceAlerts.triggeredAt)))',
        replace: '.where(ownerCondition(scope, priceAlerts.userId))',
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
  {
    name: 'FIRE_ABOVE_IS_STRICT',
    edits: [
      {
        file: EVALUATION,
        find: 'sql`${priceAlerts.value} <= ${observed}`',
        replace: 'sql`${priceAlerts.value} < ${observed}`',
      },
    ],
  },
  {
    name: 'FIRE_BELOW_IS_STRICT',
    edits: [
      {
        file: EVALUATION,
        find: 'sql`${priceAlerts.value} >= ${observed}`',
        replace: 'sql`${priceAlerts.value} > ${observed}`',
      },
    ],
  },
  {
    name: 'FIRE_DIRECTIONS_SWAPPED',
    edits: [
      {
        file: EVALUATION,
        find: 'eq(priceAlerts.direction, PRICE_ALERT_DIRECTION.ABOVE),',
        replace: 'eq(priceAlerts.direction, PRICE_ALERT_DIRECTION.BELOW),',
      },
      {
        file: EVALUATION,
        find: 'eq(priceAlerts.direction, PRICE_ALERT_DIRECTION.BELOW),\n      sql`${priceAlerts.value} >=',
        replace:
          'eq(priceAlerts.direction, PRICE_ALERT_DIRECTION.ABOVE),\n      sql`${priceAlerts.value} >=',
      },
    ],
  },
  {
    name: 'FIRE_IGNORES_THE_PAIR',
    edits: [{ file: EVALUATION, find: 'eq(priceAlerts.symbol, params.symbol),', replace: '' }],
  },
  {
    name: 'FIRE_IGNORES_THE_ENABLED_FLAG',
    edits: [{ file: EVALUATION, find: 'eq(priceAlerts.isEnabled, true),', replace: '' }],
  },
  {
    name: 'FIRE_WITHOUT_THE_TRIGGER_STAMP',
    edits: [
      {
        file: EVALUATION,
        find: '.set({ isEnabled: false, triggeredAt: sql`now()` })',
        replace: '.set({ isEnabled: false })',
      },
    ],
  },
  {
    name: 'FIRE_WITHOUT_THE_ATOMIC_GUARD',
    edits: [
      {
        file: EVALUATION,
        find: 'eq(priceAlerts.isEnabled, true),\n          isNull(priceAlerts.triggeredAt),',
        replace: '',
      },
    ],
  },
  {
    name: 'OUTBOX_FOR_OWNERS_WITHOUT_TELEGRAM',
    edits: [
      {
        file: EVALUATION,
        find: 'if (!(await isTelegramDeliverable(transaction, userIdFromDatabase(row.userId)))) continue;',
        replace: '',
      },
    ],
  },
  {
    name: 'OUTBOX_PRICE_AND_THRESHOLD_SWAPPED',
    edits: [
      {
        file: EVALUATION,
        find: 'threshold: row.value,\n        price: params.price,',
        replace: 'threshold: params.price,\n        price: row.value,',
      },
    ],
  },
  {
    name: 'OUTBOX_KEYED_WITHOUT_THE_INSTANT',
    edits: [{ file: EVALUATION, find: 'candleTime: params.eventTime,', replace: 'candleTime: 0,' }],
  },
  {
    name: 'OWNER_LOOKUP_IGNORES_BLOCKED_ACCOUNTS',
    edits: [
      {
        file: EVALUATION,
        find: 'and(eq(priceAlerts.id, alertId), isNull(users.deletedAt), isNull(users.blockedAt))',
        replace: 'and(eq(priceAlerts.id, alertId), isNull(users.deletedAt))',
      },
    ],
  },
  {
    name: 'OWNER_LOOKUP_IGNORES_DELETED_ACCOUNTS',
    edits: [
      {
        file: EVALUATION,
        find: 'and(eq(priceAlerts.id, alertId), isNull(users.deletedAt), isNull(users.blockedAt))',
        replace: 'and(eq(priceAlerts.id, alertId), isNull(users.blockedAt))',
      },
    ],
  },
  {
    name: 'ALERTS_PRICE_WITH_A_RUN_ALLOWED',
    edits: [
      {
        file: 'drizzle/0018_alerts_price.sql',
        find: 'ALTER TABLE "alerts" ADD CONSTRAINT "alerts_price_has_no_run_check" CHECK (("alerts"."side" = \'PRICE\') = ("alerts"."run_id" is null));--> statement-breakpoint\n',
        replace: '',
      },
    ],
  },
  {
    name: 'ALERTS_SIGNAL_WITHOUT_A_RUN_ALLOWED',
    edits: [
      {
        file: 'drizzle/0018_alerts_price.sql',
        find: 'ALTER TABLE "alerts" ADD CONSTRAINT "alerts_price_alert_id_check" CHECK (("alerts"."side" = \'PRICE\') = ("alerts"."price_alert_id" is not null));--> statement-breakpoint\n',
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
