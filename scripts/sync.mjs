#!/usr/bin/env node
// usage: npm run sync -- "commit message"
//        npm run sync -- "fix: bug" --skip-push
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const skipPush = args.includes('--skip-push');
const msg = args.filter((a) => a !== '--skip-push').join(' ').trim();

if (!msg) {
  console.error('usage: npm run sync -- "commit message" [--skip-push]');
  process.exit(1);
}

function run(cmd, argv) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('git', ['add', '.']);
run('git', ['commit', '-m', msg]);
if (!skipPush) run('git', ['push']);
