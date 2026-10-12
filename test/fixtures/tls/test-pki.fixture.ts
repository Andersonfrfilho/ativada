// Copyright (c) 2026 Ada Technology. All rights reserved.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// PKI de teste gerada na hora com o `openssl` da máquina (nada de chave guardada no repositório): uma CA confiável, uma CA
// que NINGUÉM confia e certificados de servidor assinados por elas.
export type ServerCertificate = {
  readonly certificatePem: string;
  readonly keyPem: string;
  readonly derPath: string;
};

export type TestPki = {
  readonly trustedCaPem: string;
  readonly untrustedCaPem: string;
  readonly forHost: ServerCertificate;
  readonly forOtherHost: ServerCertificate;
  // Certificados assinados com SHA-384 e SHA-512 (o hash do `tls-server-end-point` acompanha o da assinatura).
  readonly signedWith384: ServerCertificate;
  readonly signedWith512: ServerCertificate;
  readonly openssl: (args: readonly string[]) => Promise<string>;
  readonly dispose: () => Promise<void>;
};

async function run(args: readonly string[], cwd: string): Promise<string> {
  const process = Bun.spawn(['openssl', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [output, error, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(`openssl ${args.slice(0, 2).join(' ')} falhou: ${error}`);
  return output;
}

async function createCa(directory: string, name: string): Promise<void> {
  await run(
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-keyout',
      `${name}.key`,
      '-out',
      `${name}.crt`,
      '-subj',
      `/CN=${name}`,
      '-days',
      '2',
    ],
    directory,
  );
}

async function createServerCertificate(
  directory: string,
  params: { readonly name: string; readonly san: string; readonly digest: string },
): Promise<ServerCertificate> {
  const { name } = params;
  await run(
    [
      'req',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-keyout',
      `${name}.key`,
      '-out',
      `${name}.csr`,
      '-subj',
      `/CN=${name}`,
    ],
    directory,
  );
  await Bun.write(join(directory, `${name}.cnf`), `subjectAltName=${params.san}\n`);
  await run(
    [
      'x509',
      '-req',
      '-in',
      `${name}.csr`,
      '-CA',
      'trusted.crt',
      '-CAkey',
      'trusted.key',
      '-CAcreateserial',
      '-out',
      `${name}.crt`,
      '-days',
      '2',
      `-${params.digest}`,
      '-extfile',
      `${name}.cnf`,
    ],
    directory,
  );
  await run(['x509', '-in', `${name}.crt`, '-outform', 'DER', '-out', `${name}.der`], directory);
  return {
    certificatePem: await readFile(join(directory, `${name}.crt`), 'utf8'),
    keyPem: await readFile(join(directory, `${name}.key`), 'utf8'),
    derPath: join(directory, `${name}.der`),
  };
}

export async function createTestPki(): Promise<TestPki> {
  const directory = await mkdtemp(join(tmpdir(), 'ativada-pki-'));
  await createCa(directory, 'trusted');
  await createCa(directory, 'untrusted');
  const host = 'IP:127.0.0.1,DNS:localhost';
  return {
    trustedCaPem: await readFile(join(directory, 'trusted.crt'), 'utf8'),
    untrustedCaPem: await readFile(join(directory, 'untrusted.crt'), 'utf8'),
    forHost: await createServerCertificate(directory, {
      name: 'host',
      san: host,
      digest: 'sha256',
    }),
    forOtherHost: await createServerCertificate(directory, {
      name: 'other',
      san: 'DNS:other.test',
      digest: 'sha256',
    }),
    signedWith384: await createServerCertificate(directory, {
      name: 'sha384',
      san: host,
      digest: 'sha384',
    }),
    signedWith512: await createServerCertificate(directory, {
      name: 'sha512',
      san: host,
      digest: 'sha512',
    }),
    openssl: (args) => run(args, directory),
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}
