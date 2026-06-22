#!/usr/bin/env node
/*
 * =============================================================================
 * dev-runner.mjs — Open Tome Developer CLI Task Runner
 * =============================================================================
 *
 * INSTALL:
 *   No installation required — Node.js stdlib only, zero npm install needed.
 *   Prerequisites: Node.js >= 18, git in PATH, docker in PATH.
 *
 * RUN (from any directory):
 *   node dev-runner.mjs
 *   node path/to/dev-runner.mjs
 *
 * NAVIGATION:
 *   Type the number next to a menu item and press Enter.
 *   Type 0 at any submenu to go back to the main menu.
 *   Type 5 at the main menu to exit.
 *
 * WATCH MODE NOTE:
 *   While in test watch mode, press 'q' inside vitest to exit and return
 *   to the menu. Ctrl+C will exit the entire runner.
 *
 * LOG FILES:
 *   Last test results  → logs/.last-test-results.log
 *   Pre-deploy checks  → logs/.last-predeploy-checks.log
 *   Last deploy status → logs/.last-deploy-status.log
 * =============================================================================
 */

import { createInterface }                        from 'readline';
import { spawn, execSync }                        from 'child_process';
import { fileURLToPath }                          from 'url';
import { dirname, join }                          from 'path';
import { existsSync, readFileSync, createWriteStream, readdirSync, statSync, unlinkSync } from 'fs';

// Project root = directory containing this script
const ROOT        = dirname(fileURLToPath(import.meta.url));
const LOG_DIR     = join(ROOT, 'logs');
const TEST_LOG    = join(LOG_DIR, '.last-test-results.log');
const CHECKS_LOG  = join(LOG_DIR, '.last-predeploy-checks.log');
const DEPLOY_LOG  = join(LOG_DIR, '.last-deploy-status.log');

const DOCKER_DEV  = `docker compose --env-file .env.dev -f docker-compose.dev.yml`;
const DOCKER_PROD = `docker compose -f docker-compose.yml`;

// ─── ANSI colors ──────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const BLUE  = '\x1b[34m';
const YEL   = '\x1b[33m';
const GRN   = '\x1b[32m';
const RED   = '\x1b[31m';
const CYN   = '\x1b[36m';

const bold    = s => `${BOLD}${s}${RESET}`;
const dim     = s => `${DIM}${s}${RESET}`;
const blue    = s => `${BLUE}${s}${RESET}`;
const yel     = s => `${YEL}${s}${RESET}`;
const grn     = s => `${GRN}${s}${RESET}`;
const red     = s => `${RED}${s}${RESET}`;
const cyn     = s => `${CYN}${s}${RESET}`;
const boldRed = s => `${BOLD}${RED}${s}${RESET}`;
const boldGrn = s => `${BOLD}${GRN}${s}${RESET}`;
const boldCyn = s => `${BOLD}${CYN}${s}${RESET}`;
const boldYel = s => `${BOLD}${YEL}${s}${RESET}`;
const boldBlu = s => `${BOLD}${BLUE}${s}${RESET}`;

// ─── Core utilities ───────────────────────────────────────────────────────────

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '(no branch)';
  }
}

function clearScreen() {
  process.stdout.write('\x1bc');
}

function printHeader() {
  const branch = getGitBranch();
  const line   = dim('═'.repeat(64));
  console.log(line);
  console.log(boldCyn('  ✦  OPEN TOME DEV RUNNER'));
  console.log(dim(`  Branch: ${branch}  │  ${ROOT}`));
  console.log(line);
  console.log();
}

/** Ask a question and return trimmed answer. Creates+closes its own rl. */
function ask(question) {
  return new Promise(resolve => {
    const iface = createInterface({ input: process.stdin, output: process.stdout });
    iface.question(question, answer => {
      iface.close();
      resolve(answer.trim());
    });
  });
}

/** Prompt for typed "yes" confirmation; anything else is treated as "no". */
async function confirm(message) {
  const answer = await ask(`${boldYel(message)} ${dim('[yes/no]')}: `);
  return answer.toLowerCase() === 'yes';
}

async function pause() {
  await ask(dim('\nPress Enter to return to the menu...'));
}

async function ensureDockerRunning() {
  try { execSync('docker info', { stdio: 'ignore' }); return; } catch { /* not running */ }

  const DOCKER_DESKTOP = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
  if (!existsSync(DOCKER_DESKTOP)) {
    console.log(red('\n  Docker is not running and Docker Desktop was not found at the expected path.'));
    console.log(red('  Please start Docker Desktop manually and retry.\n'));
    await pause();
    throw new Error('Docker not running');
  }

  console.log(yel('\n  Docker is not running — starting Docker Desktop...'));
  spawn(DOCKER_DESKTOP, [], { detached: true, stdio: 'ignore' }).unref();

  const LIMIT = 60, INTERVAL = 3;
  for (let elapsed = 0; elapsed < LIMIT; elapsed += INTERVAL) {
    await new Promise(r => setTimeout(r, INTERVAL * 1000));
    try {
      execSync('docker info', { stdio: 'ignore' });
      console.log(grn('  Docker Desktop is ready.\n'));
      return;
    } catch {
      console.log(dim(`  Waiting for Docker Desktop... (${elapsed + INTERVAL}/${LIMIT}s)`));
    }
  }
  console.log(red('\n  Docker Desktop did not become ready in time. Aborting.\n'));
  throw new Error('Docker timed out');
}

function reportOk()       { console.log(boldGrn('\n✓ Done.')); }
function reportFail(code) { console.log(boldRed(`\n✗ Failed (exit ${code}).`)); }

/**
 * Run a shell command with fully live-streamed output.
 * If logFile is given the output is also written there (append=true to append).
 * Returns the process exit code.
 */
function runCmd(cmd, { logFile = null, append = false } = {}) {
  return new Promise(resolve => {
    console.log(dim(`\n$ ${cmd}\n`));

    if (!logFile) {
      const proc = spawn(cmd, { shell: true, cwd: ROOT, stdio: 'inherit' });
      proc.on('error', err => {
        console.error(red(`\nSpawn error: ${err.message}`));
        resolve(1);
      });
      proc.on('close', code => resolve(code ?? 0));
      return;
    }

    const ws = createWriteStream(logFile, { flags: append ? 'a' : 'w' });
    ws.write(`\n=== ${new Date().toISOString()} ===\n$ ${cmd}\n\n`);

    const proc = spawn(cmd, { shell: true, cwd: ROOT });
    proc.stdout.on('data', chunk => { process.stdout.write(chunk); ws.write(chunk); });
    proc.stderr.on('data', chunk => { process.stderr.write(chunk); ws.write(chunk); });
    proc.on('error', err => {
      const msg = `Spawn error: ${err.message}\n`;
      process.stderr.write(red(msg));
      ws.write(msg);
      ws.end();
      resolve(1);
    });
    proc.on('close', code => {
      ws.write(`\n--- exit ${code} ---\n`);
      ws.end();
      resolve(code ?? 0);
    });
  });
}

// ─── Menu printers ────────────────────────────────────────────────────────────

function printMainMenu() {
  console.log(`  ${boldBlu('1.')}  ${blue('Testing')}`);
  console.log(`  ${boldYel('2.')}  ${yel('Git')}`);
  console.log(`  ${`${BOLD}${GRN}3.${RESET}`}  ${grn('Dev Environment')}`);
  console.log(`  ${boldRed('4.')}  ${red('Production')}`);
  console.log(`  ${dim('5.')}  ${dim('Exit')}`);
  console.log();
}

function printTestingMenu() {
  console.log(blue('  ── Testing ─────────────────────────────────────────'));
  console.log(`  ${blue('1.')}  Run all tests`);
  console.log(`  ${blue('2.')}  Run tests for a specific file or module`);
  console.log(`  ${blue('3.')}  Run tests in watch mode  ${dim('(press q inside vitest to exit)')}`);
  console.log(`  ${blue('4.')}  Show last test results`);
  console.log(`  ${blue('5.')}  Run E2E tests  ${dim('(Playwright — dev stack must be running)')}`);
  console.log(`  ${dim('0.')}  ${dim('Back')}`);
  console.log();
}

function printGitMenu() {
  console.log(yel('  ── Git ─────────────────────────────────────────────'));
  console.log(`  ${yel('1.')}  Show current status`);
  console.log(`  ${yel('2.')}  Stage all changes`);
  console.log(`  ${yel('3.')}  Commit`);
  console.log(`  ${yel('4.')}  Push to current branch`);
  console.log(`  ${yel('5.')}  Pull latest`);
  console.log(`  ${yel('6.')}  Create and switch to new branch`);
  console.log(`  ${yel('7.')}  Switch branch`);
  console.log(`  ${yel('8.')}  View recent commit log (last 10)`);
  console.log(`  ${dim('0.')}  ${dim('Back')}`);
  console.log();
}

function printDevMenu() {
  console.log(`${BOLD}${GRN}  ── Dev Environment ────────────────────────────────${RESET}`);
  console.log(`  ${grn('1.')}  Start dev server`);
  console.log(`  ${grn('2.')}  Stop dev server`);
  console.log(`  ${grn('3.')}  Restart dev server`);
  console.log(`  ${grn('4.')}  Show running dev processes`);
  console.log(`  ${grn('5.')}  Clean up logs  ${dim('(files > 7 days old)')}`);
  console.log(`  ${dim('0.')}  ${dim('Back')}`);
  console.log();
}

function printProdMenu() {
  console.log(red('  ── Production ──────────────────────────────────────'));
  console.log(`  ${red('1.')}  Build for production`);
  console.log(`  ${red('2.')}  Run pre-deploy checks (lint + tests)`);
  console.log(`  ${boldRed('3.')}  ${boldRed('Deploy / push to prod')}  ${yel('⚠  REQUIRES TYPED CONFIRMATION')}`);
  console.log(`  ${red('4.')}  Show last deployment status`);
  console.log(`  ${dim('0.')}  ${dim('Back')}`);
  console.log();
}

// ─── Testing actions ──────────────────────────────────────────────────────────

async function doRunAllTests() {
  console.log(blue('\n▶ Client tests\n'));
  const r1 = await runCmd('npm test --prefix client', { logFile: TEST_LOG });

  console.log(blue('\n▶ Server tests\n'));
  const r2 = await runCmd('npm test --prefix server', { logFile: TEST_LOG, append: true });

  console.log(blue('\n▶ E2E tests  (requires dev stack running)\n'));
  const r3 = await runCmd('npm run e2e', { logFile: TEST_LOG, append: true });

  (r1 === 0 && r2 === 0 && r3 === 0) ? reportOk() : reportFail(r1 || r2 || r3);
  await pause();
}

async function doRunSpecificTest() {
  const filter = await ask(`  ${blue('File / pattern')} ${dim('(e.g. Sidebar, auth.test)')}: `);
  if (!filter) {
    console.log(dim('\nNo input — cancelled.'));
    await pause();
    return;
  }

  const raw = await ask(`  ${blue('Workspace')} ${dim('[client/server]')} ${dim('(default: client)')}: `);
  const ws  = raw.toLowerCase() === 'server' ? 'server' : 'client';

  const code = await runCmd(`npm test --prefix ${ws} -- ${filter}`);
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doWatchTests() {
  const raw = await ask(`  ${blue('Workspace')} ${dim('[client/server]')} ${dim('(default: client)')}: `);
  const ws  = raw.toLowerCase() === 'server' ? 'server' : 'client';
  console.log(dim('\nStarting watch mode. Press q inside vitest to exit and return to the menu.\n'));
  await runCmd(`npm run test:watch --prefix ${ws}`);
  await pause();
}

async function doShowLastTestResults() {
  if (!existsSync(TEST_LOG)) {
    console.log(dim('\n  No test results found. Run tests first.\n'));
  } else {
    console.log(dim(`\n  Showing: ${TEST_LOG}\n`));
    console.log(readFileSync(TEST_LOG, 'utf8'));
  }
  await pause();
}

async function doRunE2eTests() {
  console.log(blue('\n▶ Playwright E2E tests\n'));
  console.log(dim('  (Requires the dev stack to be running — start it from Dev Environment → 1 first)\n'));
  const code = await runCmd('npm run e2e', { logFile: TEST_LOG, append: true });
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

// ─── Git actions ──────────────────────────────────────────────────────────────

async function doGitStatus() {
  const code = await runCmd('git status');
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doGitStageAll() {
  const code = await runCmd('git add -A');
  if (code === 0) {
    console.log(grn('\n  All changes staged.'));
    await runCmd('git status --short');
    reportOk();
  } else {
    reportFail(code);
  }
  await pause();
}

async function doGitCommit() {
  const msg = await ask(`  ${yel('Commit message')}: `);
  if (!msg) {
    console.log(dim('\nNo message — cancelled.'));
    await pause();
    return;
  }
  // Direct spawn without shell so the message is passed verbatim as an argv element,
  // avoiding cmd.exe double-quote mis-parsing on Windows.
  console.log(dim('\n$ git commit -m <message>\n'));
  const code = await new Promise(resolve => {
    const proc = spawn('git', ['commit', '-m', msg], { cwd: ROOT, stdio: 'inherit' });
    proc.on('error', err => { console.error(red(`\nSpawn error: ${err.message}`)); resolve(1); });
    proc.on('close', c => resolve(c ?? 0));
  });
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doGitPush() {
  const branch    = getGitBranch();
  const confirmed = await confirm(`  Push to origin/${branch}?`);
  if (!confirmed) {
    console.log(dim('\nPush cancelled.'));
    await pause();
    return;
  }
  const code = await runCmd(`git push origin ${branch}`);
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doGitPull() {
  const code = await runCmd('git pull');
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doGitNewBranch() {
  const name = await ask(`  ${yel('New branch name')}: `);
  if (!name) {
    console.log(dim('\nNo name — cancelled.'));
    await pause();
    return;
  }
  const code = await runCmd(`git checkout -b ${name}`);
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doGitSwitchBranch() {
  let branches;
  try {
    branches = execSync('git branch', { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map(b => b.trim().replace(/^\*\s*/, ''))
      .filter(Boolean);
  } catch {
    console.log(red('\n  Could not list branches.\n'));
    await pause();
    return;
  }

  if (!branches.length) {
    console.log(dim('\n  No branches found.\n'));
    await pause();
    return;
  }

  console.log(yel('\n  Available branches:\n'));
  branches.forEach((b, i) => console.log(`  ${yel(`${i + 1}.`)}  ${b}`));
  console.log();

  const raw = await ask(`  ${yel('Branch number')}: `);
  const idx = parseInt(raw, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= branches.length) {
    console.log(dim('\nInvalid selection — cancelled.'));
    await pause();
    return;
  }

  const code = await runCmd(`git checkout ${branches[idx]}`);
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doGitLog() {
  const code = await runCmd('git log --oneline -10');
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

// ─── Dev environment actions ──────────────────────────────────────────────────

async function doDevStart() {
  try { await ensureDockerRunning(); } catch { return; }
  console.log(grn('\n▶ Starting dev containers (detached)...\n'));
  const code = await runCmd(`${DOCKER_DEV} up --build -V -d`);
  if (code === 0) {
    console.log(grn('\n  App  →  http://localhost:5173'));
    console.log(grn('  API  →  http://localhost:3001\n'));
    reportOk();
  } else {
    reportFail(code);
  }
  await pause();
}

async function doDevStop() {
  const code = await runCmd(`${DOCKER_DEV} down`);
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doDevRestart() {
  try { await ensureDockerRunning(); } catch { return; }
  console.log(grn('\n▶ Stopping containers...\n'));
  await runCmd(`${DOCKER_DEV} down`);
  console.log(grn('\n▶ Starting containers...\n'));
  const code = await runCmd(`${DOCKER_DEV} up --build -V -d`);
  if (code === 0) {
    console.log(grn('\n  App  →  http://localhost:5173'));
    console.log(grn('  API  →  http://localhost:3001\n'));
    reportOk();
  } else {
    reportFail(code);
  }
  await pause();
}

async function doDevStatus() {
  const code = await runCmd(`${DOCKER_DEV} ps`);
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

const LOG_MAX_AGE_DAYS = 7;

async function doCleanLogs() {
  const cutoff = Date.now() - LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  let candidates;
  try {
    candidates = readdirSync(LOG_DIR)
      .filter(name => !name.startsWith('.last-'))
      .map(name => {
        const full = join(LOG_DIR, name);
        const st   = statSync(full);
        return { name, full, size: st.size, mtime: st.mtimeMs };
      })
      .filter(f => f.mtime < cutoff);
  } catch (err) {
    console.log(red(`\n  Could not read logs directory: ${err.message}\n`));
    await pause();
    return;
  }

  if (!candidates.length) {
    console.log(grn(`\n  No log files older than ${LOG_MAX_AGE_DAYS} days found.\n`));
    await pause();
    return;
  }

  const totalBytes = candidates.reduce((sum, f) => sum + f.size, 0);
  console.log(yel(`\n  Files older than ${LOG_MAX_AGE_DAYS} days (${(totalBytes / 1024).toFixed(1)} KB total):\n`));
  candidates.forEach(f => {
    const age = Math.floor((Date.now() - f.mtime) / 86_400_000);
    const kb  = (f.size / 1024).toFixed(1);
    console.log(`  ${dim('•')} ${f.name}  ${dim(`${kb} KB, ${age}d old`)}`);
  });
  console.log();

  const confirmed = await confirm(`  Delete ${candidates.length} file(s)?`);
  if (!confirmed) {
    console.log(dim('\nCancelled.'));
    await pause();
    return;
  }

  let deleted = 0;
  for (const f of candidates) {
    try {
      unlinkSync(f.full);
      deleted++;
    } catch (err) {
      console.log(red(`  ✗ ${f.name}: ${err.message}`));
    }
  }
  console.log(boldGrn(`\n  Deleted ${deleted} of ${candidates.length} file(s).`));
  await pause();
}

// ─── Production actions ───────────────────────────────────────────────────────

async function doProdBuild() {
  const code = await runCmd(`${DOCKER_PROD} build`);
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

async function doProdChecks() {
  console.log(red('\n▶ Linting client...\n'));
  const r1 = await runCmd('npm run lint --prefix client', { logFile: CHECKS_LOG });

  console.log(red('\n▶ Linting server...\n'));
  const r2 = await runCmd('npm run lint --prefix server', { logFile: CHECKS_LOG, append: true });

  console.log(red('\n▶ Client tests...\n'));
  const r3 = await runCmd('npm test --prefix client',     { logFile: CHECKS_LOG, append: true });

  console.log(red('\n▶ Server tests...\n'));
  const r4 = await runCmd('npm test --prefix server',     { logFile: CHECKS_LOG, append: true });

  console.log(red('\n▶ E2E tests  (requires dev stack running — start first from Dev → 1)\n'));
  const r5 = await runCmd('npm run e2e',                  { logFile: CHECKS_LOG, append: true });

  const allPassed = [r1, r2, r3, r4, r5].every(r => r === 0);
  const summary   = allPassed
    ? '\n✓ All pre-deploy checks passed.\n'
    : '\n✗ One or more checks failed — do not deploy.\n';

  const ws = createWriteStream(CHECKS_LOG, { flags: 'a' });
  ws.end(summary);

  if (allPassed) {
    console.log(boldGrn(summary));
  } else {
    console.log(boldRed(summary));
  }
  await pause();
}

async function doDeploy() {
  // Exact wording required by spec
  const confirmed = await confirm('Are you sure you want to deploy to production?');
  if (!confirmed) {
    console.log(dim('\nDeploy aborted.'));
    await pause();
    return;
  }

  console.log(red('\n▶ Deploying to production...\n'));
  const code = await runCmd(`${DOCKER_PROD} up -d`, { logFile: DEPLOY_LOG });
  if (code === 0) {
    reportOk();
    await runCmd(`${DOCKER_PROD} ps`, { logFile: DEPLOY_LOG, append: true });
  } else {
    reportFail(code);
  }
  await pause();
}

async function doDeployStatus() {
  const code = await runCmd(`${DOCKER_PROD} ps`);
  code === 0 ? reportOk() : reportFail(code);
  await pause();
}

// ─── Sub-menu routers ─────────────────────────────────────────────────────────

async function testingMenu() {
  clearScreen();
  printHeader();
  printTestingMenu();
  const choice = await ask(`  ${blue('Choice')}: `);

  switch (choice) {
    case '1': return doRunAllTests();
    case '2': return doRunSpecificTest();
    case '3': return doWatchTests();
    case '4': return doShowLastTestResults();
    case '5': return doRunE2eTests();
    case '0': return;
    default:
      console.log(red('\n  Invalid choice.'));
      await pause();
  }
}

async function gitMenu() {
  clearScreen();
  printHeader();
  printGitMenu();
  const choice = await ask(`  ${yel('Choice')}: `);

  switch (choice) {
    case '1': return doGitStatus();
    case '2': return doGitStageAll();
    case '3': return doGitCommit();
    case '4': return doGitPush();
    case '5': return doGitPull();
    case '6': return doGitNewBranch();
    case '7': return doGitSwitchBranch();
    case '8': return doGitLog();
    case '0': return;
    default:
      console.log(red('\n  Invalid choice.'));
      await pause();
  }
}

async function devMenu() {
  clearScreen();
  printHeader();
  printDevMenu();
  const choice = await ask(`  ${grn('Choice')}: `);

  switch (choice) {
    case '1': return doDevStart();
    case '2': return doDevStop();
    case '3': return doDevRestart();
    case '4': return doDevStatus();
    case '5': return doCleanLogs();
    case '0': return;
    default:
      console.log(red('\n  Invalid choice.'));
      await pause();
  }
}

async function prodMenu() {
  clearScreen();
  printHeader();
  printProdMenu();
  const choice = await ask(`  ${red('Choice')}: `);

  switch (choice) {
    case '1': return doProdBuild();
    case '2': return doProdChecks();
    case '3': return doDeploy();
    case '4': return doDeployStatus();
    case '0': return;
    default:
      console.log(red('\n  Invalid choice.'));
      await pause();
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log(dim('\n\n  Interrupted. Goodbye!\n'));
  process.exit(0);
});

async function main() {
  while (true) {
    clearScreen();
    printHeader();
    printMainMenu();
    const choice = await ask('  Choice: ');

    switch (choice) {
      case '1': await testingMenu(); break;
      case '2': await gitMenu();     break;
      case '3': await devMenu();     break;
      case '4': await prodMenu();    break;
      case '5':
        clearScreen();
        console.log(cyn('\n  Goodbye!\n'));
        process.exit(0);
        break;
      default:
        console.log(red('\n  Invalid choice.'));
        await pause();
    }
    // Each sub-menu handler returns here → main menu re-renders
  }
}

main().catch(err => {
  console.error(red(`\nFatal: ${err.message}\n`));
  process.exit(1);
});
