// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ENGINE_TIMEFRAME } from '@ativada/strategy-engine';

export const HORIZONS_PATH = '/v1/horizons';

export const HORIZON_DAILY_TIMEFRAME = ENGINE_TIMEFRAME.ONE_DAY;
export const HORIZON_INTRADAY_TIMEFRAME = ENGINE_TIMEFRAME.FIFTEEN_MINUTES;
// Duas voltas de calendário de janelas diárias; o aquecimento do indicador mais longo já cabe nelas.
export const HORIZON_DAILY_HISTORY_DAYS = 730;
// A linha de 15 minutos olha os últimos 90 dias (spec 003 RF03).
export const HORIZON_INTRADAY_DAYS = 90;
export const HORIZON_CACHE_MAX_ENTRIES = 500;
