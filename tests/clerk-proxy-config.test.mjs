import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test('Clerk browser and middleware use the local Frontend API proxy', async () => {
  const [layout, middleware, proxyConfig] = await Promise.all([
    readFile(projectFile('app/layout.tsx'), 'utf8'),
    readFile(projectFile('proxy.ts'), 'utf8'),
    readFile(projectFile('lib/clerk-proxy.ts'), 'utf8'),
  ]);

  assert.match(proxyConfig, /NODE_ENV\s*===\s*['"]production['"]/);
  assert.match(proxyConfig, /['"]\/__clerk['"]/);
  assert.match(layout, /<ClerkProvider\b[^>]*\bproxyUrl=\{clerkProxyUrl\}/s);
  assert.match(middleware, /clerkMiddleware\(\{\s*proxyUrl:\s*clerkProxyUrl\s*\}\)/s);
});
