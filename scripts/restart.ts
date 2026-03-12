#!/usr/bin/env tsx
/**
 * Restart the running nanoclaw service.
 * Finds the current process running dist/index.js, kills it, then starts a fresh one.
 * Works on Windows, macOS, and Linux.
 */

import { execSync, spawn } from 'child_process';
import { platform } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function findNanoclawPid(): number | null {
  try {
    if (platform() === 'win32') {
      const out = execSync(
        'wmic process where "name=\'node.exe\' and commandline like \'%dist/index.js%\'" get ProcessId',
        { encoding: 'utf8' },
      );
      for (const line of out.split('\n')) {
        const pid = parseInt(line.trim());
        if (!isNaN(pid) && pid > 0) return pid;
      }
    } else {
      const out = execSync("pgrep -f 'node.*dist/index.js'", {
        encoding: 'utf8',
      });
      const pid = parseInt(out.trim().split('\n')[0]);
      if (!isNaN(pid)) return pid;
    }
  } catch {
    // No match found
  }
  return null;
}

function killProcess(pid: number): void {
  if (platform() === 'win32') {
    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
  } else {
    process.kill(pid, 'SIGTERM');
  }
}

const pid = findNanoclawPid();

if (pid) {
  console.log(`Stopping nanoclaw (PID ${pid})...`);
  try {
    killProcess(pid);
    // Give the process a moment to shut down
    await new Promise((r) => setTimeout(r, 1500));
    console.log('Stopped.');
  } catch (err) {
    console.warn(`Warning: could not kill PID ${pid}: ${err}`);
  }
} else {
  console.log('No running nanoclaw process found — starting fresh.');
}

console.log('Starting nanoclaw...');
const child = spawn('node', ['dist/index.js'], {
  cwd: projectRoot,
  detached: true,
  stdio: 'ignore',
});
child.unref();

console.log(`Nanoclaw started (PID ${child.pid}).`);
