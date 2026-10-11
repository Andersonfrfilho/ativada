// Copyright (c) 2026 Ada Technology. All rights reserved.

function derLength(length: number): number[] {
  return length < 0x80 ? [length] : [0x81, length];
}

function der(tag: number, content: readonly number[]): number[] {
  return [tag, ...derLength(content.length), ...content];
}

export const OID_SHA256_WITH_RSA = '2a864886f70d01010b';
export const OID_ED25519 = '2b6570';

// Certificate ::= SEQUENCE { tbsCertificate SEQUENCE, signatureAlgorithm SEQUENCE { OID, NULL }, signature BIT STRING }:
// o bastante do DER para o `tls-server-end-point` ler o algoritmo da assinatura, sem gerar certificado de verdade.
export function syntheticCertificate(oidHex: string, serial = 1): Uint8Array {
  const oid = [...Buffer.from(oidHex, 'hex')];
  const tbs = der(0x30, [0x02, 0x01, serial]);
  const algorithm = der(0x30, [...der(0x06, oid), 0x05, 0x00]);
  const signature = der(0x03, [0x00, 0xde, 0xad]);
  return Uint8Array.from(der(0x30, [...tbs, ...algorithm, ...signature]));
}
