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
    brand: 'LT',
    label: 'Leader Team (LT · 闭源免费公开发行版)',
    shortLabel: 'LT 闭源免费版',
    repo: 'youzi-ovo-create/leaderteam',
    apiUrl: 'https://api.github.com/repos/youzi-ovo-create/leaderteam/releases?per_page=30',
    releasesUrl: 'https://github.com/youzi-ovo-create/leaderteam/releases',
  },
  'open-source': {
    id: 'open-source',
    brand: 'OLT',
    label: 'Open Leader Team (OLT · Apache-2.0 开源维护版)',
    shortLabel: 'OLT 开源维护版',
    repo: 'youzi-ovo-create/dsh-leaderteam',
    apiUrl: 'https://api.github.com/repos/youzi-ovo-create/dsh-leaderteam/releases?per_page=30',
    releasesUrl: 'https://github.com/youzi-ovo-create/dsh-leaderteam/releases',
  },
});

export function parsePlatformReleaseTag(rawTag) {
  const trimmed = String(rawTag ?? '').trim();
  const m = /^(?:(?:olt|lt)-)?(?:(windows|win32|linux|darwin|macos)-)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/i.exec(trimmed);
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

export function selectMainPackageAsset(assets, targetPlatform = process.platform) {
  const list = Array.isArray(assets) ? assets.filter(a => typeof a?.name === 'string' && a.name.endsWith('.tgz')) : [];
  if (list.length === 0) return null;
  const mainOnly = list.filter(a => /^dsh-leaderteam-.*\.tgz$/i.test(a.name));
  const pool = mainOnly.length > 0 ? mainOnly : list.filter(a => !/^lt-usage-plugin/i.test(a.name));
  if (pool.length === 0) return null;
  if (targetPlatform === 'linux') {
    return (
      pool.find(a => /-linux-(?:x64|x86_64)\.tgz$/i.test(a.name)) ??
      pool.find(a => !/-win(?:32|dows)?-/i.test(a.name)) ??
      pool[0]
    );
  }
  if (targetPlatform === 'win32') {
    return (
      pool.find(a => /-win(?:32|dows)?-x64\.tgz$/i.test(a.name)) ??
      pool.find(a => !/-linux-/i.test(a.name)) ??
      pool[0]
    );
  }
  return pool[0];
}

export function listPlatformReleases(releases, targetPlatform = process.platform, { includePrerelease = false } = {}) {
  const items = [];
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!r || r.draft || (!includePrerelease && r.prerelease) || !Array.isArray(r.assets)) continue;
    const tgzAsset = selectMainPackageAsset(r.assets, targetPlatform);
    if (!tgzAsset) continue;
    const parsedTag = parsePlatformReleaseTag(r.tag_name);
    if (!parsedTag) continue;
    if (parsedTag.releasePlatform !== 'universal' && parsedTag.releasePlatform !== targetPlatform) continue;
    const sumsAsset = r.assets.find(a => typeof a?.name === 'string' && /^SHA256SUMS/i.test(a.name)) ?? null;
    items.push({
      rel: r,
      tag: String(r.tag_name || '').trim(),
      name: String(r.name || r.tag_name || '').trim(),
      version: parsedTag.version,
      prerelease: Boolean(r.prerelease),
      releasePlatform: parsedTag.releasePlatform,
      publishedAt: r.published_at || r.created_at || null,
      assetName: tgzAsset.name,
      assetSize: tgzAsset.size ?? null,
      downloadUrl: tgzAsset.browser_download_url || null,
      sumsUrl: sumsAsset?.browser_download_url || null,
    });
  }
  items.sort((a, b) => {
    const cmp = compareSemver(b.version, a.version);
    if (cmp !== 0) return cmp;
    const aExact = a.releasePlatform === targetPlatform ? 1 : 0;
    const bExact = b.releasePlatform === targetPlatform ? 1 : 0;
    return bExact - aExact;
  });
  const latestStableIdx = items.findIndex(it => !it.prerelease);
  return items.map((it, idx) => ({ ...it, isLatest: latestStableIdx >= 0 ? idx === latestStableIdx : idx === 0 }));
}

export async function fetchTrackReleases({
  track = 'closed-free',
  platform = process.platform,
  includePrerelease = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const tMeta = TRACKS[track] || TRACKS['closed-free'];
  const res = await fetchImpl(tMeta.apiUrl, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LT-Unified-Downloader' },
  });
  if (!res.ok) throw new Error(`获取 ${tMeta.shortLabel} 版本列表失败 (HTTP ${res.status})`);
  const raw = await res.json();
  const releases = listPlatformReleases(raw, platform, { includePrerelease }).map(({ rel, ...rest }) => rest);
  return {
    track: tMeta.id,
    brand: tMeta.brand,
    label: tMeta.label,
    repo: tMeta.repo,
    platform,
    releases,
  };
}

export function selectBestPlatformRelease(releases, targetPlatform = process.platform) {
  return listPlatformReleases(releases, targetPlatform)[0]?.rel ?? null;
}

export function inferPackageTrackFromMeta(pkgJson, pkgDir = null, fsImpl = fs) {
  if (!pkgJson || typeof pkgJson !== 'object') return null;
  const repoUrl = typeof pkgJson.repository === 'string' ? pkgJson.repository : String(pkgJson.repository?.url || '');
  const lic = String(pkgJson.license || '').toLowerCase();
  if (/dsh-leaderteam-releases|youzi-ovo-create\/leaderteam(?:\.git)?$/i.test(repoUrl) || lic.includes('see license')) {
    return 'closed-free';
  }
  if (/dsh-leaderteam(?:\.git)?$/i.test(repoUrl) || lic.includes('apache-2.0')) {
    return 'open-source';
  }
  if (pkgDir) {
    try {
      const nativeDir = path.join(pkgDir, 'leaderteam', 'native');
      if (fsImpl.existsSync(nativeDir) && fsImpl.readdirSync(nativeDir).some(n => n.endsWith('.node'))) {
        return 'closed-free';
      }
    } catch {}
  }
  const parsed = parseSemver(pkgJson.version);
  if (parsed && (parsed.major > 2 || (parsed.major === 2 && parsed.minor >= 3))) {
    return 'closed-free';
  }
  return 'open-source';
}

export function detectInstalledPackageInfo(profileDir, fsImpl = fs) {
  const pkgDir = path.join(profileDir, 'node_modules', 'dsh-leaderteam');
  const pkgPath = path.join(pkgDir, 'package.json');
  if (!fsImpl.existsSync(pkgPath)) {
    return { installedLtVersion: null, installedTrack: null, installedBrandLabel: null };
  }
  try {
    const pkg = JSON.parse(fsImpl.readFileSync(pkgPath, 'utf8'));
    const version = String(pkg.version || '').trim() || null;
    const track = inferPackageTrackFromMeta(pkg, pkgDir, fsImpl);
    const brandLabel = track === 'closed-free' ? 'LT (闭源免费版)' : (track === 'open-source' ? 'OLT (开源维护版)' : null);
    return { installedLtVersion: version, installedTrack: track, installedBrandLabel: brandLabel };
  } catch {
    return { installedLtVersion: null, installedTrack: null, installedBrandLabel: null };
  }
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
    track: inferPackageTrackFromMeta(pkgJson),
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

function extractFailedPathFromMessage(msg) {
  const s = String(msg || '');
  const mQuoted = /(?:EPERM|EACCES|EBUSY|ENOENT|ELOCKED)[^'"\n]*['"]([^'"\r\n]+)['"]/i.exec(s);
  if (mQuoted) return mQuoted[1];
  const mAt = /(?:store at|virtual store at|dependencies at|open|unlink|rename|mkdir|rmdir|stat)\s+['"]?([A-Za-z]:\\[^'"\r\n]+|\/[^'"\r\n\s]+)['"]?/i.exec(s);
  if (mAt) return mAt[1];
  return null;
}

function extractFailedOperationFromMessage(msg) {
  const s = String(msg || '');
  const mSys = /(?:EPERM|EACCES|EBUSY|ENOENT)[^,\n]*,\s*([a-zA-Z_]+)\s+['"]/i.exec(s);
  if (mSys) return mSys[1];
  if (/ERR_PNPM_UNEXPECTED_STORE/i.test(s)) return 'pnpm store 路径校验';
  if (/ERR_PNPM_UNEXPECTED_VIRTUAL_STORE/i.test(s)) return 'pnpm virtual-store 路径校验';
  if (/plugin\s+--profile/i.test(s) || /pnpm\.mjs/i.test(s)) return 'dsh plugin add';
  return null;
}

export function translateStandaloneInstallError(rawError, context = {}) {
  const msg = String(
    rawError instanceof Error
      ? (rawError.rawOutput || rawError.message)
      : (rawError ?? ''),
  ).trim();
  const lower = msg.toLowerCase();
  const desktopRunning = Boolean(
    context.desktopRunning === true
    || rawError?.desktopRunning === true
    || rawError?.code === 'DESKTOP_CLIENT_RUNNING'
    || lower.includes('desktop_client_running')
    || lower.includes('检测到 deepseek harness 正在运行')
    || lower.includes('still running in this profile'),
  );
  const failedOperation = rawError?.failedOperation || context.failedOperation || extractFailedOperationFromMessage(msg);
  const failedPath = rawError?.failedPath || context.failedPath || extractFailedPathFromMessage(msg);

  if (
    lower.includes('initialize its profile') ||
    lower.includes('open deepseek harness desktop once') ||
    (lower.includes('desktop') && lower.includes('not initialized'))
  ) {
    return {
      code: 'DESKTOP_PROFILE_UNINITIALIZED',
      title: '官方桌面端尚未完成首次初始化',
      friendlyMessage: '新安装的 DeepSeek Harness 桌面客户端需要先打开一次以生成本地配置目录，然后才能安装插件。',
      suggestion: '请先点击上方「帮我打开 DSH 完成初始化」启动一次客户端，待主界面出现后完全退出，再重新安装。',
      failedOperation,
      failedPath,
      desktopRunning,
      canCloseDesktop: desktopRunning,
      canRetry: true,
      rawDetail: msg,
    };
  }
  if (desktopRunning && (
    rawError?.code === 'DESKTOP_CLIENT_RUNNING'
    || lower.includes('desktop_client_running')
    || lower.includes('检测到 deepseek harness 正在运行')
    || lower.includes('still running in this profile')
    || lower.includes('ebusy')
  )) {
    return {
      code: 'DESKTOP_CLIENT_RUNNING',
      title: '检测到 DeepSeek Harness 桌面端正在运行',
      friendlyMessage: '当前系统进程中仍有 DeepSeek Harness 桌面端（或托盘后台进程）在运行，会锁定插件目录。',
      suggestion: '请点击下方「一键安全关闭 DSH 并重新安装」，或手动右键退出系统托盘图标后再试。',
      failedOperation: failedOperation || '检测运行中客户端',
      failedPath,
      desktopRunning: true,
      canCloseDesktop: true,
      canRetry: true,
      rawDetail: msg,
    };
  }
  if (lower.includes('err_pnpm_unexpected_store') || lower.includes('err_pnpm_unexpected_virtual_store')) {
    const isVirtual = lower.includes('err_pnpm_unexpected_virtual_store');
    return {
      code: 'PNPM_STORE_MISMATCH',
      title: isVirtual ? '插件依赖目录曾迁移位置（pnpm virtual-store 路径不一致）' : 'pnpm 依赖仓库路径不一致（store-dir 冲突）',
      friendlyMessage: isVirtual
        ? '现有 node_modules 记录的虚拟仓库路径与当前目录不一致（常见于 .dsh 通过目录联接迁移过盘符）。'
        : '现有 node_modules 关联的 pnpm store 路径与当前环境不一致（常见于跨盘符 .dsh 目录联接或系统 pnpm 缓存变更）。',
      suggestion: '安装器已支持自动重建 node_modules（保留全部本地配置、凭据与历史会话）。请点击下方「重试安装」或展开诊断日志核对路径。',
      failedOperation: failedOperation || (isVirtual ? 'pnpm virtual-store 校验' : 'pnpm store 校验'),
      failedPath,
      desktopRunning,
      canCloseDesktop: desktopRunning,
      canRetry: true,
      rawDetail: msg,
    };
  }
  if (
    /\bebusy\b/i.test(msg)
    || /\belocked\b/i.test(msg)
    || lower.includes('resource busy')
    || lower.includes('being used by another process')
    || lower.includes('sharing violation')
  ) {
    return {
      code: 'FILE_LOCKED_EBUSY',
      title: '目标文件或目录正被其他程序占用（EBUSY）',
      friendlyMessage: failedPath
        ? `当前没有检测到 DSH 主界面运行，但路径 ${failedPath} 正被其他进程或安全软件占用。`
        : '目标插件目录中的文件正被其他进程、终端窗口或杀毒软件扫描句柄短暂占用。',
      suggestion: desktopRunning
        ? '检测到仍有 DSH 进程存在，请先点击下方「一键安全关闭 DSH 并重新安装」。'
        : '请关闭正在浏览或占用该目录的终端/编辑器（或等待杀毒软件扫描几秒），然后点击下方「重试安装」。',
      failedOperation: failedOperation || '文件写入/替换',
      failedPath,
      desktopRunning,
      canCloseDesktop: desktopRunning,
      canRetry: true,
      rawDetail: msg,
    };
  }
  if (
    /\beperm\b/i.test(msg)
    || /\beacces\b/i.test(msg)
    || lower.includes('access is denied')
    || lower.includes('permission denied')
    || lower.includes('拒绝访问')
  ) {
    return {
      code: 'PERMISSION_DENIED',
      title: '文件系统权限不足或访问被拒绝（EPERM / EACCES）',
      friendlyMessage: failedPath
        ? `执行「${failedOperation || '文件操作'}」时对路径 ${failedPath} 权限不足（非 DSH 正在运行导致）。`
        : '对插件目录、临时目录或 pnpm 仓库目录写入时被系统拒绝访问（非 DSH 正在运行导致）。',
      suggestion: '请确认当前账户对 .dsh 及其目录联接目标盘具备读写权限；如曾在管理员与普通用户权限间混用，请统一使用普通用户 PowerShell 重新运行安装器后重试。',
      failedOperation: failedOperation || '目录/文件权限校验',
      failedPath,
      desktopRunning,
      canCloseDesktop: desktopRunning,
      canRetry: true,
      rawDetail: msg,
    };
  }
  if (lower.includes('sha-256') || lower.includes('sha256')) {
    return {
      code: 'SHA256_MISMATCH',
      title: '安装包 SHA-256 完整性校验未通过',
      friendlyMessage: '下载的安装包与官方校验值不一致，已自动中止安装。',
      suggestion: '请点击重试下载，或选择已下载到本地的 dsh-leaderteam-*.tgz 离线安装包。',
      failedOperation: failedOperation || 'SHA-256 校验',
      failedPath,
      desktopRunning,
      canCloseDesktop: false,
      canRetry: true,
      rawDetail: msg,
    };
  }
  if (lower.includes('track_switch_confirmation_required') || lower.includes('跨发行线')) {
    return {
      code: 'TRACK_SWITCH_CONFIRMATION_REQUIRED',
      title: '需要确认切换产品发行线（LT ⇄ OLT）',
      friendlyMessage: msg,
      suggestion: '为防止误切换产品轨道，请勾选“确认切换发行线”后再继续；你的本地配置、凭据与历史会话将被完整保留。',
      failedOperation: '轨道一致性校验',
      failedPath: null,
      desktopRunning,
      canCloseDesktop: false,
      canRetry: false,
      rawDetail: msg,
    };
  }
  if (lower.includes('低于最低要求') || lower.includes('engines.dsh') || lower.includes('host_incompatible')) {
    return {
      code: 'INCOMPATIBLE_HOST',
      title: '当前 DeepSeek Harness 版本暂不兼容',
      friendlyMessage: msg,
      suggestion: '请先将官方 DeepSeek Harness 客户端升级至 0.2.2-rc.1 / 0.2.2-rc.5 或更新版本后再试。',
      failedOperation: '宿主版本兼容校验',
      failedPath: null,
      desktopRunning,
      canCloseDesktop: false,
      canRetry: false,
      rawDetail: msg,
    };
  }
  if (lower.includes('etimedout') || lower.includes('fetch failed') || lower.includes('econnreset') || lower.includes('enotfound')) {
    return {
      code: 'NETWORK_ERROR',
      title: '网络下载超时或连接中断',
      friendlyMessage: '访问 GitHub Releases 或下载资源时连接异常，原有配置未被改动。',
      suggestion: '请检查网络后点击「重试安装」，或切换“安装方式”加载已下载到本地的 .tgz 安装包。',
      failedOperation: failedOperation || '在线下载',
      failedPath,
      desktopRunning,
      canCloseDesktop: false,
      canRetry: true,
      rawDetail: msg,
    };
  }
  return {
    code: 'INSTALL_ERROR',
    title: '安装未完成',
    friendlyMessage: msg.split(/\r?\n/)[0] || '自动安装步骤未能完成，原有配置未被破坏。',
    suggestion: '请展开下方「完整诊断详情」核对具体报错，或点击重试 / 改用本地 .tgz 离线安装。',
    failedOperation: failedOperation || 'dsh plugin add',
    failedPath,
    desktopRunning,
    canCloseDesktop: desktopRunning,
    canRetry: true,
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
    const instInfo = detectInstalledPackageInfo(desktopProfileDir, fsImpl);

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
      installedLtVersion: instInfo.installedLtVersion,
      installedTrack: instInfo.installedTrack,
      installedBrandLabel: instInfo.installedBrandLabel,
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
    const instInfo = detectInstalledPackageInfo(webProfileDir, fsImpl);
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
      installedLtVersion: instInfo.installedLtVersion,
      installedTrack: instInfo.installedTrack,
      installedBrandLabel: instInfo.installedBrandLabel,
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
    defaultCacheDir: resolveDefaultDownloadCacheDir(home),
    targets,
    bundledTarballs,
    tracks: Object.values(TRACKS),
    verifiedVersions: VERIFIED_DSH_VERSIONS,
  };
}

function safeRealpath(targetPath, fsImpl = fs) {
  if (!targetPath) return targetPath;
  try {
    if (typeof fsImpl.realpathSync?.native === 'function') return fsImpl.realpathSync.native(targetPath);
    if (typeof fsImpl.realpathSync === 'function') return fsImpl.realpathSync(targetPath);
  } catch {}
  return path.resolve(targetPath);
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

function isHealthyExistingDir(targetPath, fsImpl = fs) {
  if (!targetPath) return false;
  try {
    return !isBrokenStandaloneDir(targetPath, fsImpl) && fsImpl.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

export function stripPnpmStoreVersionSuffix(storeDir) {
  return String(storeDir || '').trim().replace(/[\\/]+v\d+[\\/]*$/i, '');
}

export function readExistingProfilePnpmStore(profileDir, fsImpl = fs) {
  if (!profileDir) return null;
  const realProf = safeRealpath(profileDir, fsImpl);
  for (const dir of [realProf, profileDir]) {
    const modYaml = path.join(dir, 'node_modules', '.modules.yaml');
    if (!fsImpl.existsSync(modYaml)) continue;
    try {
      const raw = fsImpl.readFileSync(modYaml, 'utf8');
      let rawStoreDir = null;
      let virtualStoreDir = null;
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.storeDir === 'string') rawStoreDir = parsed.storeDir.trim();
        if (typeof parsed?.virtualStoreDir === 'string') virtualStoreDir = parsed.virtualStoreDir.trim();
      } catch {
        const mStore = /^\s*storeDir\s*:\s*['"]?(.+?)['"]?\s*$/m.exec(raw);
        if (mStore) rawStoreDir = mStore[1].trim();
        const mVirt = /^\s*virtualStoreDir\s*:\s*['"]?(.+?)['"]?\s*$/m.exec(raw);
        if (mVirt) virtualStoreDir = mVirt[1].trim();
      }
      if (!rawStoreDir) continue;
      const storeRoot = stripPnpmStoreVersionSuffix(rawStoreDir);
      const healthy = Boolean(
        storeRoot
        && (isHealthyExistingDir(storeRoot, fsImpl) || isHealthyExistingDir(rawStoreDir, fsImpl)),
      );
      return { rawStoreDir, storeRoot, virtualStoreDir, healthy };
    } catch {}
  }
  return null;
}

export function resolveHealthyStandalonePnpmEnv(baseEnv, dshHome, { profile = 'desktop', fsImpl = fs, platform = process.platform, explicitOverrideStore = null } = {}) {
  const nextEnv = { ...baseEnv, ...(dshHome ? { DSH_HOME: dshHome } : {}) };
  if (explicitOverrideStore && isHealthyExistingDir(explicitOverrideStore, fsImpl)) {
    nextEnv.NPM_CONFIG_STORE_DIR = explicitOverrideStore;
    delete nextEnv.npm_config_store_dir;
    return nextEnv;
  }

  // 1. Respect an existing healthy pnpm store already linked by this profile's node_modules/.modules.yaml
  //    (critical for NTFS Junction ~/.dsh -> E:\... where pnpm stores packages at E:\.pnpm-store\v11!)
  if (dshHome && profile) {
    const existing = readExistingProfilePnpmStore(path.join(dshHome, 'profiles', profile), fsImpl);
    if (existing?.healthy && existing.storeRoot) {
      nextEnv.NPM_CONFIG_STORE_DIR = existing.storeRoot;
      delete nextEnv.npm_config_store_dir;
      return nextEnv;
    }
  }

  const explicitStore = nextEnv.NPM_CONFIG_STORE_DIR || nextEnv.npm_config_store_dir || '';
  if (explicitStore && !isBrokenStandaloneDir(explicitStore, fsImpl)) return nextEnv;
  const candidates = [];
  if (explicitStore) candidates.push(explicitStore);
  if (nextEnv.PNPM_HOME) candidates.push(path.join(nextEnv.PNPM_HOME, 'store'));
  if (platform === 'win32' && nextEnv.LOCALAPPDATA) {
    candidates.push(path.join(nextEnv.LOCALAPPDATA, 'pnpm', 'store'));
  }
  if (candidates.some(p => isBrokenStandaloneDir(p, fsImpl) || isBrokenStandaloneDir(path.dirname(p), fsImpl))) {
    // Use resolved real path of dshHome so the fallback store stays on the same physical volume as node_modules
    const realHome = dshHome ? safeRealpath(dshHome, fsImpl) : os.tmpdir();
    const safePnpmHome = path.join(realHome, 'leaderteam', 'pnpm-home');
    const safeStore = path.join(safePnpmHome, 'store');
    try { fsImpl.mkdirSync(safeStore, { recursive: true }); } catch {}
    nextEnv.PNPM_HOME = safePnpmHome;
    nextEnv.NPM_CONFIG_STORE_DIR = safeStore;
    delete nextEnv.npm_config_store_dir;
  }
  return nextEnv;
}

function combineStandaloneProcOutput(proc) {
  const parts = [];
  const out = String(proc?.stdout || '').trim();
  const err = String(proc?.stderr || '').trim();
  if (out) parts.push(out);
  if (err && err !== out) parts.push(err);
  if (proc?.error) parts.push(String(proc.error.message || proc.error));
  return parts.join('\n').trim();
}

function runRawStandalonePluginAdd(target, tgzToInstall, execEnv, spawnSyncImpl = spawnSync) {
  if (target.kind === 'official-desktop' && target.clientExecutable && target.desktopHostCliJs) {
    return spawnSyncImpl(
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
    return spawnSyncImpl(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${quotedLine}"`], {
      encoding: 'utf8',
      windowsHide: true,
      windowsVerbatimArguments: true,
      shell: false,
      timeout: 180000,
      env: execEnv,
    });
  }
  return spawnSyncImpl(cmd, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 180000,
    env: execEnv,
  });
}

export function invokeStandalonePluginAdd(target, tgzToInstall, dshHome, { spawnSyncImpl = spawnSync, fsImpl = fs, env = process.env, platform = process.platform } = {}) {
  const execEnv = resolveHealthyStandalonePnpmEnv(env, dshHome, { profile: target.profile, fsImpl, platform });
  let proc = runRawStandalonePluginAdd(target, tgzToInstall, execEnv, spawnSyncImpl);
  if (proc.status === 0) return { ...proc, combinedOutput: combineStandaloneProcOutput(proc), recovered: null };

  let combined = combineStandaloneProcOutput(proc);

  // Recovery Step 1: If pnpm reports ERR_PNPM_UNEXPECTED_STORE with an existing healthy store, retry with that store
  const storeMatch = /ERR_PNPM_UNEXPECTED_STORE[\s\S]*?currently linked from the store at\s+["']([^"']+)["']/i.exec(combined);
  if (storeMatch) {
    const expectedRoot = stripPnpmStoreVersionSuffix(storeMatch[1]);
    if (expectedRoot && isHealthyExistingDir(expectedRoot, fsImpl) && expectedRoot !== execEnv.NPM_CONFIG_STORE_DIR) {
      const retryEnv = resolveHealthyStandalonePnpmEnv(env, dshHome, {
        profile: target.profile,
        fsImpl,
        platform,
        explicitOverrideStore: expectedRoot,
      });
      proc = runRawStandalonePluginAdd(target, tgzToInstall, retryEnv, spawnSyncImpl);
      combined = combineStandaloneProcOutput(proc);
      if (proc.status === 0) return { ...proc, combinedOutput: combined, recovered: 'matched-existing-store' };
    }
  }

  // Recovery Step 2: If pnpm still fails with ERR_PNPM_UNEXPECTED_STORE or ERR_PNPM_UNEXPECTED_VIRTUAL_STORE
  // (e.g. .dsh relocated via NTFS Junction or old store deleted), atomically relocate ONLY node_modules and retry.
  // Never touches cordis.yml, cordis.patch.yml, package.json, leaderteam/, .env, .credentials.yaml, or sessions/.
  if (/ERR_PNPM_UNEXPECTED_STORE|ERR_PNPM_UNEXPECTED_VIRTUAL_STORE/i.test(combined) && dshHome && target.profile) {
    const realProf = safeRealpath(path.join(dshHome, 'profiles', target.profile), fsImpl);
    const nmDir = path.join(realProf, 'node_modules');
    if (fsImpl.existsSync(nmDir)) {
      const bakDir = path.join(realProf, `node_modules.lt-bak-${Date.now()}`);
      let moved = false;
      try {
        fsImpl.renameSync(nmDir, bakDir);
        moved = true;
        // Re-resolve healthy store after moving stale node_modules away
        const freshEnv = resolveHealthyStandalonePnpmEnv(env, dshHome, { profile: target.profile, fsImpl, platform });
        const retryProc = runRawStandalonePluginAdd(target, tgzToInstall, freshEnv, spawnSyncImpl);
        const retryCombined = combineStandaloneProcOutput(retryProc);
        if (retryProc.status === 0) {
          try { fsImpl.rmSync(bakDir, { recursive: true, force: true }); } catch {}
          return { ...retryProc, combinedOutput: retryCombined, recovered: 'rebuilt-node-modules' };
        }
        // Retry failed: restore original node_modules atomically so nothing is lost
        try {
          if (fsImpl.existsSync(nmDir)) fsImpl.rmSync(nmDir, { recursive: true, force: true });
          fsImpl.renameSync(bakDir, nmDir);
          moved = false;
        } catch {}
        return { ...retryProc, combinedOutput: retryCombined || combined, recovered: null };
      } catch (mvErr) {
        if (moved && fsImpl.existsSync(bakDir) && !fsImpl.existsSync(nmDir)) {
          try { fsImpl.renameSync(bakDir, nmDir); } catch {}
        }
        combined = `${combined}\n[node_modules recovery error: ${mvErr instanceof Error ? mvErr.message : String(mvErr)}]`;
      }
    }
  }

  return { ...proc, combinedOutput: combined, recovered: null };
}

export async function closeRunningDesktopClient({
  platform = process.platform,
  spawnSyncImpl = spawnSync,
} = {}) {
  if (!isOfficialDesktopProcessRunning(platform, spawnSyncImpl)) {
    return { ok: true, closed: false, alreadyStopped: true, message: 'DeepSeek Harness 桌面客户端当前未在运行。' };
  }
  if (platform === 'win32') {
    // Graceful close first, then force-close remaining background tray process if still alive
    try { spawnSyncImpl('taskkill', ['/IM', 'DeepSeek Harness.exe', '/T'], { encoding: 'utf8', windowsHide: true, timeout: 4000 }); } catch {}
    const deadline1 = Date.now() + 2500;
    while (Date.now() < deadline1) {
      if (!isOfficialDesktopProcessRunning(platform, spawnSyncImpl)) {
        return { ok: true, closed: true, alreadyStopped: false, message: '已安全退出 DeepSeek Harness 桌面客户端。' };
      }
      await new Promise(r => setTimeout(r, 250));
    }
    try { spawnSyncImpl('taskkill', ['/F', '/IM', 'DeepSeek Harness.exe', '/T'], { encoding: 'utf8', windowsHide: true, timeout: 4000 }); } catch {}
    const deadline2 = Date.now() + 3500;
    while (Date.now() < deadline2) {
      if (!isOfficialDesktopProcessRunning(platform, spawnSyncImpl)) {
        return { ok: true, closed: true, alreadyStopped: false, message: '已完全退出 DeepSeek Harness 桌面客户端（含托盘进程）。' };
      }
      await new Promise(r => setTimeout(r, 250));
    }
    return { ok: false, closed: false, message: '未能自动关闭 DeepSeek Harness，请手动右键右下角托盘图标退出后再重试。' };
  }
  try { spawnSyncImpl('pkill', ['-TERM', '-f', 'deepseek-harness'], { encoding: 'utf8', timeout: 3000 }); } catch {}
  await new Promise(r => setTimeout(r, 1200));
  return { ok: true, closed: true, alreadyStopped: false, message: '已发送退出信号给 DeepSeek Harness。' };
}

export function resolveDefaultDownloadCacheDir(dshHome) {
  const base = dshHome ? path.resolve(dshHome) : path.join(os.homedir(), '.dsh');
  return path.join(base, 'leaderteam', 'installer-cache');
}

function persistApiKeyToCredentialsYaml(dshHome, envVarName, apiKeyValue) {
  try {
    const credFile = path.join(dshHome, '.credentials.yaml');
    const prev = fs.existsSync(credFile) ? fs.readFileSync(credFile, 'utf8') : '';
    const lines = prev ? prev.split(/\r?\n/) : [];
    const keyRe = new RegExp(`^\\s*${envVarName}\\s*:`);
    const kept = lines.filter(l => l.trim() && !keyRe.test(l));
    kept.push(`${envVarName}: ${JSON.stringify(String(apiKeyValue).trim())}`);
    const tmp = `${credFile}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, `${kept.join('\n')}\n`, { mode: 0o600 });
    fs.renameSync(tmp, credFile);
  } catch {}
}

function runRawStandalonePluginAddAsync(target, tgzToInstall, execEnv, onLog = null) {
  let cmd;
  let args;
  let spawnOpts;
  if (target.kind === 'official-desktop' && target.clientExecutable && target.desktopHostCliJs) {
    cmd = target.clientExecutable;
    args = ['--expose-internals', target.desktopHostCliJs, 'plugin', '--profile', target.profile, 'add', tgzToInstall];
    spawnOpts = {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: { ...execEnv, ELECTRON_RUN_AS_NODE: '1' },
    };
  } else {
    const rawCmd = target.cliUsesNode ? process.execPath : target.cliCommand;
    const rawArgs = target.cliUsesNode
      ? [target.cliCommand, 'plugin', '--profile', target.profile, 'add', tgzToInstall]
      : ['plugin', '--profile', target.profile, 'add', tgzToInstall];
    const isCmd = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(rawCmd));
    if (isCmd) {
      const quotedLine = [rawCmd, ...rawArgs].map(a => `"${String(a).replace(/"/g, '""')}"`).join(' ');
      cmd = process.env.ComSpec || 'cmd.exe';
      args = ['/d', '/s', '/c', `"${quotedLine}"`];
      spawnOpts = {
        windowsHide: true,
        windowsVerbatimArguments: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: execEnv,
      };
    } else {
      cmd = rawCmd;
      args = rawArgs;
      spawnOpts = {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: execEnv,
      };
    }
  }

  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    try {
      child = spawn(cmd, args, spawnOpts);
    } catch (err) {
      resolve({ status: 1, stdout: '', stderr: '', error: err });
      return;
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      resolve({ status: 1, stdout, stderr: `${stderr}\nETIMEDOUT: 安装命令超时 (180s)`.trim(), error: new Error('ETIMEDOUT') });
    }, 180_000);
    timer.unref?.();

    const feed = (buf, isErr) => {
      const txt = buf.toString('utf8');
      if (isErr) stderr += txt;
      else stdout += txt;
      if (typeof onLog === 'function') {
        for (const line of txt.split(/\r?\n/)) {
          const t = line.trim();
          if (t) onLog(t);
        }
      }
    };
    child.stdout?.on('data', d => feed(d, false));
    child.stderr?.on('data', d => feed(d, true));
    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr, error: err });
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: typeof code === 'number' ? code : 1, stdout, stderr, error: null });
    });
  });
}

export async function invokeStandalonePluginAddAsync(
  target,
  tgzToInstall,
  dshHome,
  { fsImpl = fs, env = process.env, platform = process.platform, onLog = null } = {},
) {
  const execEnv = resolveHealthyStandalonePnpmEnv(env, dshHome, { profile: target.profile, fsImpl, platform });
  let proc = await runRawStandalonePluginAddAsync(target, tgzToInstall, execEnv, onLog);
  if (proc.status === 0) return { ...proc, combinedOutput: combineStandaloneProcOutput(proc), recovered: null };

  let combined = combineStandaloneProcOutput(proc);
  const storeMatch = /ERR_PNPM_UNEXPECTED_STORE[\s\S]*?currently linked from the store at\s+["']([^"']+)["']/i.exec(combined);
  if (storeMatch) {
    const expectedRoot = stripPnpmStoreVersionSuffix(storeMatch[1]);
    if (expectedRoot && isHealthyExistingDir(expectedRoot, fsImpl) && expectedRoot !== execEnv.NPM_CONFIG_STORE_DIR) {
      onLog?.(`检测到已有 pnpm store (${expectedRoot})，自动切换重试…`);
      const retryEnv = resolveHealthyStandalonePnpmEnv(env, dshHome, {
        profile: target.profile,
        fsImpl,
        platform,
        explicitOverrideStore: expectedRoot,
      });
      proc = await runRawStandalonePluginAddAsync(target, tgzToInstall, retryEnv, onLog);
      combined = combineStandaloneProcOutput(proc);
      if (proc.status === 0) return { ...proc, combinedOutput: combined, recovered: 'matched-existing-store' };
    }
  }

  if (/ERR_PNPM_UNEXPECTED_STORE|ERR_PNPM_UNEXPECTED_VIRTUAL_STORE/i.test(combined) && dshHome && target.profile) {
    const realProf = safeRealpath(path.join(dshHome, 'profiles', target.profile), fsImpl);
    const nmDir = path.join(realProf, 'node_modules');
    if (fsImpl.existsSync(nmDir)) {
      onLog?.('检测到历史 node_modules 仓库路径冲突，自动安全重建依赖目录（完整保留配置与会话）…');
      const bakDir = path.join(realProf, `node_modules.lt-bak-${Date.now()}`);
      let moved = false;
      try {
        fsImpl.renameSync(nmDir, bakDir);
        moved = true;
        const freshEnv = resolveHealthyStandalonePnpmEnv(env, dshHome, { profile: target.profile, fsImpl, platform });
        const retryProc = await runRawStandalonePluginAddAsync(target, tgzToInstall, freshEnv, onLog);
        const retryCombined = combineStandaloneProcOutput(retryProc);
        if (retryProc.status === 0) {
          try { fsImpl.rmSync(bakDir, { recursive: true, force: true }); } catch {}
          return { ...retryProc, combinedOutput: retryCombined, recovered: 'rebuilt-node-modules' };
        }
        try {
          if (fsImpl.existsSync(nmDir)) fsImpl.rmSync(nmDir, { recursive: true, force: true });
          fsImpl.renameSync(bakDir, nmDir);
          moved = false;
        } catch {}
        return { ...retryProc, combinedOutput: retryCombined || combined, recovered: null };
      } catch (mvErr) {
        if (moved && fsImpl.existsSync(bakDir) && !fsImpl.existsSync(nmDir)) {
          try { fsImpl.renameSync(bakDir, nmDir); } catch {}
        }
        combined = `${combined}\n[node_modules recovery error: ${mvErr instanceof Error ? mvErr.message : String(mvErr)}]`;
      }
    }
  }
  return { ...proc, combinedOutput: combined, recovered: null };
}

async function readResponseWithProgress(pkgRes, declaredSizeBytes, onChunkProgress) {
  const hdrLen = Number(pkgRes.headers?.get?.('content-length') || 0);
  const totalBytes = hdrLen > 0 ? hdrLen : (Number(declaredSizeBytes) > 0 ? Number(declaredSizeBytes) : null);

  if (pkgRes.body && typeof pkgRes.body.getReader === 'function') {
    const reader = pkgRes.body.getReader();
    const chunks = [];
    let downloadedBytes = 0;
    const t0 = Date.now();
    let lastEmit = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        chunks.push(buf);
        downloadedBytes += buf.byteLength;
        const now = Date.now();
        if (now - lastEmit >= 120 || (totalBytes && downloadedBytes >= totalBytes)) {
          lastEmit = now;
          const elapsedSec = Math.max(0.05, (now - t0) / 1000);
          const speedBytesPerSec = Math.round(downloadedBytes / elapsedSec);
          const percent = totalBytes ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : null;
          const etaSec = (totalBytes && speedBytesPerSec > 0)
            ? Math.max(0, Math.round((totalBytes - downloadedBytes) / speedBytesPerSec))
            : null;
          onChunkProgress?.({ downloadedBytes, totalBytes, percent, speedBytesPerSec, etaSec });
        }
      }
    }
    const finalBuf = Buffer.concat(chunks);
    const elapsedSec = Math.max(0.05, (Date.now() - t0) / 1000);
    onChunkProgress?.({
      downloadedBytes: finalBuf.byteLength,
      totalBytes: totalBytes || finalBuf.byteLength,
      percent: 100,
      speedBytesPerSec: Math.round(finalBuf.byteLength / elapsedSec),
      etaSec: 0,
    });
    return finalBuf;
  }

  const buf = Buffer.from(await pkgRes.arrayBuffer());
  onChunkProgress?.({
    downloadedBytes: buf.byteLength,
    totalBytes: totalBytes || buf.byteLength,
    percent: 100,
    speedBytesPerSec: null,
    etaSec: 0,
  });
  return buf;
}

export async function downloadAndInstallStandalone({
  targetId = null,
  customPath = null,
  track = 'closed-free',
  releaseTag = null,
  includePrerelease = false,
  mode = 'install', // 'install' | 'repair' | 'download-only'
  confirmTrackSwitch = false,
  localTgzPath = null,
  cacheDir = null,
  apiKeyEnvVar = '',
  apiKey = '',
  dshHome = null,
  fetchImpl = globalThis.fetch,
  runner = null,
  spawnSyncImpl = spawnSync,
  onProgress = null,
} = {}) {
  const emit = (patch) => {
    try { onProgress?.({ at: new Date().toISOString(), ...patch }); } catch {}
  };
  const isDownloadOnly = mode === 'download-only';

  emit({ stage: 'checking', stageLabel: '检测本机 DSH 环境与目录路径', percent: 5 });
  const snap = scanDshTargets({ customPath, dshHome, spawnSyncImpl });
  const effectiveCacheDir = cacheDir && String(cacheDir).trim()
    ? path.resolve(String(cacheDir).trim())
    : resolveDefaultDownloadCacheDir(snap.dshHome);

  const target = (targetId ? snap.targets.find(t => t.id === targetId) : null) || snap.targets[0] || null;
  if (!isDownloadOnly) {
    if (!target) {
      throw new Error('未检测到本机已安装的 DeepSeek Harness，请先安装官方客户端（>= 0.2.2-rc.1），或在页面手动指定安装目录后点击“重新扫描”。');
    }
    if (!target.compatible) {
      throw new Error(`当前 DSH 版本 (${target.dshVersion || '未知'}) 低于最低要求 0.2.2-alpha.2，请先更新 DSH 客户端。`);
    }
    if (target.kind === 'official-desktop' && target.desktopRunning) {
      const err = new Error('DESKTOP_CLIENT_RUNNING: 检测到 DeepSeek Harness 正在运行，请先点击“一键安全关闭 DSH”或手动退出客户端后再开始安装。');
      err.code = 'DESKTOP_CLIENT_RUNNING';
      err.desktopRunning = true;
      err.failedOperation = '检测运行中客户端';
      throw err;
    }
  }

  let tgzToInstall = localTgzPath ? path.resolve(localTgzPath) : null;
  let versionInstalled = null;
  let resolvedTrack = TRACKS[track] ? track : 'closed-free';
  let resolvedTag = releaseTag ? String(releaseTag).trim() : null;
  let sha256 = null;
  let sha256Verified = false;
  let cacheHit = false;

  if (tgzToInstall) {
    emit({ stage: 'verifying', stageLabel: '校验本地离线安装包清单与兼容性', percent: 35, cacheDir: effectiveCacheDir });
    const pkgMeta = inspectStandaloneTgz(tgzToInstall);
    if (target && pkgMeta.enginesDsh && target.dshVersion && !satisfiesStandaloneRange(target.dshVersion, pkgMeta.enginesDsh)) {
      throw new Error(`HOST_INCOMPATIBLE: 当前 DSH 版本 (${target.dshVersion}) 不满足安装包要求 (${pkgMeta.enginesDsh})。`);
    }
    if (pkgMeta.track) resolvedTrack = pkgMeta.track;
    if (target && target.installedTrack && resolvedTrack && target.installedTrack !== resolvedTrack && !confirmTrackSwitch) {
      const fromLbl = TRACKS[target.installedTrack]?.shortLabel || target.installedTrack;
      const toLbl = TRACKS[resolvedTrack]?.shortLabel || resolvedTrack;
      throw new Error(`TRACK_SWITCH_CONFIRMATION_REQUIRED: 当前环境已安装 ${fromLbl} (v${target.installedLtVersion || '?'})，所选离线包属于 ${toLbl}，跨发行线切换需显式确认。`);
    }
    sha256 = crypto.createHash('sha256').update(fs.readFileSync(tgzToInstall)).digest('hex');
    versionInstalled = pkgMeta.version;
  } else {
    if (!isDownloadOnly && target && target.installedTrack && target.installedTrack !== resolvedTrack && !confirmTrackSwitch) {
      const fromLbl = TRACKS[target.installedTrack]?.shortLabel || target.installedTrack;
      const toLbl = TRACKS[resolvedTrack]?.shortLabel || resolvedTrack;
      throw new Error(`TRACK_SWITCH_CONFIRMATION_REQUIRED: 当前环境已安装 ${fromLbl} (v${target.installedLtVersion || '?'})，切换至 ${toLbl} 需显式确认（配置与历史数据会完整保留）。`);
    }
    const tMeta = TRACKS[resolvedTrack] || TRACKS['closed-free'];
    emit({ stage: 'checking', stageLabel: `查询 ${tMeta.shortLabel} 官方发行元数据…`, percent: 12, cacheDir: effectiveCacheDir });
    const relRes = await fetchImpl(tMeta.apiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LT-Unified-Downloader' },
    });
    if (!relRes.ok) throw new Error(`获取 GitHub Releases 列表失败 (HTTP ${relRes.status})`);
    const releases = await relRes.json();
    const explicitPreTag = Boolean(resolvedTag && /-(?:rc|alpha|beta|preview)/i.test(resolvedTag));
    const wantPrerelease = Boolean(includePrerelease) || explicitPreTag;
    let available = listPlatformReleases(releases, snap.platform, { includePrerelease: wantPrerelease });
    let picked = null;
    if (resolvedTag) {
      picked = available.find(x => x.tag.toLowerCase() === resolvedTag.toLowerCase() || x.version === resolvedTag.replace(/^v/i, '')) || null;
      if (!picked && !wantPrerelease) {
        available = listPlatformReleases(releases, snap.platform, { includePrerelease: true });
        picked = available.find(x => x.tag.toLowerCase() === resolvedTag.toLowerCase() || x.version === resolvedTag.replace(/^v/i, '')) || null;
      }
      if (!picked) {
        throw new Error(`未在 ${tMeta.shortLabel} 中找到适配当前系统 (${snap.platform}) 的版本 ${resolvedTag}`);
      }
    } else if (mode === 'repair' && target?.installedLtVersion && target?.installedTrack === resolvedTrack) {
      picked = available.find(x => x.version === target.installedLtVersion) || available.find(x => !x.prerelease) || available[0] || null;
    } else {
      picked = available.find(x => !x.prerelease) || available[0] || null;
    }
    const rel = picked?.rel ?? null;
    if (!rel) throw new Error(`未找到适配当前系统 (${snap.platform}) 的正式版 .tgz 安装包`);
    resolvedTag = picked.tag;
    const tgzAsset = selectMainPackageAsset(rel.assets, snap.platform);
    if (!tgzAsset) throw new Error(`版本 ${picked.tag} 缺少可用的 dsh-leaderteam-*.tgz 主安装包`);
    const sumsAsset = rel.assets.find(a => /^SHA256SUMS/i.test(a.name));

    let expectedSha = null;
    if (typeof tgzAsset.digest === 'string' && tgzAsset.digest.toLowerCase().startsWith('sha256:')) {
      expectedSha = tgzAsset.digest.slice('sha256:'.length).trim().toLowerCase();
    }
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

    fs.mkdirSync(effectiveCacheDir, { recursive: true });
    const cachedPath = path.join(effectiveCacheDir, tgzAsset.name);
    let buf = null;

    // Verified cache reuse (D02): if cached .tgz matches expectedSha, skip network download completely!
    if (expectedSha && fs.existsSync(cachedPath)) {
      try {
        const cachedBuf = fs.readFileSync(cachedPath);
        const cachedSha = crypto.createHash('sha256').update(cachedBuf).digest('hex');
        if (cachedSha === expectedSha) {
          buf = cachedBuf;
          sha256 = cachedSha;
          sha256Verified = true;
          cacheHit = true;
          emit({
            stage: 'verifying',
            stageLabel: `命中本地已校验缓存（${tgzAsset.name}），免重复下载`,
            percent: 55,
            downloadedBytes: buf.byteLength,
            totalBytes: buf.byteLength,
            cacheHit: true,
            cacheDir: effectiveCacheDir,
            logLine: `[cache] SHA-256 verified hit: ${cachedPath}`,
          });
        }
      } catch {}
    }

    if (!buf) {
      emit({
        stage: 'downloading',
        stageLabel: `正在下载 ${tgzAsset.name}…`,
        percent: 15,
        downloadedBytes: 0,
        totalBytes: tgzAsset.size ?? null,
        cacheDir: effectiveCacheDir,
        logLine: `[download] GET ${tgzAsset.browser_download_url}`,
      });
      const pkgRes = await fetchImpl(tgzAsset.browser_download_url);
      if (!pkgRes.ok) throw new Error(`下载安装包失败 (HTTP ${pkgRes.status})`);
      buf = await readResponseWithProgress(pkgRes, tgzAsset.size ?? null, p => {
        emit({
          stage: 'downloading',
          stageLabel: `正在下载 ${tgzAsset.name}…`,
          percent: p.percent != null ? Math.round(15 + (p.percent * 0.40)) : null,
          downloadedBytes: p.downloadedBytes,
          totalBytes: p.totalBytes,
          speedBytesPerSec: p.speedBytesPerSec,
          etaSec: p.etaSec,
          cacheDir: effectiveCacheDir,
        });
      });
      emit({ stage: 'verifying', stageLabel: '正在校验 SHA-256 与插件结构…', percent: 58, cacheDir: effectiveCacheDir });
      const actualSha = crypto.createHash('sha256').update(buf).digest('hex');
      if (expectedSha && actualSha !== expectedSha) {
        throw new Error('安装包 SHA-256 校验未通过，已中止安装');
      }
      sha256 = actualSha;
      sha256Verified = Boolean(expectedSha);
      const tmpPath = `${cachedPath}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmpPath, buf);
      fs.renameSync(tmpPath, cachedPath);
    }

    const pkgMeta = inspectStandaloneTgz(buf);
    if (target && pkgMeta.enginesDsh && target.dshVersion && !satisfiesStandaloneRange(target.dshVersion, pkgMeta.enginesDsh)) {
      throw new Error(`HOST_INCOMPATIBLE: 当前 DSH 版本 (${target.dshVersion}) 不满足安装包要求 (${pkgMeta.enginesDsh})。`);
    }
    tgzToInstall = cachedPath;
    versionInstalled = pkgMeta.version || parsePlatformReleaseTag(rel.tag_name)?.version || String(rel.tag_name || '').replace(/^v/i, '');
  }

  if (isDownloadOnly) {
    emit({
      stage: 'ready',
      stageLabel: '下载并校验完成（仅下载模式）',
      percent: 100,
      cacheHit,
      cacheDir: effectiveCacheDir,
      logLine: `[done] Saved verified tarball to ${tgzToInstall} (sha256: ${sha256})`,
    });
    return {
      ok: true,
      mode: 'download-only',
      track: resolvedTrack,
      brand: TRACKS[resolvedTrack]?.brand || 'LT',
      releaseTag: resolvedTag,
      target,
      versionInstalled,
      tgzToInstall,
      cacheDir: effectiveCacheDir,
      cacheHit,
      sha256,
      sha256Verified,
      desktopPatchHygiene: null,
    };
  }

  emit({
    stage: 'installing',
    stageLabel: `正在安装 ${TRACKS[resolvedTrack]?.brand || 'LT'} v${versionInstalled || ''} 到 ${target.profile} profile…`,
    percent: 68,
    targetDir: target.installDir,
    dshHome: snap.dshHome,
    logLine: `[install] dsh plugin --profile ${target.profile} add ${tgzToInstall}`,
  });

  if (typeof runner === 'function') {
    await runner({ target, tgzToInstall, dshHome: snap.dshHome, mode, track: resolvedTrack, releaseTag: resolvedTag });
  } else {
    // Use non-blocking async spawn for real installs (keeps SSE progress responsive!); keep custom mock `spawnSyncImpl` path for unit tests
    const proc = spawnSyncImpl !== spawnSync
      ? invokeStandalonePluginAdd(target, tgzToInstall, snap.dshHome, { spawnSyncImpl })
      : await invokeStandalonePluginAddAsync(target, tgzToInstall, snap.dshHome, {
        onLog: line => emit({ stage: 'installing', stageLabel: '正在执行插件安装与依赖链接…', percent: 78, logLine: line }),
      });
    if (proc.status !== 0) {
      const combined = proc.combinedOutput || combineStandaloneProcOutput(proc) || `安装退出码 ${proc.status}`;
      const err = new Error(combined);
      err.rawOutput = combined;
      err.exitCode = proc.status;
      err.failedOperation = extractFailedOperationFromMessage(combined) || 'dsh plugin add';
      err.failedPath = extractFailedPathFromMessage(combined);
      err.desktopRunning = isOfficialDesktopProcessRunning(snap.platform, spawnSyncImpl);
      throw err;
    }
  }

  emit({ stage: 'configuring', stageLabel: '正在同步桌面端补丁与初始配置…', percent: 90, dshHome: snap.dshHome });
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
    persistApiKeyToCredentialsYaml(snap.dshHome, apiKeyEnvVar, apiKey);
  }

  emit({
    stage: 'ready',
    stageLabel: `${TRACKS[resolvedTrack]?.brand || 'LT'} v${versionInstalled || ''} 安装完成`,
    percent: 100,
    cacheHit,
    cacheDir: effectiveCacheDir,
    dshHome: snap.dshHome,
    logLine: `[ready] Installed ${TRACKS[resolvedTrack]?.brand || 'LT'} v${versionInstalled || ''} into ${path.join(snap.dshHome, 'profiles', target.profile)}`,
  });

  return {
    ok: true,
    mode: mode === 'repair' ? 'repair' : 'install',
    track: resolvedTrack,
    brand: TRACKS[resolvedTrack]?.brand || 'LT',
    releaseTag: resolvedTag,
    target,
    versionInstalled,
    tgzToInstall,
    cacheDir: effectiveCacheDir,
    cacheHit,
    sha256,
    sha256Verified,
    dshHome: snap.dshHome,
    desktopPatchHygiene,
  };
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
<html lang="zh-CN" data-theme="white">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Leader Team 统一下载与安装器 (LT / OLT)</title>
<style>
  :root {
    --bg:#F2F3F0; --surface:#FFFFFF; --surface-alt:#F7F8F6; --ink:#171A1D; --muted:#5C656E;
    --accent:#3D6B5A; --accent-hover:#2F5547; --accent-soft:rgba(61,107,90,0.09);
    --ok:#247349; --ok-bg:#ECF7F0; --ok-line:#BDE2CA;
    --warn:#9A6208; --warn-bg:#FFF8EB; --warn-line:#EED49B;
    --err:#B2372C; --err-bg:#FDF0EE; --err-line:#EFC2BC;
    --line:#DFE3DD; --radius:10px;
    --mono:"JetBrains Mono","Cascadia Code",Consolas,ui-monospace,monospace;
  }
  [data-theme="dark"] {
    --bg:#111315; --surface:#181B1F; --surface-alt:#1F2429; --ink:#E7ECEF; --muted:#95A0AA;
    --accent:#5FA58B; --accent-hover:#73B89E; --accent-soft:rgba(95,165,139,0.14);
    --ok:#55B57D; --ok-bg:rgba(85,181,125,0.12); --ok-line:rgba(85,181,125,0.35);
    --warn:#E0A443; --warn-bg:rgba(224,164,67,0.12); --warn-line:rgba(224,164,67,0.35);
    --err:#E36B60; --err-bg:rgba(227,107,96,0.12); --err-line:rgba(227,107,96,0.35);
    --line:#2B3138;
  }
  [data-theme="heluoxu"] {
    --bg:#F6F1E6; --surface:#FFFDF8; --surface-alt:#F8F4EA; --ink:#1E221E; --muted:#646258;
    --accent:#3B6354; --accent-hover:#2D4E42; --accent-soft:rgba(59,99,84,0.10);
    --ok:#2E6A47; --ok-bg:#EEF6F0; --ok-line:#C2DEC9;
    --warn:#9C6214; --warn-bg:#FCF5E6; --warn-line:#E9D09D;
    --err:#9E3B33; --err-bg:#FBEFEC; --err-line:#E7C1BB;
    --line:#E3DAC9;
  }
  * { box-sizing:border-box; }
  body { font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei UI",sans-serif; background:var(--bg); color:var(--ink); max-width:920px; margin:24px auto 64px; padding:0 18px; line-height:1.55; }
  .hero { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:20px 24px; margin-bottom:16px; display:flex; flex-direction:column; gap:8px; }
  .hero-top { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .hero h1 { margin:0; font-size:20px; font-weight:700; letter-spacing:-0.01em; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .hero p { margin:0; font-size:13px; color:var(--muted); }
  .pill { display:inline-flex; align-items:center; padding:2px 9px; border-radius:99px; font-size:11.5px; font-weight:600; background:var(--accent-soft); color:var(--accent); border:1px solid var(--line); }
  .theme-seg { display:inline-flex; border:1px solid var(--line); border-radius:7px; overflow:hidden; background:var(--surface-alt); }
  .theme-seg button { border:0; border-radius:0; padding:5px 10px; font-size:12px; font-weight:500; background:transparent; color:var(--muted); }
  .theme-seg button[aria-pressed="true"] { background:var(--surface); color:var(--ink); font-weight:600; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:18px 22px; margin-bottom:14px; }
  .card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
  .card h2 { margin:0; font-size:15.5px; font-weight:650; }
  .step-tag { font-size:11px; font-weight:600; color:var(--accent); text-transform:uppercase; letter-spacing:0.06em; }
  .target-item { border:1.5px solid var(--line); border-radius:8px; padding:12px 15px; margin-bottom:10px; cursor:pointer; background:var(--surface); transition:border-color .15s; }
  .target-item.selected { border-color:var(--accent); background:var(--accent-soft); }
  .track-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px; }
  .path-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
  @media (max-width:680px) { .track-grid, .path-grid { grid-template-columns:1fr; } }
  .track-card { border:1.5px solid var(--line); border-radius:8px; padding:12px 14px; cursor:pointer; background:var(--surface); }
  .track-card.selected { border-color:var(--accent); background:var(--accent-soft); }
  .track-card b { display:block; font-size:14px; margin-bottom:3px; }
  .track-card span { font-size:12.5px; color:var(--muted); }
  .badge { display:inline-flex; align-items:center; padding:2px 9px; border-radius:99px; font-size:11.5px; font-weight:600; }
  .badge.ok { background:var(--ok-bg); color:var(--ok); }
  .badge.warn { background:var(--warn-bg); color:var(--warn); }
  .badge.err { background:var(--err-bg); color:var(--err); }
  .field { margin-top:11px; }
  .field label { display:block; font-size:12.5px; font-weight:600; margin-bottom:5px; color:var(--ink); }
  input, select { padding:8px 11px; border:1px solid var(--line); border-radius:7px; width:100%; font-size:13.5px; background:var(--surface); color:var(--ink); }
  input.mono { font-family:var(--mono); font-size:12.5px; }
  input[type="checkbox"] { width:auto; padding:0; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  button, a.btn-link { background:var(--accent); color:#fff; border:1px solid transparent; border-radius:7px; padding:8px 15px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; text-decoration:none; display:inline-flex; align-items:center; gap:6px; }
  button:hover:not(:disabled), a.btn-link:hover { background:var(--accent-hover); }
  button.secondary, a.btn-link.secondary { background:var(--surface-alt); color:var(--ink); border-color:var(--line); }
  button.secondary:hover:not(:disabled) { border-color:var(--accent); }
  button.warn-btn { background:var(--warn); color:#fff; }
  button:disabled { opacity:0.55; cursor:not-allowed; }
  .alert { padding:12px 15px; border-radius:8px; margin-top:10px; font-size:13px; }
  .alert.ok { background:var(--ok-bg); color:var(--ok); border:1px solid var(--ok-line); }
  .alert.warn { background:var(--warn-bg); color:var(--warn); border:1px solid var(--warn-line); }
  .alert.err { background:var(--err-bg); color:var(--err); border:1px solid var(--err-line); }
  .muted { color:var(--muted); font-size:12px; }
  .mono { font-family:var(--mono); }
  .num { font-variant-numeric:tabular-nums; }
  .path-summary { background:var(--surface-alt); border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-top:10px; font-size:12px; display:grid; gap:4px; }
  .prog-panel { margin-top:12px; padding:14px 16px; border:1px solid var(--line); border-radius:8px; background:var(--surface-alt); display:none; }
  .prog-panel.active { display:block; }
  .stages { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin-bottom:10px; }
  @media (max-width:680px) { .stages { grid-template-columns:repeat(3,1fr); } }
  .st-pill { font-size:11.5px; text-align:center; padding:4px 6px; border-radius:6px; border:1px solid var(--line); color:var(--muted); background:var(--surface); }
  .st-pill.cur { border-color:var(--accent); color:var(--accent); font-weight:650; background:var(--accent-soft); }
  .st-pill.done { border-color:var(--ok-line); color:var(--ok); background:var(--ok-bg); }
  .st-pill.fail { border-color:var(--err-line); color:var(--err); background:var(--err-bg); }
  .bar-track { height:9px; border-radius:999px; background:var(--line); overflow:hidden; position:relative; }
  .bar-fill { height:100%; background:var(--accent); width:0%; transition:width .18s ease; }
  .bar-fill.indeterminate { width:35%; animation:lt-slide 1.2s infinite ease-in-out; }
  @keyframes lt-slide { 0% { transform:translateX(-110%); } 100% { transform:translateX(320%); } }
  .prog-meta { display:flex; justify-content:space-between; gap:10px; margin-top:7px; font-size:12px; color:var(--muted); flex-wrap:wrap; }
  .live-log { margin-top:8px; max-height:150px; overflow:auto; font-family:var(--mono); font-size:11.5px; background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:8px 10px; white-space:pre-wrap; word-break:break-all; color:var(--muted); }
</style>
</head>
<body>
<div class="hero">
  <div class="hero-top">
    <h1>Leader Team 统一下载与安装器 <span class="pill" id="osPill">检测平台中…</span></h1>
    <div class="theme-seg" role="group" aria-label="界面主题">
      <button type="button" data-theme-pick="white" aria-pressed="true">宣白</button>
      <button type="button" data-theme-pick="dark" aria-pressed="false">墨夜</button>
      <button type="button" data-theme-pick="heluoxu" aria-pressed="false">河洛序</button>
    </div>
  </div>
  <p>统一支持 LT（闭源免费版）与 OLT（开源维护版）× Windows / Linux 四条发行线：全路径透明可配置、实时字节流下载进度与校验缓存复用，零 AI 辅助一键安装。</p>
</div>

<div class="card">
  <div class="card-head">
    <h2>第一步：环境检测与目录路径配置（全透明可修改）</h2>
    <span class="step-tag">Step 1 / 3</span>
  </div>
  <div id="env">正在扫描本机环境…</div>
  <div class="path-grid">
    <div class="field" style="margin-top:4px">
      <label for="customDshInput">手动指定 DeepSeek Harness 安装目录（可选）</label>
      <input id="customDshInput" class="mono" type="text" placeholder="例如 D:\\Apps\\DeepSeek-Harness" />
    </div>
    <div class="field" style="margin-top:4px">
      <label for="dshHomeInput">DSH 数据与插件根目录 (DSH_HOME)</label>
      <input id="dshHomeInput" class="mono" type="text" placeholder="默认 ~/.dsh（可修改为自定义数据目录）" />
    </div>
  </div>
  <div class="field">
    <label for="cacheDirInput">安装包下载与校验缓存目录（支持 SHA-256 命中免重复下载）</label>
    <div class="row">
      <input id="cacheDirInput" class="mono" type="text" placeholder="默认 <DSH_HOME>/leaderteam/installer-cache" style="flex:1" />
      <button id="btnRescan" class="secondary" type="button">应用路径并重新扫描</button>
    </div>
  </div>
  <div class="path-summary mono" id="pathSummary">正在解析生效路径…</div>
</div>

<div class="card">
  <div class="card-head">
    <h2>第二步：选择产品发行线、版本与安装方式</h2>
    <span class="step-tag">Step 2 / 3</span>
  </div>
  <div class="track-grid" id="trackGrid">
    <div class="track-card selected" data-track="closed-free">
      <b>Leader Team (LT · 闭源免费版)</b>
      <span>预编译 Rust 映射核心 + LT 独立中转站 + 河洛工作台 + 衡账三源对账</span>
    </div>
    <div class="track-card" data-track="open-source">
      <b>Open Leader Team (OLT · 开源版)</b>
      <span>纯 Node.js ESM 核心，Apache-2.0 开源协议</span>
    </div>
  </div>

  <div class="field">
    <label for="modeSelect">安装方式</label>
    <select id="modeSelect">
      <option value="online">在线下载并安装指定版本（实时进度 + SHA-256 校验 + 缓存复用）</option>
      <option value="repair">修复安装（保留全部本地配置、凭据与历史会话）</option>
      <option value="download-only">仅下载并校验安装包到缓存目录（暂不执行安装）</option>
      <option value="upload-tgz">上传本地 .tgz 离线安装包…</option>
      <option value="path-tgz">输入本地 .tgz 安装包完整路径…</option>
    </select>
  </div>

  <div class="field" id="versionRow">
    <label for="versionSelect">选择版本（已按当前操作系统自动过滤）</label>
    <div class="row">
      <select id="versionSelect" style="flex:1"><option value="">正在读取官方 Release 列表…</option></select>
      <button id="btnRefreshRel" class="secondary" type="button">刷新版本列表</button>
    </div>
    <label class="row" style="margin-top:6px;cursor:pointer;font-size:12.5px;color:var(--muted)">
      <input type="checkbox" id="chkIncludePrerelease" />
      <span>显示测试版 / RC 候选版本（Pre-release，如 windows-v2.6.3-rc.1）</span>
    </label>
    <div class="muted" id="versionMeta" style="margin-top:4px"></div>
  </div>

  <div class="field" id="bundledRow" style="display:none">
    <label for="bundledSelect">检测到同目录离线安装包</label>
    <select id="bundledSelect"></select>
  </div>

  <div class="field" id="uploadRow" style="display:none">
    <label for="tgzFileInput">选择本地 <code>dsh-leaderteam-*.tgz</code> 安装包</label>
    <input id="tgzFileInput" type="file" accept=".tgz,application/gzip" />
  </div>

  <div class="field" id="localPathRow" style="display:none">
    <label for="localTgzPathInput">填写本地 <code>.tgz</code> 安装包完整路径</label>
    <input id="localTgzPathInput" class="mono" type="text" placeholder="例如 D:\\Downloads\\dsh-leaderteam-2.6.3.tgz" />
  </div>

  <div id="trackSwitchBox" class="alert warn" style="display:none">
    <strong id="trackSwitchTitle">检测到跨发行线切换（LT ⇄ OLT）</strong>
    <div id="trackSwitchDesc" style="margin-top:4px"></div>
    <label class="row" style="margin-top:8px;cursor:pointer;font-weight:600">
      <input type="checkbox" id="chkConfirmSwitch" />
      <span>我确认切换产品发行线（安装器将保留原有本地配置与历史数据）</span>
    </label>
  </div>

  <div class="field">
    <label for="envVar">可选：预设初始模型 API Key（同时写入 <code>.env</code> 与 <code>.credentials.yaml</code>，也可进界面后再配）</label>
    <div class="row">
      <select id="envVar" style="width:260px">
        <option value="">暂不填写（推荐进控制台配置）</option>
        <option value="DEEPSEEK_API_KEY">DeepSeek (DEEPSEEK_API_KEY)</option>
        <option value="DASHSCOPE_API_KEY">阿里云百炼 Qwen (DASHSCOPE_API_KEY)</option>
        <option value="ZHIPU_API_KEY">智谱 GLM (ZHIPU_API_KEY)</option>
        <option value="OPENAI_API_KEY">OpenAI (OPENAI_API_KEY)</option>
        <option value="LEADERTEAM_MAGPIE_KEY">Magpie 网关 (LEADERTEAM_MAGPIE_KEY)</option>
      </select>
      <input id="apiKey" class="mono" type="password" placeholder="粘贴 API Key（仅存本机）" style="flex:1" />
    </div>
  </div>
</div>

<div class="card">
  <div class="card-head">
    <h2>第三步：实时进度与启动</h2>
    <span class="step-tag">Step 3 / 3</span>
  </div>
  <div class="row">
    <button id="btnInstall" type="button">立即下载校验并安装</button>
    <button id="btnLaunch" class="secondary" type="button" style="display:none">立即启动 DeepSeek Harness 客户端</button>
  </div>

  <div class="prog-panel" id="progPanel" data-testid="lt-downloader-progress">
    <div class="stages" id="stageRow">
      <div class="st-pill" data-st="checking">1. 检测</div>
      <div class="st-pill" data-st="downloading">2. 下载</div>
      <div class="st-pill" data-st="verifying">3. 校验</div>
      <div class="st-pill" data-st="installing">4. 安装</div>
      <div class="st-pill" data-st="configuring">5. 配置</div>
      <div class="st-pill" data-st="ready">6. 完成</div>
    </div>
    <div class="bar-track"><div class="bar-fill" id="progBar"></div></div>
    <div class="prog-meta num">
      <span id="progLabel">准备就绪</span>
      <span id="progStats"></span>
    </div>
    <details id="liveLogWrap" style="margin-top:8px">
      <summary style="cursor:pointer;font-size:12px;font-weight:600">实时执行日志</summary>
      <div class="live-log" id="liveLog"></div>
    </details>
  </div>

  <div class="muted" style="margin-top:8px">提示：安装完成后默认进入 Leader Team 河洛序工作台（可随时一键无刷新切换至 DSH 增强前端）；后续小版本更新可在设置页一键完成。</div>
  <div id="msg"></div>
</div>

<script>
(function() {
  const tok = ${JSON.stringify(token)};
  let state = null;
  let tid = null;
  let selectedTrack = 'closed-free';
  let trackInitializedFromInstalled = false;
  const releasesCache = {};
  const STAGE_ORDER = ['checking', 'downloading', 'verifying', 'installing', 'configuring', 'ready'];

  // Theme initialization
  const savedTheme = localStorage.getItem('lt.installer.theme') || 'white';
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('lt.installer.theme', t);
    document.querySelectorAll('[data-theme-pick]').forEach(b => {
      b.setAttribute('aria-pressed', b.getAttribute('data-theme-pick') === t ? 'true' : 'false');
    });
  }
  applyTheme(savedTheme);
  document.querySelectorAll('[data-theme-pick]').forEach(b => {
    b.onclick = () => applyTheme(b.getAttribute('data-theme-pick'));
  });

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtBytes(b) {
    if (b == null || !Number.isFinite(Number(b))) return '';
    const v = Number(b);
    if (v >= 1048576) return (v / 1048576).toFixed(2) + ' MB';
    if (v >= 1024) return (v / 1024).toFixed(1) + ' KB';
    return v + ' B';
  }
  function currentTarget() {
    if (!state || !state.targets || !state.targets.length) return null;
    return state.targets.find(t => t.id === tid) || state.targets[0];
  }

  function updatePathSummary() {
    const el = document.getElementById('pathSummary');
    if (!state) return;
    const t = currentTarget();
    const home = document.getElementById('dshHomeInput').value.trim() || state.dshHome || '';
    const cache = document.getElementById('cacheDirInput').value.trim() || state.defaultCacheDir || '';
    const prof = t ? (home + (state.platform === 'win32' ? '\\\\profiles\\\\' : '/profiles/') + t.profile) : '（未选中 DSH 目标）';
    el.innerHTML =
      '<div><b>DSH 客户端目录：</b>' + esc(t ? t.installDir : '未检测到') + '</div>' +
      '<div><b>DSH 数据根目录 (DSH_HOME)：</b>' + esc(home) + '</div>' +
      '<div><b>目标插件安装目录：</b>' + esc(prof) + '</div>' +
      '<div><b>下载与 SHA-256 缓存目录：</b>' + esc(cache) + '</div>';
  }

  function renderProgressEvent(ev) {
    const panel = document.getElementById('progPanel');
    const bar = document.getElementById('progBar');
    const lbl = document.getElementById('progLabel');
    const stats = document.getElementById('progStats');
    const logEl = document.getElementById('liveLog');
    panel.classList.add('active');
    const st = ev.stage || 'checking';
    const curIdx = STAGE_ORDER.indexOf(st);
    document.querySelectorAll('#stageRow .st-pill').forEach(p => {
      const ps = p.getAttribute('data-st');
      const idx = STAGE_ORDER.indexOf(ps);
      p.classList.remove('cur', 'done', 'fail');
      if (st === 'failed') {
        if (idx === curIdx) p.classList.add('fail');
      } else if (st === 'ready') {
        p.classList.add('done');
      } else if (idx >= 0 && curIdx >= 0) {
        if (idx < curIdx) p.classList.add('done');
        else if (idx === curIdx) p.classList.add('cur');
      }
    });
    if (ev.percent != null && Number.isFinite(Number(ev.percent))) {
      bar.classList.remove('indeterminate');
      bar.style.width = Math.max(2, Math.min(100, Number(ev.percent))) + '%';
    } else {
      bar.classList.add('indeterminate');
    }
    lbl.textContent = ev.stageLabel || st;
    const parts = [];
    if (ev.cacheHit) parts.push('缓存命中');
    if (ev.downloadedBytes != null) {
      parts.push(fmtBytes(ev.downloadedBytes) + (ev.totalBytes ? (' / ' + fmtBytes(ev.totalBytes)) : ''));
    }
    if (ev.speedBytesPerSec) parts.push(fmtBytes(ev.speedBytesPerSec) + '/s');
    if (ev.etaSec != null && ev.etaSec > 0) parts.push('预计剩余 ' + ev.etaSec + 's');
    if (ev.percent != null) parts.push(ev.percent + '%');
    stats.textContent = parts.join(' · ');
    if (ev.logLine) {
      logEl.textContent += (logEl.textContent ? '\\n' : '') + ev.logLine;
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  // Subscribe to SSE live progress channel
  try {
    const es = new EventSource('/events?token=' + encodeURIComponent(tok));
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev && ev.stage) renderProgressEvent(ev);
      } catch {}
    };
  } catch {}

  function updateTrackSwitchWarning() {
    const t = currentTarget();
    const box = document.getElementById('trackSwitchBox');
    const mode = document.getElementById('modeSelect').value;
    if (t && t.installedTrack && (mode === 'online' || mode === 'repair') && t.installedTrack !== selectedTrack) {
      const fromLbl = t.installedBrandLabel || t.installedTrack;
      const toLbl = selectedTrack === 'closed-free' ? 'LT (闭源免费版)' : 'OLT (开源维护版)';
      document.getElementById('trackSwitchDesc').textContent =
        '当前目标已安装 ' + fromLbl + ' v' + (t.installedLtVersion || '?') + '，你当前选择安装 ' + toLbl + '。为避免误切换，请勾选下方确认。';
      box.style.display = 'block';
    } else {
      box.style.display = 'none';
      document.getElementById('chkConfirmSwitch').checked = false;
    }
  }

  async function loadReleasesForTrack(track, force) {
    const sel = document.getElementById('versionSelect');
    const meta = document.getElementById('versionMeta');
    const includePre = Boolean(document.getElementById('chkIncludePrerelease')?.checked);
    const cacheKey = track + ':' + (includePre ? 'pre' : 'stable');
    if (!force && releasesCache[cacheKey]) {
      renderReleaseOptions(releasesCache[cacheKey]);
      return;
    }
    sel.innerHTML = '<option value="">正在从 GitHub 读取可用版本…</option>';
    meta.textContent = '';
    try {
      const r = await fetch('/releases?track=' + encodeURIComponent(track) + '&includePrerelease=' + (includePre ? '1' : '0') + '&token=' + encodeURIComponent(tok));
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || '读取失败');
      releasesCache[cacheKey] = j.releases || [];
      renderReleaseOptions(releasesCache[cacheKey]);
    } catch (e) {
      sel.innerHTML = '<option value="">自动拉取最新版（列表读取失败：' + esc(e.message) + '）</option>';
      meta.textContent = '网络受限时可切换“安装方式”使用本地 .tgz 离线安装包。';
    }
  }

  function renderReleaseOptions(list) {
    const sel = document.getElementById('versionSelect');
    const meta = document.getElementById('versionMeta');
    if (!list || !list.length) {
      sel.innerHTML = '<option value="">未找到当前系统可用的版本（可勾选显示 RC 或改用本地 .tgz）</option>';
      meta.textContent = '';
      return;
    }
    sel.innerHTML = list.map(x => {
      const sizeMb = x.assetSize ? (' · ' + (x.assetSize / 1048576).toFixed(2) + ' MB') : '';
      const prefix = x.prerelease ? '[RC 预览版] ' : (x.isLatest ? '★ 最新稳定版 · ' : '');
      return '<option value="' + esc(x.tag) + '">' + esc(prefix + x.tag + ' (v' + x.version + sizeMb + ')') + '</option>';
    }).join('');
    const defaultItem = list.find(x => x.isLatest) || list[0];
    if (defaultItem) sel.value = defaultItem.tag;
    const renderMeta = (hit) => {
      if (!hit) { meta.textContent = ''; return; }
      meta.textContent = (hit.prerelease ? '已选 RC 候选版 ' : '已选稳定版 ') + hit.tag + ' · 安装包：' + hit.assetName + '（已适配当前操作系统）';
    };
    renderMeta(defaultItem);
    sel.onchange = () => {
      const hit = list.find(x => x.tag === sel.value) || defaultItem;
      renderMeta(hit);
    };
  }

  function syncTrackCards() {
    document.querySelectorAll('#trackGrid .track-card').forEach(el => {
      el.classList.toggle('selected', el.getAttribute('data-track') === selectedTrack);
    });
    updateTrackSwitchWarning();
    void loadReleasesForTrack(selectedTrack, false);
  }

  function syncModeRows() {
    const mode = document.getElementById('modeSelect').value;
    document.getElementById('versionRow').style.display = (mode === 'online' || mode === 'repair' || mode === 'download-only') ? 'block' : 'none';
    document.getElementById('bundledRow').style.display = mode === 'bundled' ? 'block' : 'none';
    document.getElementById('uploadRow').style.display = mode === 'upload-tgz' ? 'block' : 'none';
    document.getElementById('localPathRow').style.display = mode === 'path-tgz' ? 'block' : 'none';
    document.getElementById('btnInstall').textContent =
      mode === 'repair' ? '开始修复安装（保留配置）'
        : (mode === 'download-only' ? '仅下载并校验到缓存目录' : '立即下载校验并安装');
    updateTrackSwitchWarning();
  }

  function renderScan(d) {
    state = d;
    const platLabel = (d.platform === 'win32' ? 'Windows' : (d.platform === 'linux' ? 'Linux' : d.platform)) + ' ' + (d.arch || '');
    document.getElementById('osPill').textContent = platLabel;
    const homeInput = document.getElementById('dshHomeInput');
    if (!homeInput.value.trim() && d.dshHome) homeInput.value = d.dshHome;
    const cacheInput = document.getElementById('cacheDirInput');
    if (!cacheInput.value.trim() && d.defaultCacheDir) cacheInput.value = d.defaultCacheDir;

    const envEl = document.getElementById('env');
    if (!d.targets || !d.targets.length) {
      envEl.innerHTML =
        '<div class="alert warn"><strong>未检测到已安装的 DeepSeek Harness 环境</strong>' +
        '<div style="margin-top:6px">Leader Team 作为 DeepSeek Harness 插件运行。若本机尚未安装 DSH，请先安装官方客户端（自带运行时，无需单独准备 Node.js）：</div>' +
        '<div class="row" style="margin-top:10px">' +
        '<a class="btn-link" href="https://deepseekdsh.com" target="_blank" rel="noopener">前往官网下载 DeepSeek Harness</a>' +
        '<button type="button" class="secondary" id="btnQuickRescan">我已安装，重新扫描</button>' +
        '</div>' +
        '<div class="muted" style="margin-top:6px">如你已安装到自定义盘符，请在下方输入框粘贴安装目录（如 <code>D:\\\\Apps\\\\DeepSeek-Harness</code>）后点击“应用路径并重新扫描”。</div></div>';
      const qBtn = document.getElementById('btnQuickRescan');
      if (qBtn) qBtn.onclick = () => doScan();
    } else {
      if (!tid || !d.targets.some(t => t.id === tid)) tid = d.targets[0].id;
      const active = currentTarget();
      if (!trackInitializedFromInstalled && active && active.installedTrack) {
        selectedTrack = active.installedTrack;
        trackInitializedFromInstalled = true;
      }
      envEl.innerHTML = d.targets.map(t => {
        const badgeCls = t.compatible ? 'ok' : 'err';
        const badgeTxt = t.verified ? ('已验证兼容 (' + (t.dshVersion || '') + ')') : (t.compatible ? ('结构契约兼容 (' + (t.dshVersion || '') + ')') : ('版本过低 (' + (t.dshVersion || '未知') + ')'));
        const ltTxt = t.installedLtVersion
          ? (' · 当前已装 ' + esc(t.installedBrandLabel || 'LT') + ' v' + esc(t.installedLtVersion))
          : ' · 尚未安装 Leader Team';
        const runWarn = (t.kind === 'official-desktop' && t.desktopRunning)
          ? '<div class="alert warn" style="margin-top:8px"><div class="row" style="justify-content:space-between"><span><strong>检测到 DeepSeek Harness 正在运行</strong>，安装前需先退出客户端。</span><button type="button" class="warn-btn btn-close-dsh">一键安全关闭 DSH</button></div></div>'
          : '';
        const initWarn = (t.kind === 'official-desktop' && !t.profileInitialized)
          ? '<div class="alert warn" style="margin-top:8px"><div class="row" style="justify-content:space-between"><span><strong>桌面端尚未完成首次初始化</strong>：请先打开一次 DSH 看到主界面后再关闭即可。</span><button type="button" class="secondary btn-init-dsh">帮我打开 DSH 完成初始化</button></div></div>'
          : '';
        return '<div class="target-item ' + (t.id === tid ? 'selected' : '') + '" data-tid="' + esc(t.id) + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>' + esc(t.label) + '</b><span class="badge ' + badgeCls + '">' + esc(badgeTxt) + '</span></div>' +
          '<div class="mono" style="font-size:12px;color:var(--muted);margin-top:4px">' + esc(t.installDir) + ltTxt + '</div>' +
          runWarn + initWarn + '</div>';
      }).join('');

      envEl.querySelectorAll('.target-item').forEach(el => {
        el.onclick = (ev) => {
          if (ev.target && ev.target.tagName === 'BUTTON') return;
          tid = el.getAttribute('data-tid');
          renderScan(state);
        };
      });
      envEl.querySelectorAll('.btn-close-dsh').forEach(btn => {
        btn.onclick = async (ev) => {
          ev.stopPropagation();
          btn.disabled = true;
          btn.textContent = '正在关闭…';
          try {
            const r = await fetch('/close-desktop?token=' + encodeURIComponent(tok), { method: 'POST' });
            const j = await r.json();
            document.getElementById('msg').innerHTML = '<div class="alert ' + (j.ok ? 'ok' : 'warn') + '">' + esc(j.message || '') + '</div>';
          } finally {
            await doScan();
          }
        };
      });
      envEl.querySelectorAll('.btn-init-dsh').forEach(btn => {
        btn.onclick = async (ev) => {
          ev.stopPropagation();
          btn.disabled = true;
          const customPath = document.getElementById('customDshInput').value.trim();
          const dshHome = document.getElementById('dshHomeInput').value.trim();
          await fetch('/launch?token=' + encodeURIComponent(tok), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetId: tid, customPath: customPath || null, dshHome: dshHome || null }),
          });
          document.getElementById('msg').innerHTML = '<div class="alert ok">已打开 DeepSeek Harness 客户端：看到主界面后请点上方“应用路径并重新扫描”再点“一键安全关闭 DSH”，即可一键安装！</div>';
          btn.disabled = false;
        };
      });
    }

    const modeSel = document.getElementById('modeSelect');
    const hasBundled = Array.isArray(d.bundledTarballs) && d.bundledTarballs.length > 0;
    const existingBundledOpt = modeSel.querySelector('option[value="bundled"]');
    if (hasBundled && !existingBundledOpt) {
      const opt = document.createElement('option');
      opt.value = 'bundled';
      opt.textContent = '使用当前目录随附离线安装包 (' + d.bundledTarballs[0].fileName + ')';
      modeSel.insertBefore(opt, modeSel.children[3]);
    }
    if (hasBundled) {
      document.getElementById('bundledSelect').innerHTML = d.bundledTarballs.map(b =>
        '<option value="' + esc(b.path) + '">' + esc(b.fileName + ' (v' + b.version + ')') + '</option>'
      ).join('');
    }
    updatePathSummary();
    syncTrackCards();
    syncModeRows();
  }

  async function doScan() {
    const customPath = document.getElementById('customDshInput').value.trim();
    const dshHome = document.getElementById('dshHomeInput').value.trim();
    const qs = '/scan?token=' + encodeURIComponent(tok)
      + (customPath ? '&customPath=' + encodeURIComponent(customPath) : '')
      + (dshHome ? '&dshHome=' + encodeURIComponent(dshHome) : '');
    const r = await fetch(qs);
    const d = await r.json();
    if (customPath && d.targets && d.targets.length > 0) tid = d.targets[0].id;
    renderScan(d);
    return d;
  }

  document.querySelectorAll('#trackGrid .track-card').forEach(el => {
    el.onclick = () => {
      selectedTrack = el.getAttribute('data-track') || 'closed-free';
      syncTrackCards();
    };
  });
  document.getElementById('modeSelect').onchange = syncModeRows;
  document.getElementById('btnRefreshRel').onclick = () => loadReleasesForTrack(selectedTrack, true);
  document.getElementById('chkIncludePrerelease').onchange = () => loadReleasesForTrack(selectedTrack, true);
  document.getElementById('btnRescan').onclick = () => doScan();
  document.getElementById('dshHomeInput').addEventListener('input', updatePathSummary);
  document.getElementById('cacheDirInput').addEventListener('input', updatePathSummary);
  document.getElementById('customDshInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); doScan(); }
  });

  document.getElementById('btnInstall').onclick = async () => {
    const btn = document.getElementById('btnInstall');
    const m = document.getElementById('msg');
    const customPath = document.getElementById('customDshInput').value.trim();
    const dshHome = document.getElementById('dshHomeInput').value.trim();
    const cacheDir = document.getElementById('cacheDirInput').value.trim();
    document.getElementById('liveLog').textContent = '';
    btn.disabled = true;
    try {
      const mode = document.getElementById('modeSelect').value;
      if (mode !== 'download-only') {
        const latest = await doScan();
        const chosen = latest.targets && (latest.targets.find(t => t.id === tid) || latest.targets[0]);
        if (chosen && chosen.kind === 'official-desktop' && chosen.desktopRunning) {
          m.innerHTML =
            '<div class="alert warn"><strong>检测到 DeepSeek Harness 正在运行</strong>' +
            '<div style="margin-top:4px">安装或升级桌面端插件前需要先关闭运行中的 DSH 客户端（含托盘图标）。</div>' +
            '<div class="row" style="margin-top:8px"><button type="button" class="warn-btn" id="btnInlineCloseAndRetry">一键安全关闭 DSH 并继续安装</button></div></div>';
          const inlineBtn = document.getElementById('btnInlineCloseAndRetry');
          if (inlineBtn) {
            inlineBtn.onclick = async () => {
              inlineBtn.disabled = true;
              inlineBtn.textContent = '正在关闭 DSH…';
              try {
                await fetch('/close-desktop?token=' + encodeURIComponent(tok), { method: 'POST' });
                await doScan();
                btn.click();
              } finally {
                inlineBtn.disabled = false;
              }
            };
          }
          return;
        }
      }

      const body = {
        targetId: tid,
        customPath: customPath || null,
        dshHome: dshHome || null,
        cacheDir: cacheDir || null,
        track: selectedTrack,
        mode: mode === 'repair' ? 'repair' : (mode === 'download-only' ? 'download-only' : 'install'),
        releaseTag: (mode === 'online' || mode === 'repair' || mode === 'download-only') ? (document.getElementById('versionSelect').value || null) : null,
        includePrerelease: Boolean(document.getElementById('chkIncludePrerelease')?.checked),
        confirmTrackSwitch: Boolean(document.getElementById('chkConfirmSwitch').checked),
        apiKeyEnvVar: document.getElementById('envVar').value,
        apiKey: document.getElementById('apiKey').value.trim(),
      };
      if (mode === 'bundled') {
        body.localTgzPath = document.getElementById('bundledSelect').value;
      } else if (mode === 'path-tgz') {
        const p = document.getElementById('localTgzPathInput').value.trim();
        if (!p) throw new Error('请先输入本地 .tgz 安装包的完整路径');
        body.localTgzPath = p;
      } else if (mode === 'upload-tgz') {
        const f = document.getElementById('tgzFileInput').files[0];
        if (!f) throw new Error('请先选择本地 .tgz 安装包文件');
        renderProgressEvent({ stage: 'downloading', stageLabel: '正在上传本地安装包 ' + f.name + '…', percent: 30 });
        const up = await fetch('/upload-tgz?token=' + encodeURIComponent(tok) + '&name=' + encodeURIComponent(f.name), {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: await f.arrayBuffer(),
        });
        const upJson = await up.json();
        if (!up.ok || !upJson.ok) throw new Error(upJson.error || '上传安装包失败');
        body.localTgzPath = upJson.stagedPath;
      }

      renderProgressEvent({ stage: 'checking', stageLabel: '正在启动任务…', percent: 8 });
      const r = await fetch('/install?token=' + encodeURIComponent(tok), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        renderProgressEvent({ stage: 'failed', stageLabel: '任务未完成，请查看下方错误详情', percent: 100 });
        const f = j.friendly || { title: '安装未完成', friendlyMessage: j.error || '未知错误', suggestion: '请检查提示后重试。', rawDetail: j.error || '' };
        const metaLines = [];
        if (f.failedOperation) metaLines.push('<b>失败操作：</b><code>' + esc(f.failedOperation) + '</code>');
        if (f.failedPath) metaLines.push('<b>涉及路径：</b><code>' + esc(f.failedPath) + '</code>');
        const actionBtns = [];
        if (f.canCloseDesktop || f.code === 'DESKTOP_CLIENT_RUNNING') {
          actionBtns.push('<button type="button" class="warn-btn" id="btnErrCloseAndRetry">一键安全关闭 DSH 并重试安装</button>');
        }
        if (f.canRetry !== false) {
          actionBtns.push('<button type="button" class="secondary" id="btnErrRetry">重试安装</button>');
        }
        const rawBlock = f.rawDetail
          ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">查看完整诊断详情</summary><pre style="white-space:pre-wrap;word-break:break-all;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin-top:6px;max-height:220px;overflow:auto;font-size:12px">' + esc(f.rawDetail) + '</pre></details>'
          : '';
        m.innerHTML =
          '<div class="alert err"><strong>' + esc(f.title) + '</strong>' +
          '<div style="margin-top:4px">' + esc(f.friendlyMessage) + '</div>' +
          (metaLines.length ? '<div style="margin-top:6px;font-size:12.5px">' + metaLines.join('<br>') + '</div>' : '') +
          '<div style="margin-top:6px"><b>处理建议：</b>' + esc(f.suggestion) + '</div>' +
          (actionBtns.length ? '<div class="row" style="margin-top:10px">' + actionBtns.join('') + '</div>' : '') +
          rawBlock + '</div>';
        const cBtn = document.getElementById('btnErrCloseAndRetry');
        if (cBtn) {
          cBtn.onclick = async () => {
            cBtn.disabled = true;
            cBtn.textContent = '正在关闭 DSH…';
            try {
              await fetch('/close-desktop?token=' + encodeURIComponent(tok), { method: 'POST' });
              await doScan();
              btn.click();
            } finally {
              cBtn.disabled = false;
            }
          };
        }
        const rBtn = document.getElementById('btnErrRetry');
        if (rBtn) rBtn.onclick = () => btn.click();
        return;
      }

      if (j.mode === 'download-only') {
        m.innerHTML = '<div class="alert ok"><strong>✔ ' + esc((j.brand || 'LT') + ' v' + (j.versionInstalled || '')) + ' 已下载并通过 SHA-256 校验！</strong>' +
          '<div class="mono" style="margin-top:6px;font-size:12px">文件位置：' + esc(j.tgzToInstall || '') + '<br>SHA-256：' + esc(j.sha256 || '') + (j.cacheHit ? '（命中已校验本地缓存）' : '') + '</div></div>';
        return;
      }

      const verb = j.mode === 'repair' ? '修复安装成功' : '安装成功';
      m.innerHTML = '<div class="alert ok"><strong>✔ ' + esc((j.brand || 'LT') + ' v' + (j.versionInstalled || '')) + ' ' + verb + '！</strong>' +
        '<div class="mono" style="margin-top:4px;font-size:12px">已安装至：' + esc(j.dshHome || '') + ' · 缓存包：' + esc(j.tgzToInstall || '') + (j.cacheHit ? '（缓存命中）' : '') + '</div>' +
        '<div style="margin-top:4px">点击“立即启动 DeepSeek Harness 客户端”即可直接进入 LT 河洛序工作台！</div></div>';
      document.getElementById('btnLaunch').style.display = 'inline-flex';
      await doScan();
    } catch (e) {
      renderProgressEvent({ stage: 'failed', stageLabel: e.message || '安装未完成', percent: 100 });
      m.innerHTML = '<div class="alert err"><strong>安装未完成</strong><br>' + esc(e.message) + '</div>';
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById('btnLaunch').onclick = async () => {
    const m = document.getElementById('msg');
    const customPath = document.getElementById('customDshInput').value.trim();
    const dshHome = document.getElementById('dshHomeInput').value.trim();
    const r = await fetch('/launch?token=' + encodeURIComponent(tok), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: tid, customPath: customPath || null, dshHome: dshHome || null }),
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
  scanFn = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const token = crypto.randomBytes(20).toString('hex');
  const uploadedFiles = new Set();
  const sseClients = new Set();
  const broadcastProgress = (ev) => {
    const payload = `data: ${JSON.stringify(ev)}\n\n`;
    for (const clientRes of sseClients) {
      try {
        if (!clientRes.writableEnded && !clientRes.destroyed) clientRes.write(payload);
      } catch {
        sseClients.delete(clientRes);
      }
    }
  };

  const server = http.createServer(async (req, res) => {
    const boundPort = server.address()?.port;
    const host = String(req.headers.host || '').toLowerCase();
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}` && host !== `[::1]:${boundPort}`) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const u = new URL(req.url || '/', `http://${host}`);
    const qTok = u.searchParams.get('token') || String(req.headers['x-lt-installer-token'] || '');
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

    if (req.method === 'GET' && u.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      res.on('close', () => sseClients.delete(res));
      return;
    }

    if (req.method === 'GET' && u.pathname === '/scan') {
      const scanCustom = u.searchParams.get('customPath') || customPath || null;
      const scanHome = u.searchParams.get('dshHome') || dshHome || null;
      const snap = typeof scanFn === 'function'
        ? scanFn({ customPath: scanCustom, dshHome: scanHome })
        : scanDshTargets({ customPath: scanCustom, dshHome: scanHome });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(snap));
      return;
    }

    if (req.method === 'GET' && u.pathname === '/releases') {
      const reqTrack = u.searchParams.get('track') || 'closed-free';
      const reqPre = u.searchParams.get('includePrerelease') === '1' || u.searchParams.get('includePrerelease') === 'true';
      try {
        const out = await fetchTrackReleases({ track: reqTrack, platform: process.platform, includePrerelease: reqPre, fetchImpl });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, ...out }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }

    if (req.method === 'POST' && u.pathname === '/close-desktop') {
      try {
        const out = await closeRunningDesktopClient({ platform: process.platform });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: e instanceof Error ? e.message : String(e) }));
      }
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
          fetchImpl,
          onProgress: broadcastProgress,
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      } catch (e) {
        const friendly = translateStandaloneInstallError(e, {
          desktopRunning: e?.desktopRunning ?? isOfficialDesktopProcessRunning(process.platform),
        });
        broadcastProgress({ stage: 'failed', stageLabel: friendly.title, percent: 100, logLine: `[error] ${friendly.friendlyMessage}` });
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
      for (const c of sseClients) {
        try { c.end(); } catch {}
      }
      sseClients.clear();
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
    cacheDir: null,
    tgz: null,
    track: 'closed-free',
    releaseTag: null,
    includePrerelease: false,
    mode: 'install',
    confirmTrackSwitch: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--gui') opts.gui = true;
    else if (a === '--cli' || a === '--non-interactive') opts.gui = false;
    else if (a === '--inspect') { opts.inspect = true; opts.gui = false; }
    else if (a === '--no-open') opts.noOpen = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--repair') opts.mode = 'repair';
    else if (a === '--download-only') opts.mode = 'download-only';
    else if (a === '--prerelease' || a === '--include-prerelease') opts.includePrerelease = true;
    else if (a === '--confirm-track-switch') opts.confirmTrackSwitch = true;
    else if (a === '--port' && argv[i + 1]) opts.port = Number(argv[++i]) || 0;
    else if (a === '--custom-path' && argv[i + 1]) opts.customPath = argv[++i];
    else if (a === '--dsh-home' && argv[i + 1]) opts.dshHome = argv[++i];
    else if (a === '--cache-dir' && argv[i + 1]) opts.cacheDir = argv[++i];
    else if (a === '--tgz' && argv[i + 1]) opts.tgz = argv[++i];
    else if (a === '--track' && argv[i + 1]) opts.track = argv[++i];
    else if ((a === '--version' || a === '--tag') && argv[i + 1]) opts.releaseTag = argv[++i];
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
        'LeaderTeam / Open LeaderTeam Unified Downloader & Installer (LT / OLT · Windows & Linux)',
        'Usage: node lt-installer-standalone.mjs [--gui|--cli] [--inspect] [--custom-path <dir>] [--dsh-home <dir>] [--cache-dir <dir>] [--track <closed-free|open-source>] [--tag <release-tag>] [--repair|--download-only] [--confirm-track-switch] [--tgz <file>] [--no-open] [--help]',
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
        cacheDir: opts.cacheDir,
        localTgzPath: opts.tgz,
        track: opts.track,
        releaseTag: opts.releaseTag,
        includePrerelease: opts.includePrerelease,
        mode: opts.mode,
        confirmTrackSwitch: opts.confirmTrackSwitch,
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
