// Copyright (c) 2026 Ada Technology. All rights reserved.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { AGENT_LABEL } from './live72.constant.js';

const CAFFEINATE_PATH = '/usr/bin/caffeinate';
const CAFFEINATE_FLAGS = '-dimsu';
const RESTART_THROTTLE_SECONDS = 10;
const BASE_PATH = '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin';

export type LaunchAgentParams = {
  readonly bunPath: string;
  readonly envFile: string;
  readonly supervisorScript: string;
  readonly workingDirectory: string;
  readonly logsDirectory: string;
  readonly home: string;
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function stringEntry(key: string, value: string): string {
  return `  <key>${key}</key>\n  <string>${escapeXml(value)}</string>`;
}

export function agentPlistPath(home: string): string {
  return `${home}/Library/LaunchAgents/${AGENT_LABEL}.plist`;
}

// KeepAlive: o launchd sobe o supervisor de novo se ele morrer; RunAtLoad: volta sozinho no login.
export function buildLaunchAgentPlist(params: LaunchAgentParams): string {
  const programArguments = [
    CAFFEINATE_PATH,
    CAFFEINATE_FLAGS,
    params.bunPath,
    `--env-file=${params.envFile}`,
    'run',
    params.supervisorScript,
  ];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    stringEntry('Label', AGENT_LABEL),
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...programArguments.map((argument) => `    <string>${escapeXml(argument)}</string>`),
    '  </array>',
    stringEntry('WorkingDirectory', params.workingDirectory),
    '  <key>RunAtLoad</key>\n  <true/>',
    '  <key>KeepAlive</key>\n  <true/>',
    `  <key>ThrottleInterval</key>\n  <integer>${RESTART_THROTTLE_SECONDS}</integer>`,
    stringEntry('StandardOutPath', `${params.logsDirectory}/launchd.out.log`),
    stringEntry('StandardErrorPath', `${params.logsDirectory}/launchd.err.log`),
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    `    <key>PATH</key>\n    <string>${escapeXml(BASE_PATH)}</string>`,
    `    <key>HOME</key>\n    <string>${escapeXml(params.home)}</string>`,
    '  </dict>',
    '</dict>',
    '</plist>',
    '',
  ];
  return lines.join('\n');
}

async function launchctl(args: readonly string[]): Promise<number> {
  const child = Bun.spawn(['/bin/launchctl', ...args], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return child.exited;
}

function domain(): string {
  return `gui/${process.getuid?.() ?? 0}`;
}

export async function isAgentLoaded(): Promise<boolean> {
  return (await launchctl(['print', `${domain()}/${AGENT_LABEL}`])) === 0;
}

export async function installAgent(params: LaunchAgentParams): Promise<void> {
  const plistPath = agentPlistPath(params.home);
  mkdirSync(dirname(plistPath), { recursive: true });
  mkdirSync(params.logsDirectory, { recursive: true });
  writeFileSync(plistPath, buildLaunchAgentPlist(params));
  if (await isAgentLoaded()) return;
  const exitCode = await launchctl(['bootstrap', domain(), plistPath]);
  if (exitCode !== 0) throw new Error(`launchctl bootstrap falhou (código ${exitCode})`);
}

export async function removeAgent(home: string): Promise<void> {
  if (await isAgentLoaded()) await launchctl(['bootout', `${domain()}/${AGENT_LABEL}`]);
  const plistPath = agentPlistPath(home);
  if (existsSync(plistPath)) rmSync(plistPath);
}
