// Copyright (c) 2026 Ada Technology. All rights reserved.

// tls-server-end-point (RFC 5929 §4.1): o hash do certificado DER do servidor, com o hash da própria assinatura do
// certificado (MD5 e SHA-1 viram SHA-256). Sem dependência: lê só o OID do `signatureAlgorithm` do DER.
const DER_SEQUENCE = 0x30;
const DER_OBJECT_IDENTIFIER = 0x06;
const DER_LONG_FORM_FLAG = 0x80;
const DER_LENGTH_MASK = 0x7f;
const MAXIMUM_LENGTH_BYTES = 4;

const SHA_256 = 'SHA-256';
const SHA_384 = 'SHA-384';
const SHA_512 = 'SHA-512';

const HASH_BY_SIGNATURE_OID: Readonly<Record<string, string>> = {
  '1.2.840.113549.1.1.4': SHA_256,
  '1.2.840.113549.1.1.5': SHA_256,
  '1.2.840.113549.1.1.11': SHA_256,
  '1.2.840.113549.1.1.12': SHA_384,
  '1.2.840.113549.1.1.13': SHA_512,
  '1.2.840.10045.4.1': SHA_256,
  '1.2.840.10045.4.3.2': SHA_256,
  '1.2.840.10045.4.3.3': SHA_384,
  '1.2.840.10045.4.3.4': SHA_512,
};

type DerHeader = { readonly tag: number; readonly start: number; readonly end: number };

function readHeader(der: Uint8Array, offset: number): DerHeader | undefined {
  const tag = der[offset];
  const first = der[offset + 1];
  if (tag === undefined || first === undefined) return undefined;
  let length = first;
  let start = offset + 2;
  if ((first & DER_LONG_FORM_FLAG) !== 0) {
    const count = first & DER_LENGTH_MASK;
    if (count < 1 || count > MAXIMUM_LENGTH_BYTES) return undefined;
    length = 0;
    for (let index = 0; index < count; index += 1)
      length = length * 256 + (der[start + index] ?? 0);
    start += count;
  }
  const end = start + length;
  return end > der.length ? undefined : { tag, start, end };
}

function decodeOid(bytes: Uint8Array): string {
  const first = bytes[0] ?? 0;
  const parts: number[] = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (const byte of bytes.slice(1)) {
    value = value * 128 + (byte & DER_LENGTH_MASK);
    if ((byte & DER_LONG_FORM_FLAG) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

// Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm SEQUENCE { OID, ... }, signature }
function readSignatureOid(der: Uint8Array): string | undefined {
  const certificate = readHeader(der, 0);
  if (certificate?.tag !== DER_SEQUENCE) return undefined;
  const tbs = readHeader(der, certificate.start);
  if (tbs?.tag !== DER_SEQUENCE) return undefined;
  const algorithm = readHeader(der, tbs.end);
  if (algorithm?.tag !== DER_SEQUENCE) return undefined;
  const oid = readHeader(der, algorithm.start);
  if (oid?.tag !== DER_OBJECT_IDENTIFIER) return undefined;
  return decodeOid(der.slice(oid.start, oid.end));
}

// `undefined` quando o certificado é ilegível ou a assinatura não tem hash que saibamos mapear: sem ligação ao canal.
export async function computeServerEndPointHash(
  certificate: Uint8Array,
): Promise<Uint8Array | undefined> {
  const oid = readSignatureOid(certificate);
  const algorithm = oid === undefined ? undefined : HASH_BY_SIGNATURE_OID[oid];
  if (algorithm === undefined) return undefined;
  return new Uint8Array(await crypto.subtle.digest(algorithm, new Uint8Array(certificate)));
}
