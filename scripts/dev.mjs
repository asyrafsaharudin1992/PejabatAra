import { spawn } from 'node:child_process';
import path from 'node:path';

const bin = (name) => path.join(process.cwd(), 'node_modules', '.bin', `${name}${process.platform === 'win32' ? '.cmd' : ''}`);

const api = spawn(bin('tsx'), ['api/local.ts'], { stdio: 'inherit', env: process.env });
const web = spawn(bin('vite'), ['--host', '127.0.0.1', '--port', '3000'], { stdio: 'inherit', env: process.env });

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  setTimeout(() => process.exit(code), 50);
};

api.on('exit', (code) => { if (!stopping && code) stop(code); });
web.on('exit', (code) => { if (!stopping && code) stop(code); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
