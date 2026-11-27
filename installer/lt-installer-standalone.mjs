#!/usr/bin/env node
/**
 * Self-contained, zero-dependency One-Click Graphical Installer for `dsh-leaderteam-releases` (Closed-Source Free Track)
 * and `dsh-leaderteam` (Open-Source Track).
 *
 * Runs standalone without requiring any sibling `leaderteam/` source folder (Apache-2.0):
 * - Automatically discovers Official DeepSeek Harness Desktop across custom Windows paths (`D:\Apps\DeepSeek-Harness`),
 *   Windows Registry Uninstall keys (`HKCU`, `HKLM`, `WOW6432Node`), `DSH_DESKTOP_DIR` / `DSH_APP_DIR` env vars,
 *   drive letters `C:`..`Z:`, and running `DeepSeek Harness.exe` processes;
 * - Provides a visible manual custom DSH path input + Rescan button and local `.tgz` upload/path installation in Web UI;
 * - Checks running `DeepSeek Harness.exe` lock with clear friendly Chinese guidance before running `dsh plugin add`;
 * - Sanitizes `~/.dsh/profiles/desktop/cordis.patch.yml` post-install (removing stale manual `leaderteam-*` `- insert:` rows
 *   while preserving provider/model patches and ensuring `- id: tool-web` `config: {fetch: true, searchTimeoutMs: 60000}`).
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const LEGACY_PATCH_BEGIN = '# >>> leaderteam (managed by scripts/install-desktop.ps1; do not edit inside)';
const LEGACY_PATCH_END = '# <<< leaderteam';

export const TRACKS = Object.freeze({
  'closed-free': {
    id: 'closed-free',
    label: '闭源免费公开发行版 (V2.3+)',
    repo: 'youzi-ovo-create/dsh-leaderteam-releases',
    apiUrl: 'https://api.github.com/repos/youzi-ovo-create/dsh-leaderteam-releases/releases?per_page=30',
  },
  'open-source': {
    id: 'open-source',
    label: '开源维护版 (Apache-2.0)',
    repo: 'youzi-ovo-create/dsh-leaderteam',
    apiUrl: 'https://api.github.com/repos/youzi-ovo-create/dsh-leaderteam/releases?per_page=30',
  },
});

export function parsePlatformReleaseTag(rawTag) {
  const trimmed = String(rawTag ?? '').trim();
  const m = /^(?:(windows|win32|linux|darwin|macos)-)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/i.exec(trimmed);
  if (!m) return null;
  const rawPlat = m[1] ? m[1].toLowerCase() : null;
  let releasePlatform = 'universal';
  if (rawPlat === 'windows' || rawPlat === 'win32') releasePlatform = 'win32';
  else if (rawPlat === 'linux') releasePlatform = 'linux';
  else if (rawPlat === 'darwin' || rawPlat === 'macos') releasePlatform = 'darwin';
  const version = m[2];
  if (!parseSemver(version)) return null;
  return { releasePlatform, version };
}

export function selectBestPlatformRelease(releases, targetPlatform = process.platform) {
  const candidates = [];
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!r || r.draft || r.prerelease || !Array.isArray(r.assets)) continue;
    if (!r.assets.some(a => typeof a?.name === 'string' && a.name.endsWith('.tgz'))) continue;
    const parsedTag = parsePlatformReleaseTag(r.tag_name);
    if (!parsedTag) continue;
    if (parsedTag.releasePlatform !== 'universal' && parsedTag.releasePlatform !== targetPlatform) continue;
    candidates.push({ rel: r, ...parsedTag });
  }
  candidates.sort((a, b) => {
    const cmp = compareSemver(b.version, a.version);
    if (cmp !== 0) return cmp;
    const aExact = a.releasePlatform === targetPlatform ? 1 : 0;
    const bExact = b.releasePlatform === targetPlatform ? 1 : 0;
    return bExact - aExact;
  });
  return candidates[0]?.rel ?? null;
}

export const VERIFIED_DSH_VERSIONS = [
  '0.2.2-alpha.2', '0.2.2-alpha.3',
  '0.2.2-rc.1', '0.2.2-rc.2', '0.2.2-rc.3', '0.2.2-rc.4', '0.2.2-rc.5',
  '0.2.3-alpha.1', '0.2.3-alpha.2',
];

const WINDOWS_UNINSTALL_REGISTRY_ROOTS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

const WINDOWS_DRIVE_SUBPATHS = [
  ['Apps', 'DeepSeek-Harness'],
  ['Apps', 'DeepSeek Harness'],
  ['Program Files', 'DeepSeek Harness'],
  ['Program Files', 'DeepSeek-Harness'],
  ['DeepSeek-Harness'],
  ['DeepSeek Harness'],
  ['Programs', 'DeepSeek-Harness'],
  ['Programs', 'DeepSeek Harness'],
];

function parseSemver(raw) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(raw || '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split('.') : [] };
}

function compareSemver(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    if (i >= pa.pre.length) return -1;
    if (i >= pb.pre.length) return 1;
    const ai = pa.pre[i], bi = pb.pre[i];
    if (ai === bi) continue;
    const an = /^\d+$/.test(ai), bn = /^\d+$/.test(bi);
    if (an && bn) return Number(ai) < Number(bi) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;
    return ai < bi ? -1 : 1;
  }
  return 0;
}

export function isCompatibleDshVersion(ver) {
  if (!parseSemver(ver)) return false;
  return compareSemver(ver, '0.2.2-alpha.2') >= 0 && compareSemver(ver, '1.0.0-0') < 0;
}

function satisfiesStandaloneRange(version, range) {
  if (!parseSemver(version) || !range) return false;
  return String(range)
    .split('||')
    .map(s => s.trim())
    .filter(Boolean)
    .some(branch =>
      branch
        .split(/\s+/)
        .filter(Boolean)
        .every(tok => {
          if (tok === '*') return true;
          const m = /^(>=|<=|>|<|=)?(.+)$/.exec(tok);
          if (!m) return false;
          const op = m[1] || '=';
          let target = m[2].trim();
          if (op === '<' && !target.includes('-')) target = `${target}-0`;
          if (!parseSemver(target)) return false;
          const cmp = compareSemver(version, target);
          if (op === '=') return cmp === 0;
          if (op === '>') return cmp > 0;
          if (op === '>=') return cmp >= 0;
          if (op === '<') return cmp < 0;
          if (op === '<=') return cmp <= 0;
          return false;
        }),
    );
}

function normalizeWindowsDirCandidate(rawVal) {
  let s = String(rawVal ?? '').trim();
  if (!s) return null;
  s = s.replace(/,\s*-?\d+\s*$/, '').trim();
  if (s.startsWith('"')) {
    const endQuote = s.indexOf('"', 1);
    if (endQuote > 1) s = s.slice(1, endQuote).trim();
    else s = s.replace(/^"+|"+$/g, '').trim();
  } else {
    const exeMatch = /^([A-Za-z]:\\.+?\.(?:exe|ico))(?:\s+.*)?$/i.exec(s);
    if (exeMatch) s = exeMatch[1].trim();
  }
  s = s.replace(/[\\/]+$/, '');
  if (!/^[A-Za-z]:\\/.test(s) && !s.startsWith('\\\\')) return null;
  if (/\\system32\\msiexec(?:\.exe)?$/i.test(s)) return null;
  if (/\.(?:exe|ico|cmd|bat)$/i.test(s)) {
    return path.win32.dirname(s);
  }
  return s;
}

export function parseWindowsUninstallRegistryOutput(rawText) {
  const dirs = [];
  const matchedSubkeys = [];
  let currentSubkey = null;
  let currentDisplayName = '';
  let currentBlockDirs = [];

  const flushBlock = () => {
    if (!currentSubkey) return;
    const isLegacyDataElem = /\bdsh\s+desktop\b/i.test(currentDisplayName) && !/deepseek[-\s]*harness/i.test(currentDisplayName);
    if (!isLegacyDataElem) {
      for (const d of currentBlockDirs) {
        if (d && !dirs.includes(d)) dirs.push(d);
      }
      if (!matchedSubkeys.includes(currentSubkey)) matchedSubkeys.push(currentSubkey);
    }
    currentSubkey = null;
    currentDisplayName = '';
    currentBlockDirs = [];
  };

  for (const rawLine of String(rawText ?? '').split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^End of search:/i.test(trimmed)) continue;
    if (/^HKEY_(?:CURRENT_USER|LOCAL_MACHINE|USERS|CLASSES_ROOT)\\/i.test(trimmed)) {
      flushBlock();
      currentSubkey = trimmed;
      continue;
    }
    const valMatch = /^([A-Za-z0-9_]+)\s+REG_(?:EXPAND_)?SZ\s+(.+)$/i.exec(trimmed);
    if (!valMatch) continue;
    const [, keyName, rawVal] = valMatch;
    const lowerKey = keyName.toLowerCase();
    if (lowerKey === 'displayname') {
      currentDisplayName = rawVal.trim();
      continue;
    }
    if (
      lowerKey === 'installlocation' ||
      lowerKey === 'displayicon' ||
      lowerKey === 'uninstallstring' ||
      lowerKey === 'quietuninstallstring' ||
      lowerKey === 'apppath'
    ) {
      const cand = normalizeWindowsDirCandidate(rawVal);
      if (cand) {
        if (currentSubkey) currentBlockDirs.push(cand);
        else if (!dirs.includes(cand)) dirs.push(cand);
      }
    }
  }
  flushBlock();
  return { dirs, matchedSubkeys };
}

export function isOfficialDesktopProcessRunning(platform = process.platform, spawnSyncImpl = spawnSync) {
  try {
    if (platform === 'win32') {
      const res = spawnSyncImpl('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe', '/NH'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 4000,
      });
      return String(res?.stdout || '').toLowerCase().includes('deepseek harness.exe');
    }
  } catch {}
  return false;
}

export function discoverWindowsDesktopCandidates({
  env = process.env,
  fsImpl = fs,
  spawnSyncImpl = spawnSync,
  driveLetters = null,
} = {}) {
  const candidates = [];
  const addCandidate = raw => {
    if (!raw || typeof raw !== 'string') return;
    const trimmed = raw.trim().replace(/^"+|"+$/g, '');
    if (!trimmed) return;
    const dir = /\.(?:exe|cmd|bat)$/i.test(trimmed) ? path.dirname(trimmed) : trimmed;
    const resolved = /^[A-Za-z]:[\\/]/.test(dir) ? path.win32.normalize(dir) : path.resolve(dir);
    if (!candidates.includes(resolved)) candidates.push(resolved);
  };

  for (const envKey of ['DSH_DESKTOP_DIR', 'DSH_APP_DIR', 'LT_DSH_APP']) {
    if (env?.[envKey]) addCandidate(env[envKey]);
  }
  if (env?.LOCALAPPDATA) {
    addCandidate(path.join(env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness'));
    addCandidate(path.join(env.LOCALAPPDATA, 'Programs', 'DeepSeek-Harness'));
  }
  if (env?.PROGRAMFILES || env?.ProgramFiles) {
    const pf = env.PROGRAMFILES || env.ProgramFiles;
    addCandidate(path.join(pf, 'DeepSeek Harness'));
    addCandidate(path.join(pf, 'DeepSeek-Harness'));
  }
  if (env?.['ProgramFiles(x86)']) {
    addCandidate(path.join(env['ProgramFiles(x86)'], 'DeepSeek Harness'));
    addCandidate(path.join(env['ProgramFiles(x86)'], 'DeepSeek-Harness'));
  }

  const letters = Array.isArray(driveLetters)
    ? driveLetters.map(l => String(l).replace(/:.*$/, '').toUpperCase())
    : Array.from({ length: 24 }, (_, idx) => String.fromCharCode(67 + idx)); // C..Z

  for (const letter of letters) {
    const driveRoot = `${letter}:\\`;
    let rootExists = false;
    try { rootExists = fsImpl.existsSync(driveRoot); } catch { rootExists = false; }
    if (!rootExists) continue;
    for (const segs of WINDOWS_DRIVE_SUBPATHS) {
      addCandidate(path.win32.join(driveRoot, ...segs));
    }
  }

  if (typeof spawnSyncImpl === 'function') {
    const subkeysToExpand = new Set();
    for (const regRoot of WINDOWS_UNINSTALL_REGISTRY_ROOTS) {
      for (const term of ['DeepSeek Harness', 'DeepSeek-Harness']) {
        try {
          const res = spawnSyncImpl('reg.exe', ['query', regRoot, '/s', '/f', term], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 3500,
          });
          if (res?.stdout) {
            const parsed = parseWindowsUninstallRegistryOutput(res.stdout);
            for (const d of parsed.dirs) addCandidate(d);
            for (const sk of parsed.matchedSubkeys) subkeysToExpand.add(sk);
          }
        } catch {}
      }
    }
    for (const subkey of subkeysToExpand) {
      try {
        const fullRes = spawnSyncImpl('reg.exe', ['query', subkey], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 2500,
        });
        if (fullRes?.stdout) {
          const parsed = parseWindowsUninstallRegistryOutput(fullRes.stdout);
          for (const d of parsed.dirs) addCandidate(d);
        }
      } catch {}
    }

    if (isOfficialDesktopProcessRunning('win32', spawnSyncImpl)) {
      try {
        const psRes = spawnSyncImpl(
          'powershell.exe',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            "(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique)",
          ],
          { encoding: 'utf8', windowsHide: true, timeout: 4000 },
        );
        for (const line of String(psRes?.stdout || '').split(/\r?\n/)) {
          if (line.trim()) addCandidate(line.trim());
        }
      } catch {}
    }
  }

  return candidates;
}

function readAsarFile(asarPath, relPosix, fsImpl = fs) {
  let fd;
  try {
    fd = fsImpl.openSync(asarPath, 'r');
    const pre = Buffer.alloc(16);
    if (fsImpl.readSync(fd, pre, 0, 16, 0) < 16) return null;
    const pickleLen = pre.readUInt32LE(4);
    const jsonLen = pre.readUInt32LE(12);
    if (jsonLen < 2 || jsonLen > 32 * 1024 * 1024) return null;
    const jb = Buffer.alloc(jsonLen);
    fsImpl.readSync(fd, jb, 0, jsonLen, 16);
    let cur = JSON.parse(jb.toString('utf8'));
    for (const seg of relPosix.split('/').filter(Boolean)) cur = cur?.files?.[seg];
    if (!cur || typeof cur.size !== 'number' || cur.offset === undefined) return null;
    const out = Buffer.alloc(cur.size);
    fsImpl.readSync(fd, out, 0, cur.size, 8 + pickleLen + Number(cur.offset));
    return out.toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fsImpl.closeSync(fd); } catch {} }
  }
}

function probeDshVersionAt(dir, fsImpl = fs) {
  const candidates = [
    path.join(dir, 'node_modules', '@deepseek-ai', 'dsh-tools', 'package.json'),
    path.join(dir, 'resources', 'runtime', 'primary-runtime', 'runtime.json'),
    path.join(dir, 'resources', 'app', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools', 'package.json'),
  ];
  for (const f of candidates) {
    if (fsImpl.existsSync(f)) {
      try {
        const j = JSON.parse(fsImpl.readFileSync(f, 'utf8'));
        return j.desktopVersion || j.version || null;
      } catch {}
    }
  }
  const asar = path.join(dir, 'resources', 'app.asar');
  if (fsImpl.existsSync(asar)) {
    const txt = readAsarFile(asar, 'dsh/node_modules/@deepseek-ai/dsh-tools/package.json', fsImpl);
    if (txt) {
      try { return JSON.parse(txt).version || null; } catch {}
    }
  }
  return null;
}

export function inspectStandaloneTgz(tgzFileOrBuffer, fsImpl = fs) {
  const buf = Buffer.isBuffer(tgzFileOrBuffer) ? tgzFileOrBuffer : fsImpl.readFileSync(tgzFileOrBuffer);
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new Error('安装包体积超出安全上限');
  }
  const tarBuf = zlib.gunzipSync(buf, { maxOutputLength: MAX_UPLOAD_BYTES * 3 });
  let offset = 0;
  let paxPath = null;
  let pkgJson = null;
  while (offset + 512 <= tarBuf.length) {
    const hdr = tarBuf.subarray(offset, offset + 512);
    let zero = true;
    for (let i = 0; i < 512; i++) {
      if (hdr[i] !== 0) { zero = false; break; }
    }
    if (zero) break;
    const rawName = hdr.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = hdr.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const sizeOct = hdr.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = sizeOct ? parseInt(sizeOct, 8) : 0;
    if (!Number.isFinite(size) || size < 0) break;
    const typeFlag = String.fromCharCode(hdr[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tarBuf.length) break;
    if (typeFlag === 'x' || typeFlag === 'g') {
      const paxTxt = tarBuf.subarray(dataStart, dataEnd).toString('utf8');
      for (const line of paxTxt.split('\n')) {
        const m = /^\d+\s+path=(.+)$/.exec(line);
        if (m && typeFlag === 'x') paxPath = m[1];
      }
    } else if (typeFlag === 'L') {
      paxPath = tarBuf.subarray(dataStart, dataEnd).toString('utf8').replace(/\0.*$/, '');
    } else {
      const fullName = (paxPath || (prefix ? `${prefix}/${rawName}` : rawName)).replace(/^\.\//, '');
      paxPath = null;
      if ((typeFlag === '0' || typeFlag === '\0') && fullName === 'package/package.json') {
        pkgJson = JSON.parse(tarBuf.subarray(dataStart, dataEnd).toString('utf8'));
        break;
      }
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  if (!pkgJson || pkgJson.name !== 'dsh-leaderteam' || !pkgJson.dsh?.bundle) {
    throw new Error('所选 .tgz 文件不是有效的 dsh-leaderteam 插件安装包');
  }
  return {
    name: pkgJson.name,
    version: String(pkgJson.version || '').trim(),
    enginesDsh: pkgJson.engines?.dsh ?? null,
  };
}

function extractYamlItemIdAndName(lines) {
  let id = null;
  let name = null;
  if (!Array.isArray(lines) || lines.length === 0) return { id, name };
  const firstId = /^\s*-\s*id\s*:\s*['"]?([^'"#\r\n]+?)['"]?\s*(?:#.*)?$/.exec(lines[0]);
  if (firstId) id = firstId[1].trim();
  const baseIndentMatch = /^(\s*)-\s/.exec(lines[0]);
  const propIndent = (baseIndentMatch ? baseIndentMatch[1].length : 0) + 2;
  const idPropRe = new RegExp(`^\\s{${propIndent}}id\\s*:\\s*['"]?([^'"#\\r\\n]+?)['"]?\\s*(?:#.*)?$`);
  const namePropRe = new RegExp(`^\\s{${propIndent}}name\\s*:\\s*['"]?([^'"#\\r\\n]+?)['"]?\\s*(?:#.*)?$`);
  for (let i = 1; i < lines.length; i++) {
    if (!id) {
      const im = idPropRe.exec(lines[i]);
      if (im) id = im[1].trim();
    }
    if (!name) {
      const nm = namePropRe.exec(lines[i]);
      if (nm) name = nm[1].trim();
    }
    if (id && name) break;
  }
  return { id, name };
}

function isStaleLegacyLeaderTeamInsertItem(lines) {
  const { id, name } = extractYamlItemIdAndName(lines);
  const blockText = lines.join('\n');
  if (id && /^(?:leaderteam(?:-[A-Za-z0-9_-]+)?|dsh-leaderteam|preset-leaderteam|preset-lt-member-[A-Za-z0-9_-]+)$/i.test(id)) {
    return true;
  }
  if (id === 'tool-executor-native' && /(?:leaderteam|entry-native-executor)/i.test(`${name || ''}\n${blockText}`)) {
    return true;
  }
  if (name && /(?:leaderteam\/(?:entry-core|entry-native-executor|entry-lead|plugins\/)|^dsh-leaderteam(?:\/|$))/i.test(name)) {
    return true;
  }
  return false;
}

function isToolWebAlreadyEnabled(lines) {
  const text = lines.join('\n');
  if (/^\s+disabled\s*:\s*true\b/m.test(text)) return false;
  return /\bfetch\s*:\s*true\b/.test(text) && /\bsearchTimeoutMs\s*:\s*\d+\b/.test(text);
}

export function sanitizeDesktopCordisPatchText(rawText) {
  const normalizedOriginal = String(rawText ?? '').replace(/\r\n/g, '\n');
  const lines = normalizedOriginal.split('\n');
  let removedLegacyItems = 0;
  let markersStripped = false;
  const cleanedLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed === LEGACY_PATCH_BEGIN ||
      trimmed.startsWith('# >>> leaderteam') ||
      trimmed === LEGACY_PATCH_END ||
      /^# leaderteam-original-empty-array:\s*[A-Za-z0-9+/=]+\s*$/.test(trimmed)
    ) {
      markersStripped = true;
      continue;
    }
    if (/^\[\]\s*(?:#.*)?$/.test(trimmed) && !line.startsWith(' ')) continue;
    cleanedLines.push(line);
  }

  const headerLines = [];
  const topBlocks = [];
  let pendingComments = [];
  let currentItemLines = null;
  let seenFirstItem = false;

  const flushCurrent = () => {
    if (currentItemLines) {
      while (currentItemLines.length > 1 && currentItemLines[currentItemLines.length - 1].trim() === '') {
        currentItemLines.pop();
      }
      topBlocks.push({ comments: pendingComments, lines: currentItemLines });
      pendingComments = [];
      currentItemLines = null;
    }
  };

  for (const line of cleanedLines) {
    if (/^-\s/.test(line)) {
      flushCurrent();
      seenFirstItem = true;
      currentItemLines = [line];
    } else if (!seenFirstItem) {
      headerLines.push(line);
    } else if (/^#/.test(line)) {
      flushCurrent();
      pendingComments.push(line);
    } else if (currentItemLines) {
      currentItemLines.push(line);
    } else if (line.trim() !== '') {
      pendingComments.push(line);
    }
  }
  flushCurrent();

  const keptBlocks = [];
  let toolWebConfigured = false;

  for (const block of topBlocks) {
    const firstLine = block.lines[0] || '';
    if (/^-\s+insert\s*:\s*(?:#.*)?$/.test(firstLine)) {
      const childIndentMatch = block.lines.slice(1).map(l => /^([ \t]+)-\s/.exec(l)).find(Boolean);
      if (!childIndentMatch) {
        keptBlocks.push(block);
        continue;
      }
      const childIndentLen = childIndentMatch[1].length;
      const childStartRe = new RegExp(`^[ \\t]{${childIndentLen}}-\\s`);
      const subItems = [];
      let curSub = null;
      const insertHeaderExtras = [];
      for (let i = 1; i < block.lines.length; i++) {
        const l = block.lines[i];
        if (childStartRe.test(l)) {
          if (curSub) subItems.push(curSub);
          curSub = [l];
        } else if (curSub) {
          curSub.push(l);
        } else {
          insertHeaderExtras.push(l);
        }
      }
      if (curSub) subItems.push(curSub);

      const keptSubs = [];
      for (const sub of subItems) {
        if (isStaleLegacyLeaderTeamInsertItem(sub)) removedLegacyItems++;
        else keptSubs.push(sub);
      }
      if (keptSubs.length > 0) {
        keptBlocks.push({
          comments: block.comments,
          lines: [firstLine, ...insertHeaderExtras, ...keptSubs.flat()],
        });
      }
      continue;
    }

    const { id, name } = extractYamlItemIdAndName(block.lines);
    const blockText = block.lines.join('\n');
    if (id && /^(?:leaderteam(?:-[A-Za-z0-9_-]+)?|dsh-leaderteam|preset-leaderteam|preset-lt-member-[A-Za-z0-9_-]+)$/i.test(id)) {
      removedLegacyItems++;
      continue;
    }
    if (
      id === 'tool-executor-native' &&
      (/^\s+disabled\s*:\s*true\b/m.test(blockText) || /(?:leaderteam|entry-native-executor)/i.test(`${name || ''}\n${blockText}`))
    ) {
      removedLegacyItems++;
      continue;
    }
    if (id === 'tool-web') {
      toolWebConfigured = true;
      if (isToolWebAlreadyEnabled(block.lines)) {
        keptBlocks.push(block);
      } else {
        const nextToolWebLines = ['- id: tool-web'];
        if (name) nextToolWebLines.push(`  name: ${JSON.stringify(name)}`);
        nextToolWebLines.push('  config: {fetch: true, searchTimeoutMs: 60000}');
        keptBlocks.push({ comments: block.comments, lines: nextToolWebLines });
      }
      continue;
    }
    keptBlocks.push(block);
  }

  let toolWebAdded = false;
  if (!toolWebConfigured) {
    keptBlocks.push({
      comments: [],
      lines: [
        '- id: tool-web',
        '  config: {fetch: true, searchTimeoutMs: 60000}',
      ],
    });
    toolWebAdded = true;
  }

  const cleanHeader = headerLines
    .filter(l => !/^#\s*(?:LeaderTeam rows for the DeepSeek Harness Desktop profile|Placeholders:\s*__LT_ROOT_URL__)/i.test(l.trim()));
  while (cleanHeader.length > 0 && cleanHeader[cleanHeader.length - 1].trim() === '') cleanHeader.pop();

  const outLines = [];
  if (cleanHeader.length > 0) outLines.push(...cleanHeader);
  for (const b of keptBlocks) {
    const cleanComments = b.comments.filter(
      c => !/^#\s*(?:LeaderTeam rows for the DeepSeek Harness Desktop profile|Placeholders:\s*__LT_ROOT_URL__)/i.test(c.trim()),
    );
    if (cleanComments.length > 0) outLines.push(...cleanComments);
    outLines.push(...b.lines);
  }

  const nextText = `${outLines.join('\n').trimEnd()}\n`;
  const changed = markersStripped || removedLegacyItems > 0 || nextText !== `${normalizedOriginal.trimEnd()}\n`;
  return { changed, removedLegacyItems, markersStripped, toolWebEnsured: true, toolWebAdded, text: nextText };
}

export function sanitizeDesktopCordisPatch({
  dshHome,
  profile = 'desktop',
  fsImpl = fs,
} = {}) {
  const profileDir = path.join(dshHome, 'profiles', profile);
  if (!fsImpl.existsSync(profileDir)) {
    return { updated: false, patchFile: path.join(profileDir, 'cordis.patch.yml'), removedLegacyItems: 0, backupFile: null };
  }
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  const existed = fsImpl.existsSync(patchFile);
  const prevRaw = existed ? fsImpl.readFileSync(patchFile, 'utf8') : '';
  const res = sanitizeDesktopCordisPatchText(prevRaw);
  if (!res.changed && existed) {
    return { updated: false, patchFile, removedLegacyItems: 0, toolWebEnsured: true, backupFile: null };
  }
  let backupFile = null;
  if (existed && prevRaw.trim().length > 0) {
    backupFile = `${patchFile}.bak-${Date.now()}`;
    fsImpl.writeFileSync(backupFile, prevRaw, 'utf8');
  }
  const tmpFile = `${patchFile}.tmp-${process.pid}-${Date.now()}`;
  fsImpl.writeFileSync(tmpFile, res.text, 'utf8');
  fsImpl.renameSync(tmpFile, patchFile);
  return { updated: true, patchFile, removedLegacyItems: res.removedLegacyItems, toolWebEnsured: true, backupFile };
}

export function translateStandaloneInstallError(rawError) {
  const msg = String(rawError instanceof Error ? rawError.message : rawError ?? '').trim();
  const lower = msg.toLowerCase();
  if (
    lower.includes('initialize its profile') ||
    lower.includes('open deepseek harness desktop once') ||
    (lower.includes('desktop') && lower.includes('not initialized'))
  ) {
    return {
      code: 'DESKTOP_PROFILE_UNINITIALIZED',
      title: '官方桌面端尚未完成首次初始化',
      friendlyMessage: '新安装的 DeepSeek Harness 桌面客户端需要先打开一次以生成本地配置目录，然后才能安装插件。',
      suggestion: '请先双击打开一次 DeepSeek Harness 桌面客户端，待主界面出现后将其完全退出（含右下角托盘图标），再点击“立即一键安装”。',
      rawDetail: msg,
    };
  }
  if (
    lower.includes('ebusy') ||
    lower.includes('eperm') ||
    lower.includes('still running') ||
    lower.includes('deepseek harness.exe') ||
    lower.includes('正在运行') ||
    lower.includes('lock')
  ) {
    return {
      code: 'CLIENT_RUNNING_OR_LOCKED',
      title: '检测到 DeepSeek Harness 正在运行或目录被占用',
      friendlyMessage: '安装或更新桌面端插件前，需要先完全退出正在运行的 DeepSeek Harness 客户端（含右下角系统托盘图标）。',
      suggestion: '请先关闭 DeepSeek Harness 窗口并右键退出托盘程序，然后点击“重新扫描”或再次点击“立即一键安装”。',
      rawDetail: msg,
    };
  }
  if (lower.includes('sha-256') || lower.includes('sha256')) {
    return {
      code: 'SHA256_MISMATCH',
      title: '安装包 SHA-256 完整性校验未通过',
      friendlyMessage: '下载的安装包与官方校验值不一致，已自动中止安装。',
      suggestion: '请重试下载，或选择已下载到本地的 dsh-leaderteam-*.tgz 离线安装包。',
      rawDetail: msg,
    };
  }
  if (lower.includes('低于最低要求') || lower.includes('engines.dsh') || lower.includes('host_incompatible')) {
    return {
      code: 'INCOMPATIBLE_HOST',
      title: '当前 DeepSeek Harness 版本暂不兼容',
      friendlyMessage: msg,
      suggestion: '请先将官方 DeepSeek Harness 客户端升级至 0.2.2-rc.1 / 0.2.2-rc.5 或更新版本后再试。',
      rawDetail: msg,
    };
  }
  return {
    code: 'INSTALL_ERROR',
    title: '安装未完成',
    friendlyMessage: msg || '自动安装步骤未能完成，原有配置未被破坏。',
    suggestion: '请检查提示信息，或尝试“选择本地 .tgz 安装包”进行离线安装。',
    rawDetail: msg,
  };
}

function findBundledTarballs(dirs, fsImpl = fs) {
  const found = [];
  const seen = new Set();
  for (const dir of dirs) {
    if (!dir || !fsImpl.existsSync(dir)) continue;
    try {
      for (const name of fsImpl.readdirSync(dir)) {
        if (!/^dsh-leaderteam-.*\.tgz$/i.test(name)) continue;
        const full = path.resolve(dir, name);
        if (seen.has(full)) continue;
        seen.add(full);
        try {
          const info = inspectStandaloneTgz(full, fsImpl);
          found.push({ path: full, fileName: name, version: info.version });
        } catch {}
      }
    } catch {}
  }
  return found;
}

export function scanDshTargets({
  customPath = null,
  dshHome = null,
  extraPackageDirs = [],
  platform = process.platform,
  env = process.env,
  fsImpl = fs,
  spawnSyncImpl = spawnSync,
  driveLetters = null,
} = {}) {
  const home = dshHome ? path.resolve(dshHome) : (env?.DSH_HOME ? path.resolve(env.DSH_HOME) : path.join(os.homedir(), '.dsh'));
  const targets = [];
  const desktopRunningNow = isOfficialDesktopProcessRunning(platform, spawnSyncImpl);

  const normalizedCustom = customPath
    ? (/\.(?:exe|cmd|bat)$/i.test(String(customPath).trim())
        ? path.dirname(path.resolve(String(customPath).trim()))
        : path.resolve(String(customPath).trim()))
    : null;

  const desktopCands = [];
  if (normalizedCustom) desktopCands.push(normalizedCustom);
  if (platform === 'win32') {
    desktopCands.push(...discoverWindowsDesktopCandidates({ env, fsImpl, spawnSyncImpl, driveLetters }));
  } else {
    if (env?.DSH_DESKTOP_DIR) desktopCands.push(path.resolve(env.DSH_DESKTOP_DIR));
    if (env?.DSH_APP_DIR) desktopCands.push(path.resolve(env.DSH_APP_DIR));
    if (env?.LT_DSH_APP) desktopCands.push(path.resolve(env.LT_DSH_APP));
    desktopCands.push('/opt/DeepSeek Harness', '/opt/deepseek-harness');
  }

  const seenDesktop = new Set();
  for (const d of desktopCands) {
    if (!d || !fsImpl.existsSync(d)) continue;
    const key = platform === 'win32' ? path.win32.normalize(d).toLowerCase() : path.resolve(d);
    if (seenDesktop.has(key)) continue;
    seenDesktop.add(key);

    const winCli = path.join(d, 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd');
    const unixCli = path.join(d, 'resources', 'runtime', 'cli', 'bin', 'dsh');
    const exe = path.join(d, platform === 'win32' ? 'DeepSeek Harness.exe' : 'deepseek-harness');
    if (!fsImpl.existsSync(winCli) && !fsImpl.existsSync(unixCli) && !fsImpl.existsSync(exe)) continue;
    const ver = probeDshVersionAt(d, fsImpl);
    const hasAsar = fsImpl.existsSync(path.join(d, 'resources', 'app.asar'));
    const desktopHostCliJs = hasAsar
      ? path.join(d, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
      : null;
    const desktopProfileDir = path.join(home, 'profiles', 'desktop');
    const installedPkg = path.join(desktopProfileDir, 'node_modules', 'dsh-leaderteam', 'package.json');
    let installedLtVersion = null;
    if (fsImpl.existsSync(installedPkg)) {
      try { installedLtVersion = JSON.parse(fsImpl.readFileSync(installedPkg, 'utf8')).version; } catch {}
    }

    targets.push({
      id: `desktop:${d}`,
      kind: 'official-desktop',
      label: '官方 DeepSeek Harness 桌面客户端',
      profile: 'desktop',
      installDir: d,
      cliCommand: fsImpl.existsSync(winCli) ? winCli : (fsImpl.existsSync(unixCli) ? unixCli : null),
      desktopHostCliJs,
      cliUsesNode: false,
      clientExecutable: fsImpl.existsSync(exe) ? exe : null,
      dshVersion: ver,
      compatible: isCompatibleDshVersion(ver),
      verified: VERIFIED_DSH_VERSIONS.includes(ver),
      desktopRunning: desktopRunningNow,
      profileInitialized: fsImpl.existsSync(desktopProfileDir),
      installedLtVersion,
    });
  }

  const effectiveUserHome = env?.USERPROFILE || env?.HOME || os.homedir();
  const runtimeCur = path.join(effectiveUserHome, '.local', 'share', 'dsh-runtime', 'current');
  const seenWeb = new Set();
  for (const d of [normalizedCustom, runtimeCur].filter(Boolean)) {
    if (!fsImpl.existsSync(d)) continue;
    const key = platform === 'win32' ? path.win32.normalize(d).toLowerCase() : path.resolve(d);
    if (seenWeb.has(key) || seenDesktop.has(key)) continue;
    seenWeb.add(key);

    const binJs = path.join(d, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
    if (!fsImpl.existsSync(binJs)) continue;
    const ver = probeDshVersionAt(d, fsImpl);
    const webProfileDir = path.join(home, 'profiles', 'web');
    const installedPkg = path.join(webProfileDir, 'node_modules', 'dsh-leaderteam', 'package.json');
    let installedLtVersion = null;
    if (fsImpl.existsSync(installedPkg)) {
      try { installedLtVersion = JSON.parse(fsImpl.readFileSync(installedPkg, 'utf8')).version; } catch {}
    }
    targets.push({
      id: `web:${d}`,
      kind: 'dsh-web-cli',
      label: 'DeepSeek Harness Web / CLI 环境',
      profile: 'web',
      installDir: d,
      cliCommand: binJs,
      cliUsesNode: true,
      clientExecutable: null,
      dshVersion: ver,
      compatible: isCompatibleDshVersion(ver),
      verified: VERIFIED_DSH_VERSIONS.includes(ver),
      desktopRunning: false,
      profileInitialized: fsImpl.existsSync(webProfileDir),
      installedLtVersion,
    });
  }

  const bundledTarballs = findBundledTarballs(
    [process.cwd(), THIS_DIR, path.dirname(THIS_DIR), ...extraPackageDirs],
    fsImpl,
  );

  return {
    platform,
    arch: process.arch,
    dshHome: home,
    targets,
    bundledTarballs,
    tracks: Object.values(TRACKS),
    verifiedVersions: VERIFIED_DSH_VERSIONS,
  };
}

function isBrokenStandaloneDir(targetPath, fsImpl = fs) {
  if (!targetPath) return false;
  try {
    const lst = fsImpl.lstatSync(targetPath);
    if (!lst) return false;
    try {
      return !fsImpl.statSync(targetPath).isDirectory();
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

function withHealthyStandalonePnpmEnv(baseEnv, dshHome) {
  const nextEnv = { ...baseEnv, DSH_HOME: dshHome };
  const explicitStore = nextEnv.NPM_CONFIG_STORE_DIR || nextEnv.npm_config_store_dir || '';
  if (explicitStore && !isBrokenStandaloneDir(explicitStore)) return nextEnv;
  const candidates = [];
  if (explicitStore) candidates.push(explicitStore);
  if (nextEnv.PNPM_HOME) candidates.push(path.join(nextEnv.PNPM_HOME, 'store'));
  if (process.platform === 'win32' && nextEnv.LOCALAPPDATA) {
    candidates.push(path.join(nextEnv.LOCALAPPDATA, 'pnpm', 'store'));
  }
  if (candidates.some(p => isBrokenStandaloneDir(p) || isBrokenStandaloneDir(path.dirname(p)))) {
    const safePnpmHome = path.join(dshHome || os.tmpdir(), 'leaderteam', 'pnpm-home');
    const safeStore = path.join(safePnpmHome, 'store');
    try { fs.mkdirSync(safeStore, { recursive: true }); } catch {}
    nextEnv.PNPM_HOME = safePnpmHome;
    nextEnv.NPM_CONFIG_STORE_DIR = safeStore;
  }
  return nextEnv;
}

function invokeStandalonePluginAdd(target, tgzToInstall, dshHome) {
  const execEnv = withHealthyStandalonePnpmEnv(process.env, dshHome);
  if (target.kind === 'official-desktop' && target.clientExecutable && target.desktopHostCliJs) {
    return spawnSync(
      target.clientExecutable,
      ['--expose-internals', target.desktopHostCliJs, 'plugin', '--profile', target.profile, 'add', tgzToInstall],
      {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        timeout: 180000,
        env: { ...execEnv, ELECTRON_RUN_AS_NODE: '1' },
      },
    );
  }
  const cmd = target.cliUsesNode ? process.execPath : target.cliCommand;
  const args = target.cliUsesNode
    ? [target.cliCommand, 'plugin', '--profile', target.profile, 'add', tgzToInstall]
    : ['plugin', '--profile', target.profile, 'add', tgzToInstall];
  const isCmd = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(cmd));
  if (isCmd) {
    const quotedLine = [cmd, ...args].map(a => `"${String(a).replace(/"/g, '""')}"`).join(' ');
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${quotedLine}"`], {
      encoding: 'utf8',
      windowsHide: true,
      windowsVerbatimArguments: true,
      shell: false,
      timeout: 180000,
      env: execEnv,
    });
  }
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 180000,
    env: execEnv,
  });
}

export async function downloadAndInstallStandalone({
  targetId = null,
  customPath = null,
  track = 'closed-free',
  localTgzPath = null,
  apiKeyEnvVar = '',
  apiKey = '',
  dshHome = null,
  fetchImpl = globalThis.fetch,
  runner = null,
  spawnSyncImpl = spawnSync,
} = {}) {
  const snap = scanDshTargets({ customPath, dshHome, spawnSyncImpl });
  const target = (targetId ? snap.targets.find(t => t.id === targetId) : null) || snap.targets[0];
  if (!target) {
    throw new Error('未检测到本机已安装的 DeepSeek Harness，请先安装官方客户端（>= 0.2.2-rc.1），或在页面手动指定安装目录后点击“重新扫描”。');
  }
  if (!target.compatible) {
    throw new Error(`当前 DSH 版本 (${target.dshVersion || '未知'}) 低于最低要求 0.2.2-alpha.2，请先更新 DSH 客户端。`);
  }
  if (target.kind === 'official-desktop' && target.desktopRunning) {
    throw new Error('EBUSY: 检测到 DeepSeek Harness 正在运行，请先完全退出客户端（含右下角托盘图标）后再点击安装。');
  }

  let tgzToInstall = localTgzPath ? path.resolve(localTgzPath) : null;
  let versionInstalled = null;

  if (tgzToInstall) {
    const pkgMeta = inspectStandaloneTgz(tgzToInstall);
    if (pkgMeta.enginesDsh && target.dshVersion && !satisfiesStandaloneRange(target.dshVersion, pkgMeta.enginesDsh)) {
      throw new Error(`HOST_INCOMPATIBLE: 当前 DSH 版本 (${target.dshVersion}) 不满足安装包要求 (${pkgMeta.enginesDsh})。`);
    }
    versionInstalled = pkgMeta.version;
  } else {
    const tMeta = TRACKS[track] || TRACKS['closed-free'];
    const relRes = await fetchImpl(tMeta.apiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LT-Standalone-Installer' },
    });
    if (!relRes.ok) throw new Error(`获取 GitHub Releases 列表失败 (HTTP ${relRes.status})`);
    const releases = await relRes.json();
    const rel = selectBestPlatformRelease(releases, snap.platform);
    if (!rel) throw new Error(`未找到适配当前系统 (${snap.platform}) 的正式版 .tgz 安装包`);
    const tgzAsset = rel.assets.find(a => a.name.endsWith('.tgz'));
    const sumsAsset = rel.assets.find(a => /^SHA256SUMS/i.test(a.name));

    let expectedSha = null;
    if (sumsAsset?.browser_download_url) {
      const sr = await fetchImpl(sumsAsset.browser_download_url);
      if (sr.ok) {
        const txt = await sr.text();
        for (const line of txt.split(/\r?\n/)) {
          const m = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim());
          if (m && path.posix.basename(m[2].trim().replaceAll('\\', '/')) === tgzAsset.name) {
            expectedSha = m[1].toLowerCase();
          }
        }
      }
    }
    const pkgRes = await fetchImpl(tgzAsset.browser_download_url);
    if (!pkgRes.ok) throw new Error(`下载安装包失败 (HTTP ${pkgRes.status})`);
    const buf = Buffer.from(await pkgRes.arrayBuffer());
    const actualSha = crypto.createHash('sha256').update(buf).digest('hex');
    if (expectedSha && actualSha !== expectedSha) {
      throw new Error('安装包 SHA-256 校验未通过，已中止安装');
    }
    const pkgMeta = inspectStandaloneTgz(buf);
    if (pkgMeta.enginesDsh && target.dshVersion && !satisfiesStandaloneRange(target.dshVersion, pkgMeta.enginesDsh)) {
      throw new Error(`HOST_INCOMPATIBLE: 当前 DSH 版本 (${target.dshVersion}) 不满足安装包要求 (${pkgMeta.enginesDsh})。`);
    }
    const stageDir = path.join(snap.dshHome, 'leaderteam', 'installer-staging');
    fs.mkdirSync(stageDir, { recursive: true });
    tgzToInstall = path.join(stageDir, tgzAsset.name);
    fs.writeFileSync(tgzToInstall, buf);
    versionInstalled = pkgMeta.version || parsePlatformReleaseTag(rel.tag_name)?.version || String(rel.tag_name || '').replace(/^v/i, '');
  }

  if (typeof runner === 'function') {
    await runner({ target, tgzToInstall, dshHome: snap.dshHome });
  } else {
    const proc = invokeStandalonePluginAdd(target, tgzToInstall, snap.dshHome);
    if (proc.status !== 0) {
      throw new Error((proc.stderr || proc.stdout || `安装退出码 ${proc.status}`).trim());
    }
  }

  let desktopPatchHygiene = null;
  if (target.profile === 'desktop' || target.kind === 'official-desktop') {
    desktopPatchHygiene = sanitizeDesktopCordisPatch({
      dshHome: snap.dshHome,
      profile: target.profile || 'desktop',
    });
  }

  if (apiKeyEnvVar && apiKey && /^[A-Z_][A-Z0-9_]*$/.test(apiKeyEnvVar)) {
    fs.mkdirSync(snap.dshHome, { recursive: true });
    const envFile = path.join(snap.dshHome, '.env');
    const prev = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    const filtered = prev.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith(`${apiKeyEnvVar}=`));
    filtered.push(`${apiKeyEnvVar}=${JSON.stringify(String(apiKey).trim())}`);
    fs.writeFileSync(envFile, `${filtered.join('\n')}\n`, { mode: 0o600 });
  }

  return { ok: true, target, versionInstalled, tgzToInstall, desktopPatchHygiene };
}

export async function launchStandaloneClient({
  targetId = null,
  customPath = null,
  dshHome = null,
  spawner = spawn,
} = {}) {
  const snap = scanDshTargets({ customPath, dshHome });
  const target = (targetId ? snap.targets.find(t => t.id === targetId) : null) || snap.targets[0];
  if (!target) throw new Error('未找到可启动的 DeepSeek Harness 客户端。');
  if (target.kind === 'official-desktop' && target.clientExecutable) {
    const cleanEnv = { ...process.env, DSH_HOME: snap.dshHome };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    const child = spawner(target.clientExecutable, [], {
      cwd: target.installDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      env: cleanEnv,
    });
    child.unref?.();
    return {
      ok: true,
      launched: true,
      kind: 'official-desktop',
      executable: target.clientExecutable,
      message: '已启动 DeepSeek Harness 桌面客户端！新建会话选择 LeaderTeam 预设即可开始。',
    };
  }
  return {
    ok: true,
    launched: false,
    kind: target.kind,
    message: '插件已完成安装，请启动 dsh web 打开控制台。',
  };
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function readBoundedBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let done = false;
    req.on('data', chunk => {
      if (done) return;
      total += chunk.length;
      if (total > maxBytes) {
        done = true;
        resolve({ tooLarge: true, buffer: null });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve({ tooLarge: false, buffer: Buffer.concat(chunks) });
    });
    req.on('error', err => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

export function renderStandaloneHtml(token) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LeaderTeam 零命令行一键安装器</title>
<style>
  :root {
    --bg:#f5f7f9; --surface:#fff; --surface-alt:#eef3f6; --ink:#1b3039; --muted:#566b75;
    --accent:#2a657c; --accent-hover:#215164; --ok:#1f7a4c; --ok-bg:#e9f6ef;
    --warn:#9a6700; --warn-bg:#fff8e6; --err:#a3263f; --err-bg:#fdecef; --line:#d6e0e6;
  }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; background:var(--bg); color:var(--ink); max-width:820px; margin:28px auto 60px; padding:0 18px; line-height:1.55; }
  .hero { background:linear-gradient(135deg,#1b3039 0%,#2a657c 100%); color:#fff; border-radius:10px; padding:24px 28px; margin-bottom:18px; }
  .hero h1 { margin:0 0 6px; font-size:21px; }
  .hero p { margin:0; font-size:13.5px; opacity:0.92; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:20px 22px; margin-bottom:16px; }
  .card h2 { margin:0 0 12px; font-size:16.5px; }
  .target-item { border:1.5px solid var(--line); border-radius:8px; padding:12px 15px; margin-bottom:10px; cursor:pointer; }
  .target-item.selected { border-color:var(--accent); background:#f4f9fc; }
  .badge { display:inline-block; padding:2px 9px; border-radius:99px; font-size:12px; font-weight:600; }
  .badge.ok { background:var(--ok-bg); color:var(--ok); }
  .badge.err { background:var(--err-bg); color:var(--err); }
  .field { margin-top:12px; }
  .field label { display:block; font-size:13px; font-weight:600; margin-bottom:5px; }
  input, select { padding:9px 11px; border:1px solid var(--line); border-radius:6px; width:100%; font-size:14px; background:#fff; color:var(--ink); }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  button { background:var(--accent); color:#fff; border:1px solid transparent; border-radius:7px; padding:10px 18px; font-size:14px; font-weight:600; cursor:pointer; white-space:nowrap; }
  button:hover:not(:disabled) { background:var(--accent-hover); }
  button.secondary { background:var(--surface-alt); color:var(--ink); border-color:var(--line); }
  button:disabled { opacity:0.55; cursor:not-allowed; }
  .alert { padding:12px 15px; border-radius:8px; margin-top:10px; font-size:13.5px; }
  .alert.ok { background:var(--ok-bg); color:var(--ok); border:1px solid #b5e2c9; }
  .alert.warn { background:var(--warn-bg); color:var(--warn); border:1px solid #f0d799; }
  .alert.err { background:var(--err-bg); color:var(--err); border:1px solid #f2b8c4; }
</style>
</head>
<body>
<div class="hero">
  <h1>LeaderTeam 零命令行图形化一键安装器</h1>
  <p>自动识别本机 DeepSeek Harness 默认与自定义安装目录（如 D:\\Apps\\DeepSeek-Harness），支持在线 SHA-256 校验安装与本地 .tgz 离线安装。</p>
</div>

<div class="card">
  <h2>第一步：自动检测 DeepSeek Harness 环境</h2>
  <div id="env">正在扫描本机环境…</div>
  <div class="field">
    <label for="customDshInput">手动指定 DeepSeek Harness 安装目录（可选）</label>
    <div class="row">
      <input id="customDshInput" type="text" placeholder="例如 D:\\Apps\\DeepSeek-Harness（留空则自动扫描全盘与注册表）" style="flex:1" />
      <button id="btnRescan" class="secondary" type="button">重新扫描</button>
    </div>
  </div>
</div>

<div class="card">
  <h2>第二步：选择安装包来源与初始模型 Key（可选）</h2>
  <div class="field">
    <label for="sourceSelect">安装包来源</label>
    <select id="sourceSelect"></select>
  </div>
  <div class="field" id="uploadRow" style="display:none">
    <label for="tgzFileInput">选择本地已下载的 <code>dsh-leaderteam-*.tgz</code> 安装包</label>
    <input id="tgzFileInput" type="file" accept=".tgz,application/gzip" />
  </div>
  <div class="field" id="localPathRow" style="display:none">
    <label for="localTgzPathInput">填写本地 <code>.tgz</code> 安装包完整路径</label>
    <input id="localTgzPathInput" type="text" placeholder="例如 D:\\Downloads\\dsh-leaderteam-2.3.1.tgz" />
  </div>
  <div class="field">
    <label for="envVar">可选：粘贴初始模型 API Key（免命令行直连，安装后也可在控制台向导中配置）</label>
    <div class="row">
      <select id="envVar" style="width:260px">
        <option value="">暂不填写</option>
        <option value="DEEPSEEK_API_KEY">DeepSeek (DEEPSEEK_API_KEY)</option>
        <option value="DASHSCOPE_API_KEY">阿里云百炼 Qwen (DASHSCOPE_API_KEY)</option>
        <option value="ZHIPU_API_KEY">智谱 GLM (ZHIPU_API_KEY)</option>
        <option value="OPENAI_API_KEY">OpenAI (OPENAI_API_KEY)</option>
      </select>
      <input id="apiKey" type="password" placeholder="粘贴 API Key（本地安全写入 ~/.dsh/.env）" style="flex:1" />
    </div>
  </div>
</div>

<div class="card">
  <h2>第三步：一键安装并启动</h2>
  <div class="row">
    <button id="btnInstall" type="button">立即一键校验并安装</button>
    <button id="btnLaunch" class="secondary" type="button" style="display:none">立即启动 DeepSeek Harness 客户端</button>
  </div>
  <div id="msg"></div>
</div>

<script>
(function() {
  const tok = ${JSON.stringify(token)};
  let state = null;
  let tid = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderScan(d) {
    const prevSrc = document.getElementById('sourceSelect').value;
    state = d;
    const envEl = document.getElementById('env');
    if (!d.targets || !d.targets.length) {
      envEl.innerHTML = '<div class="alert warn"><strong>未自动检测到 DeepSeek Harness 客户端</strong><br>请确认已安装官方 DeepSeek Harness (&gt;= 0.2.2-rc.1)，或在下方输入框手动填写安装目录（如 <code>D:\\\\Apps\\\\DeepSeek-Harness</code>）后点击“重新扫描”。</div>';
    } else {
      if (!tid || !d.targets.some(t => t.id === tid)) tid = d.targets[0].id;
      envEl.innerHTML = d.targets.map(t => {
        const badgeCls = t.compatible ? 'ok' : 'err';
        const badgeTxt = t.verified ? ('已实机认证兼容 (' + (t.dshVersion || '') + ')') : (t.compatible ? ('结构契约兼容 (' + (t.dshVersion || '') + ')') : ('版本过低 (' + (t.dshVersion || '未知') + ')'));
        const ltTxt = t.installedLtVersion ? (' · 已装 LT v' + esc(t.installedLtVersion)) : ' · 尚未安装 LT';
        const runWarn = (t.kind === 'official-desktop' && t.desktopRunning)
          ? '<div class="alert warn" style="margin-top:8px"><strong>温馨提示：检测到 DeepSeek Harness 正在运行</strong><br>安装前请先完全退出正在运行的 DeepSeek Harness 客户端（含右下角系统托盘图标），然后点击“重新扫描”再开始安装。</div>'
          : '';
        return '<div class="target-item ' + (t.id === tid ? 'selected' : '') + '" data-tid="' + esc(t.id) + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + esc(t.label) + '</b><span class="badge ' + badgeCls + '">' + esc(badgeTxt) + '</span></div>' +
          '<div style="font-size:12.5px;color:var(--muted);margin-top:4px">' + esc(t.installDir) + ltTxt + '</div>' +
          runWarn + '</div>';
      }).join('');
      envEl.querySelectorAll('.target-item').forEach(el => {
        el.onclick = () => { tid = el.getAttribute('data-tid'); renderScan(state); };
      });
    }

    const srcSel = document.getElementById('sourceSelect');
    const opts = [];
    (d.bundledTarballs || []).forEach(b => {
      opts.push({ val: 'bundled:' + b.path, label: '使用随附离线安装包：' + b.fileName + ' (v' + b.version + ')' });
    });
    opts.push({ val: 'track:closed-free', label: '在线下载最新「闭源免费公开发行版 (dsh-leaderteam-releases)」' });
    opts.push({ val: 'track:open-source', label: '在线下载最新「开源维护版 (dsh-leaderteam · Apache-2.0)」' });
    opts.push({ val: 'upload-tgz', label: '选择本地 .tgz 安装包文件上传安装…' });
    opts.push({ val: 'path-tgz', label: '手动输入本地 .tgz 安装包路径安装…' });
    srcSel.innerHTML = opts.map(o => '<option value="' + esc(o.val) + '">' + esc(o.label) + '</option>').join('');
    if (prevSrc && opts.some(o => o.val === prevSrc)) srcSel.value = prevSrc;
    srcSel.onchange = () => {
      document.getElementById('uploadRow').style.display = srcSel.value === 'upload-tgz' ? 'block' : 'none';
      document.getElementById('localPathRow').style.display = srcSel.value === 'path-tgz' ? 'block' : 'none';
    };
    srcSel.onchange();
  }

  async function doScan() {
    const customPath = document.getElementById('customDshInput').value.trim();
    const qs = '/scan?token=' + encodeURIComponent(tok) + (customPath ? '&customPath=' + encodeURIComponent(customPath) : '');
    const r = await fetch(qs);
    const d = await r.json();
    if (customPath && d.targets && d.targets.length > 0) tid = d.targets[0].id;
    renderScan(d);
    return d;
  }

  document.getElementById('btnRescan').onclick = () => doScan();
  document.getElementById('customDshInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); doScan(); }
  });

  document.getElementById('btnInstall').onclick = async () => {
    const btn = document.getElementById('btnInstall');
    const m = document.getElementById('msg');
    const customPath = document.getElementById('customDshInput').value.trim();
    btn.disabled = true;
    try {
      const latest = await doScan();
      const chosen = latest.targets && (latest.targets.find(t => t.id === tid) || latest.targets[0]);
      if (chosen && chosen.kind === 'official-desktop' && chosen.desktopRunning) {
        m.innerHTML = '<div class="alert warn"><strong>检测到 DeepSeek Harness 正在运行</strong><br>安装插件前请先完全关闭正在运行的 DeepSeek Harness 客户端（含右下角系统托盘图标），退出后再次点击本按钮即可完成安装。</div>';
        return;
      }

      const srcVal = document.getElementById('sourceSelect').value;
      const body = {
        targetId: tid,
        customPath: customPath || null,
        track: 'closed-free',
        apiKeyEnvVar: document.getElementById('envVar').value,
        apiKey: document.getElementById('apiKey').value.trim(),
      };
      if (srcVal.startsWith('bundled:')) {
        body.localTgzPath = srcVal.slice('bundled:'.length);
      } else if (srcVal.startsWith('track:')) {
        body.track = srcVal.slice('track:'.length);
      } else if (srcVal === 'path-tgz') {
        const p = document.getElementById('localTgzPathInput').value.trim();
        if (!p) throw new Error('请先输入本地 .tgz 安装包的完整路径');
        body.localTgzPath = p;
      } else if (srcVal === 'upload-tgz') {
        const f = document.getElementById('tgzFileInput').files[0];
        if (!f) throw new Error('请先选择本地 .tgz 安装包文件');
        m.innerHTML = '<div class="alert ok">正在读取本地安装包 ' + esc(f.name) + '…</div>';
        const up = await fetch('/upload-tgz?token=' + encodeURIComponent(tok) + '&name=' + encodeURIComponent(f.name), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: await f.arrayBuffer(),
        });
        const upJson = await up.json();
        if (!up.ok || !upJson.ok) throw new Error(upJson.error || '上传安装包失败');
        body.localTgzPath = upJson.stagedPath;
      }

      m.innerHTML = '<div class="alert ok">正在校验并自动安装 LeaderTeam（首次安装约需 10~40 秒，请稍候）…</div>';
      const r = await fetch('/install?token=' + encodeURIComponent(tok), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        const f = j.friendly || { title: '安装未完成', friendlyMessage: j.error || '未知错误', suggestion: '请检查提示后重试。' };
        m.innerHTML = '<div class="alert err"><strong>' + esc(f.title) + '</strong><br>' + esc(f.friendlyMessage) + '<br><b>处理建议：</b>' + esc(f.suggestion) + '</div>';
        return;
      }
      m.innerHTML = '<div class="alert ok"><strong>✔ LeaderTeam v' + esc(j.versionInstalled || '') + ' 安装成功！</strong><br>桌面端配置已自动优化并启用联网工具，点击“立即启动 DeepSeek Harness 客户端”即可开始使用！</div>';
      document.getElementById('btnLaunch').style.display = 'inline-block';
      await doScan();
    } catch (e) {
      m.innerHTML = '<div class="alert err"><strong>安装未完成</strong><br>' + esc(e.message) + '</div>';
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById('btnLaunch').onclick = async () => {
    const m = document.getElementById('msg');
    const customPath = document.getElementById('customDshInput').value.trim();
    const r = await fetch('/launch?token=' + encodeURIComponent(tok), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: tid, customPath: customPath || null }),
    });
    const j = await r.json();
    m.innerHTML = j.ok
      ? ('<div class="alert ok">' + esc(j.message) + '</div>')
      : ('<div class="alert err">' + esc(j.error || '启动失败') + '</div>');
  };

  doScan();
})();
</script>
</body>
</html>`;
}

export async function startStandaloneInstallerServer({
  port = 0,
  dshHome = null,
  customPath = null,
  openBrowser = true,
} = {}) {
  const token = crypto.randomBytes(20).toString('hex');
  const uploadedFiles = new Set();

  const server = http.createServer(async (req, res) => {
    const boundPort = server.address()?.port;
    const host = String(req.headers.host || '').toLowerCase();
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}` && host !== `[::1]:${boundPort}`) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const u = new URL(req.url || '/', `http://${host}`);
    const qTok = u.searchParams.get('token') || '';
    if (!safeEqual(qTok, token)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unauthorized');
      return;
    }

    if (req.method === 'GET' && u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(renderStandaloneHtml(token));
      return;
    }

    if (req.method === 'GET' && u.pathname === '/scan') {
      const scanCustom = u.searchParams.get('customPath') || customPath || null;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(scanDshTargets({ customPath: scanCustom, dshHome })));
      return;
    }

    if (req.method === 'POST' && u.pathname === '/upload-tgz') {
      const rawName = path.posix.basename(String(u.searchParams.get('name') || 'package.tgz'));
      if (!rawName.endsWith('.tgz')) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '仅支持上传 .tgz 安装包文件' }));
        return;
      }
      const readRes = await readBoundedBody(req, MAX_UPLOAD_BYTES);
      if (readRes.tooLarge) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '安装包体积超出安全限制' }));
        return;
      }
      const snap = scanDshTargets({ customPath, dshHome });
      const stageDir = path.join(snap.dshHome, 'leaderteam', 'installer-uploads');
      fs.mkdirSync(stageDir, { recursive: true });
      const stagedPath = path.join(stageDir, `${Date.now()}-${rawName}`);
      fs.writeFileSync(stagedPath, readRes.buffer);
      uploadedFiles.add(stagedPath);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, stagedPath, sizeBytes: readRes.buffer.length }));
      return;
    }

    if (req.method === 'POST' && u.pathname === '/install') {
      const bodyRes = await readBoundedBody(req);
      if (bodyRes.tooLarge) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: '请求体过大' }));
        return;
      }
      try {
        const body = JSON.parse(bodyRes.buffer.toString('utf8') || '{}');
        const out = await downloadAndInstallStandalone({
          ...body,
          dshHome: body.dshHome || dshHome,
          customPath: body.customPath || customPath,
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      } catch (e) {
        const friendly = translateStandaloneInstallError(e);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: friendly.friendlyMessage, friendly }));
      }
      return;
    }

    if (req.method === 'POST' && u.pathname === '/launch') {
      const bodyRes = await readBoundedBody(req);
      try {
        const body = JSON.parse(bodyRes.buffer.toString('utf8') || '{}');
        const out = await launchStandaloneClient({
          targetId: body.targetId || null,
          customPath: body.customPath || customPath || null,
          dshHome: body.dshHome || dshHome,
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  const boundPort = server.address().port;
  const url = `http://127.0.0.1:${boundPort}/?token=${token}`;
  if (openBrowser) {
    try {
      if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
      else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } catch {}
  }

  return {
    server,
    port: boundPort,
    token,
    url,
    async close() {
      for (const f of uploadedFiles) {
        try { fs.rmSync(f, { force: true }); } catch {}
      }
      await new Promise(resolve => server.close(() => resolve()));
    },
  };
}

function parseStandaloneArgs(argv) {
  const opts = {
    gui: true,
    inspect: false,
    help: false,
    noOpen: false,
    json: false,
    port: 0,
    customPath: null,
    dshHome: null,
    tgz: null,
    track: 'closed-free',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--gui') opts.gui = true;
    else if (a === '--cli' || a === '--non-interactive') opts.gui = false;
    else if (a === '--inspect') { opts.inspect = true; opts.gui = false; }
    else if (a === '--no-open') opts.noOpen = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--port' && argv[i + 1]) opts.port = Number(argv[++i]) || 0;
    else if (a === '--custom-path' && argv[i + 1]) opts.customPath = argv[++i];
    else if (a === '--dsh-home' && argv[i + 1]) opts.dshHome = argv[++i];
    else if (a === '--tgz' && argv[i + 1]) opts.tgz = argv[++i];
    else if (a === '--track' && argv[i + 1]) opts.track = argv[++i];
  }
  return opts;
}

function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try { return fs.realpathSync(path.resolve(argv1)) === fs.realpathSync(fileURLToPath(metaUrl)); }
  catch { return path.resolve(argv1) === fileURLToPath(metaUrl); }
}

if (isMain(import.meta.url)) {
  (async () => {
    const opts = parseStandaloneArgs(process.argv.slice(2));
    if (opts.help) {
      console.log([
        'LeaderTeam Standalone One-Click Installer (Zero-CLI)',
        'Usage: node lt-installer-standalone.mjs [--gui] [--inspect] [--custom-path <dir>] [--tgz <file>] [--track <closed-free|open-source>] [--no-open] [--help]',
      ].join('\n'));
      process.exit(0);
    }
    if (opts.inspect) {
      console.log(JSON.stringify(scanDshTargets({ customPath: opts.customPath, dshHome: opts.dshHome }), null, 2));
      process.exit(0);
    }
    if (!opts.gui) {
      const out = await downloadAndInstallStandalone({
        customPath: opts.customPath,
        dshHome: opts.dshHome,
        localTgzPath: opts.tgz,
        track: opts.track,
      });
      console.log(JSON.stringify(out, null, 2));
      process.exit(0);
    }
    const srv = await startStandaloneInstallerServer({
      port: opts.port,
      dshHome: opts.dshHome,
      customPath: opts.customPath,
      openBrowser: !opts.noOpen,
    });
    console.log(`LeaderTeam 一键安装器已启动：${srv.url}`);
  })().catch(err => {
    const f = translateStandaloneInstallError(err);
    console.error(`✖ ${f.title}: ${f.friendlyMessage}\n  建议：${f.suggestion}`);
    process.exit(1);
  });
}
