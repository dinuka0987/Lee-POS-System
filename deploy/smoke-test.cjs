/* eslint-disable @typescript-eslint/no-require-imports */
// Local-only container check. Creates an ephemeral, untrusted test certificate.
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const https = require('node:https');
const http = require('node:http');
const { createRequire } = require('node:module');
const root = resolve(__dirname, '..');
const localRequire = createRequire(join(root, 'apps/api/package.json'));
localRequire('dotenv').config({ path: join(root, '.env'), quiet: true });
const docker =
  process.env.DOCKER_EXE ||
  (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe')
    : 'docker');
const openssl =
  process.env.OPENSSL_EXE ||
  (process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe')
    ? 'C:/Program Files/Git/usr/bin/openssl.exe'
    : 'openssl');
const runId = randomUUID();
const apiName = `lee-smoke-api-${runId.slice(0, 8)}`;
const webName = `lee-smoke-web-${runId.slice(0, 8)}`;
const created = [];
const tls = resolve(mkdtempSync(join(tmpdir(), 'lee-pos-tls-')));
function run(...args) {
  const result = spawnSync(docker, args, { encoding: 'utf8', env: process.env, windowsHide: true });
  if (result.status !== 0) throw new Error(`Local Docker check failed during ${args[0]}`);
  return result.stdout.trim();
}
function request(protocol, port, path) {
  return new Promise((accept, reject) => {
    const client = protocol === 'https' ? https : http;
    const req = client.get(
      {
        hostname: '127.0.0.1',
        port,
        path,
        headers: { Host: 'shop.example.test' },
        ...(protocol === 'https'
          ? { rejectUnauthorized: false, servername: 'shop.example.test' }
          : {}),
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () =>
          accept({ status: response.statusCode, headers: response.headers, body }),
        );
      },
    );
    req.setTimeout(3000, () => req.destroy(new Error('Local test request timed out')));
    req.on('error', reject);
  });
}
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('Configure the local .env and start PostgreSQL before this test');
  if (process.env.DOCKER_HOST && !/^(unix:|npipe:)/.test(process.env.DOCKER_HOST))
    throw new Error('This smoke check requires a local Docker daemon');
  const endpoint = run('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}');
  if (!/^(unix:|npipe:)/.test(endpoint))
    throw new Error('Switch to the local Docker context before running this check');
  const url = new URL(process.env.DATABASE_URL);
  url.hostname = 'postgres';
  url.port = '5432';
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  process.env.NODE_ENV = 'production';
  process.env.API_HOST = '0.0.0.0';
  process.env.API_PORT = '3000';
  process.env.WEB_ORIGIN = 'https://shop.example.test';
  writeFileSync(join(tls, 'openssl.cnf'), '[req]\ndistinguished_name=dn\n[dn]\n');
  const cert = spawnSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=shop.example.test',
      '-config',
      join(tls, 'openssl.cnf'),
      '-keyout',
      join(tls, 'privkey.pem'),
      '-out',
      join(tls, 'fullchain.pem'),
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  if (cert.status !== 0) throw new Error('Could not generate the temporary local test certificate');
  const network = process.env.LEE_LOCAL_NETWORK || 'lee-pos_default';
  run(
    'run',
    '-d',
    '--name',
    apiName,
    '--label',
    `lee-pos.smoke=${runId}`,
    '--network',
    network,
    '--network-alias',
    'api',
    ...[
      'DATABASE_URL',
      'JWT_SECRET',
      'NODE_ENV',
      'API_HOST',
      'API_PORT',
      'WEB_ORIGIN',
      'BRANCH_ID',
    ].flatMap((key) => ['--env', key]),
    'lee-pos-api:local',
  );
  created.push(apiName);
  let ready = false;
  for (let count = 0; count < 30; count++) {
    try {
      run(
        'exec',
        apiName,
        'node',
        '-e',
        "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
      );
      ready = true;
      break;
    } catch {
      await new Promise((accept) => setTimeout(accept, 500));
    }
  }
  if (!ready) throw new Error('The pruned API image did not become healthy');
  if (run('port', apiName)) throw new Error('The API must not expose a host port');
  run(
    'run',
    '-d',
    '--name',
    webName,
    '--label',
    `lee-pos.smoke=${runId}`,
    '--network',
    network,
    '--env',
    'DOMAIN=shop.example.test',
    '--mount',
    `type=bind,src=${tls},dst=/etc/letsencrypt/live/shop.example.test,readonly`,
    '--publish',
    '127.0.0.1::443',
    '--publish',
    '127.0.0.1::80',
    'lee-pos-gateway:local',
  );
  created.push(webName);
  const sslPort = Number(run('port', webName, '443/tcp').split(':').at(-1));
  const plainPort = Number(run('port', webName, '80/tcp').split(':').at(-1));
  let site;
  for (let count = 0; count < 20; count++) {
    try {
      site = await request('https', sslPort, '/');
      break;
    } catch {
      await new Promise((accept) => setTimeout(accept, 500));
    }
  }
  if (site?.status !== 200 || !site.headers['content-security-policy'])
    throw new Error('The HTTPS gateway or its security headers failed');
  const manifest = await request('https', sslPort, '/manifest.webmanifest');
  const health = await request('https', sslPort, '/api/health');
  const redirect = await request('http', plainPort, '/');
  const sw = await request('https', sslPort, '/sw.js');
  const docs = await request('https', sslPort, '/api/docs');
  if (
    JSON.parse(manifest.body).display !== 'standalone' ||
    health.status !== 200 ||
    !health.headers['cache-control']?.includes('no-store') ||
    docs.status !== 404 ||
    redirect.status !== 301 ||
    !sw.headers['cache-control']?.includes('no-cache')
  )
    throw new Error('Manifest, API proxy, production docs, redirect, or caching check failed');
  console.log(
    JSON.stringify({
      prunedApi: 'healthy',
      https: site.status,
      apiProxy: health.status,
      httpRedirect: redirect.status,
      installableManifest: true,
      serviceWorkerRevalidation: true,
      securityHeaders: true,
      productionDocsDisabled: true,
    }),
  );
}
void main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const name of created.reverse()) {
      const owned = spawnSync(
        docker,
        ['inspect', '--format', '{{index .Config.Labels "lee-pos.smoke"}}', name],
        { encoding: 'utf8', windowsHide: true },
      );
      if (owned.stdout?.trim() === runId)
        spawnSync(docker, ['rm', '-f', name], { stdio: 'ignore', windowsHide: true });
    }
    if (dirname(tls) === resolve(tmpdir()) && basename(tls).startsWith('lee-pos-tls-'))
      rmSync(tls, { recursive: true, force: true });
  });
