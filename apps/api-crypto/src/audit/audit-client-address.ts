// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isIP } from 'node:net';

export function toAuditIp(clientAddress: string): string | undefined {
  return isIP(clientAddress) === 0 ? undefined : clientAddress;
}
