// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isIP } from 'node:net';

import { UNKNOWN_CLIENT_ADDRESS } from './rate-limit-policy.constant.js';

export type ResolveClientAddressParams = {
  readonly socketAddress: string | undefined;
  readonly forwardedFor: string | null;
  readonly trustedProxyHops: number;
};

export function resolveClientAddress(params: ResolveClientAddressParams): string {
  const socketAddress = params.socketAddress ?? UNKNOWN_CLIENT_ADDRESS;
  if (params.trustedProxyHops <= 0 || params.forwardedFor === null) return socketAddress;
  const hops = params.forwardedFor.split(',').map((hop) => hop.trim());
  const forwardedAddress = hops[hops.length - params.trustedProxyHops];
  if (forwardedAddress === undefined || isIP(forwardedAddress) === 0) return socketAddress;
  return forwardedAddress;
}
