// Copyright (c) 2026 Ada Technology. All rights reserved.
export { createNoticeFeedRepository } from './notice-feed.repository.js';
export { NOTICE_FEED_SCOPE, NOTICE_SOURCE } from './notice-feed.types.js';
export type * from './notice-feed.types.js';
// O vocabulário gravado das ordens e das saídas, que o catálogo de frases do aviso lê.
export {
  EXIT_REASON,
  ORDER_REASON,
  ORDER_STATUS,
  ORDER_TYPE,
} from '../run-results/run-result.constant.js';
