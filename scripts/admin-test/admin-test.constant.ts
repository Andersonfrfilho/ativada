// Copyright (c) 2026 Ada Technology. All rights reserved.
export const INVITATIONS_PATH = '/v1/admin/invitations';
export const ACCOUNTS_PATH = '/v1/admin/accounts';
export const ME_PATH = '/v1/me';
export const SESSION_PATH = '/v1/session';
export const TELEGRAM_LINK_PATH = '/v1/me/telegram-link';
export const TELEGRAM_WEBHOOK_PATH = '/v1/telegram/webhook';
export const WEBHOOK_SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

export const SESSION_CLIENT_ID = 'cryptoada-session';
export const REQUESTED_WITH_VALUE = 'fetch';
export const INVITEE_PREFIX = 'admin-test-';
export const INVITEE_PASSWORD = 'Invite-Test-Pass-2026!';
export const EXPECTED_LIFESPAN_SECONDS = 86_400;
export const EXPECTED_ACTIONS: readonly string[] = ['VERIFY_EMAIL', 'UPDATE_PASSWORD'];
export const PASSWORD_FIELD_MARKER = 'name="password-new"';
export const TEMPORARY_DATABASE_PREFIX = 'crypto_admin_';
export const MAIL_TIMEOUT_MILLISECONDS = 20_000;
export const MAIL_POLL_MILLISECONDS = 500;
export const OTP_SAFE_WINDOW_MILLISECONDS = 3_000;
