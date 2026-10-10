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

const IPV6_VERSION = 6;
const IPV6_GROUP_COUNT = 8;
const IPV6_PREFIX_GROUPS = 4;
const IPV4_MAPPED_MARKER = 0xffff;
const IPV4_BYTE_MASK = 0xff;
const BITS_PER_BYTE = 8;

function parseIpv4Tail(tail: string): readonly string[] {
  const bytes = tail.split('.').map(Number);
  const [first = 0, second = 0, third = 0, fourth = 0] = bytes;
  return [
    ((first << BITS_PER_BYTE) | second).toString(16),
    ((third << BITS_PER_BYTE) | fourth).toString(16),
  ];
}

function expandIpv6(address: string): readonly number[] {
  const withoutZone = address.split('%')[0] ?? address;
  const lastColon = withoutZone.lastIndexOf(':');
  const tail = withoutZone.slice(lastColon + 1);
  const textual = tail.includes('.')
    ? `${withoutZone.slice(0, lastColon + 1)}${parseIpv4Tail(tail).join(':')}`
    : withoutZone;
  const [head = '', rest] = textual.split('::');
  const headGroups = head === '' ? [] : head.split(':');
  const restGroups = rest === undefined || rest === '' ? [] : rest.split(':');
  const missing = IPV6_GROUP_COUNT - headGroups.length - restGroups.length;
  const filler = rest === undefined ? [] : Array<string>(Math.max(0, missing)).fill('0');
  return [...headGroups, ...filler, ...restGroups].map((group) => Number.parseInt(group, 16));
}

function formatMappedIpv4(groups: readonly number[]): string | undefined {
  const isMapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === IPV4_MAPPED_MARKER;
  if (!isMapped) return undefined;
  const [high = 0, low = 0] = groups.slice(6);
  return [
    high >> BITS_PER_BYTE,
    high & IPV4_BYTE_MASK,
    low >> BITS_PER_BYTE,
    low & IPV4_BYTE_MASK,
  ].join('.');
}

// IPv6 de um mesmo /64 é um único cliente: o atacante varre os 2^64 endereços que o provedor lhe dá.
export function toRateLimitAddressKey(address: string): string {
  if (isIP(address) !== IPV6_VERSION) return address;
  const groups = expandIpv6(address);
  const mappedIpv4 = formatMappedIpv4(groups);
  if (mappedIpv4 !== undefined) return mappedIpv4;
  return `${groups
    .slice(0, IPV6_PREFIX_GROUPS)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}
