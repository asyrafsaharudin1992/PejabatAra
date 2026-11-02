// Vite/tsx accept extensionless TypeScript imports which native Node ESM rejects.
// Transpile the actual server import graph without bundling and load it in Node,
// matching Vercel's separate emitted modules. No requests or database writes run.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
const root = process.cwd();
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'ara-server-imports-'));
await fs.writeFile(path.join(output, 'package.json'), '{"type":"module"}\n');
await fs.symlink(path.join(root, 'node_modules'), path.join(output, 'node_modules'), 'dir');
const seen = new Set();
async function exists(file) { try { return (await fs.stat(file)).isFile(); } catch { return false; } }
async function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = (await transform(await fs.readFile(file, 'utf8'), { loader: file.endsWith('.tsx') ? 'tsx' : file.endsWith('.ts') ? 'ts' : 'js', format: 'esm', target: 'node20' })).code;
  for (const match of code.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)(["'])(\.{1,2}\/[^"']+)\1/g)) {
    const specifier = match[2];
    assert.ok(path.extname(specifier), `Native Node ESM needs an extension: ${path.relative(root, file)} -> ${specifier}`);
    const resolved = path.resolve(path.dirname(file), specifier);
    const candidates = [resolved, resolved.replace(/\.js$/, '.ts'), resolved.replace(/\.js$/, '.tsx')];
    let found;
    for (const candidate of candidates) if (await exists(candidate)) { found = candidate; break; }
    assert.ok(found, `Missing server module: ${path.relative(root, file)} -> ${specifier}`);
    await visit(found);
  }
  const destination = path.join(output, path.relative(root, file).replace(/\.tsx?$/, '.js'));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, code);
}
for (const entry of ['api/status.ts', 'api/references.ts']) {
  await visit(path.join(root, entry));
  const module = await import(pathToFileURL(path.join(output, entry.replace(/\.ts$/, '.js'))).href);
  assert.equal(typeof module.default, 'function', `${entry} must export a request handler`);
}
console.log(`Native Node ESM server smoke check passed (${seen.size} modules).`);
