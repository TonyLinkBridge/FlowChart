import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

// A same-page Clerk rewrite must not change loopback origins and proxy the app into itself.
function passThrough(environment, url) {
  const script = `
    import { createRequire } from 'node:module';
    const require = createRequire(process.cwd() + '/package.json');
    const { default: config } = await import('./next.config.ts');
    const { clerkProxyUrl } = await import('./lib/clerk-proxy.ts');
    if (config.skipProxyUrlNormalize) process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = '1';
    else delete process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE;
    const { NextRequest } = require('next/server');
    const { clerkMiddleware } = require('@clerk/nextjs/server');
    const url = ${JSON.stringify(url)};
    const request = new NextRequest(url, { headers: { host: new URL(url).host } });
    const response = await clerkMiddleware({ proxyUrl: clerkProxyUrl })(request, { waitUntil() {}, passThroughOnException() {} });
    console.log(JSON.stringify({ status: response.status, rewrite: response.headers.get('x-middleware-rewrite'), auth: response.headers.get('x-middleware-request-x-clerk-auth-status') }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, NODE_ENV: environment,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('example.accounts.dev$').toString('base64'),
      CLERK_SECRET_KEY: 'sk_test_not_a_real_key_for_signed_out_requests',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output.trim().split('\n').at(-1));
}

test('development Clerk pass-through preserves the IPv4 loopback origin, path and query', () => {
  const url = 'http://127.0.0.1:3012/dashboard?view=history';
  const response = passThrough('development', url);
  assert.equal(response.rewrite, url);
  assert.equal(response.auth, 'signed-out');
});

test('development localhost pass-through still carries signed-out auth headers', () => {
  const url = 'http://localhost:3012/api/flows';
  const response = passThrough('development', url);
  assert.equal(response.rewrite, url);
  assert.equal(response.auth, 'signed-out');
});

test('production pass-through preserves the public origin and authentication', () => {
  const url = 'https://juflow.vercel.app/dashboard';
  const response = passThrough('production', url);
  assert.equal(response.rewrite, url);
  assert.equal(response.auth, 'signed-out');
});
