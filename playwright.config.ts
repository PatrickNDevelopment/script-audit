import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against the PRODUCTION build under the Pages prefix (/script-audit/) and
 * two real FastAPI backends on fresh temporary SQLite databases:
 *   8799  AI provider "fake" (deterministic, never touches a network)
 *   8800  AI not configured (the disabled-provider mode)
 * Locally the installed Microsoft Edge is used (no download); CI installs Chromium.
 */
const AI_PORT = 8799;
const NOAI_PORT = 8800;
const WEB_PORT = 4178;
const isWindows = process.platform === 'win32';
// The project's virtualenv when present (local development), otherwise the interpreter on PATH.
const venvPython = resolve(
  process.cwd(),
  isWindows ? '.venv\\Scripts\\python.exe' : '.venv/bin/python',
);
const python = existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3';
const py = `"${python}"`;
// Throwaway backend databases live in a git-ignored folder inside the repo, wiped at the start of each
// run, so no run leaves anything behind in the system temp folder. Worker processes load this file
// too, while the servers are running: only the main process may wipe it.
const dataDir = resolve(process.cwd(), '.e2e-data');
if (process.env['TEST_WORKER_INDEX'] === undefined) {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
}
const origins = `http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}`;

function backend(port: number, tag: string, extra: Record<string, string>) {
  return {
    command: `${py} -m script_audit`,
    cwd: 'backend',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SCRIPT_AUDIT_DB_PATH: join(dataDir, `${tag}.sqlite3`),
      SCRIPT_AUDIT_PORT: String(port),
      SCRIPT_AUDIT_HOST: '127.0.0.1',
      SCRIPT_AUDIT_CORS_ORIGINS: origins,
      ...extra,
    },
  };
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}/script-audit/`,
    channel: process.env['CI'] ? undefined : 'msedge',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  webServer: [
    backend(AI_PORT, 'ai', { SCRIPT_AUDIT_AI_PROVIDER: 'fake' }),
    backend(NOAI_PORT, 'noai', {}),
    {
      command: 'npm run build && npm run preview',
      url: `http://localhost:${WEB_PORT}/script-audit/`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
