import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const directory = resolve(process.argv[2] || join(root, 'release'))
const registry = 'https://registry.npmjs.org'
const packages = [
  ['@rebyteai/agent-sdk', 'rebyteai-agent-sdk'],
  ['@rebyteai/agent-server', 'rebyteai-agent-server'],
  ['@rebyteai/agent-react', 'rebyteai-agent-react'],
  ['@rebyteai/agent-ui', 'rebyteai-agent-ui'],
  ['@rebyteai/cli', 'rebyteai-cli'],
]

// Stop on registry/auth failures. On retry, skip only byte-identical versions.
// npm is used for registry publication/OIDC; pnpm owns installation and packing.
for (const [name, prefix] of packages) {
  const archive = join(directory, `${prefix}-${version}.tgz`)
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }))
  if (manifest.name !== name || manifest.version !== version) throw new Error(`Wrong archive: ${archive}`)
  const integrity = `sha512-${createHash('sha512').update(readFileSync(archive)).digest('base64')}`
  const url = `${registry}/${encodeURIComponent(name)}/${version}`
  const response = await fetch(url)
  if (response.ok) {
    const existing = await response.json()
    if (existing.dist?.integrity !== integrity) throw new Error(`${name}@${version} exists with different bytes; refusing to replace or skip it`)
    console.log(`Already published, integrity verified: ${name}@${version}`)
    continue
  }
  if (response.status !== 404) throw new Error(`Registry lookup failed: ${response.status} ${name}`)
  execFileSync('npm', ['publish', archive, '--access', 'public', '--ignore-scripts', '--registry', registry, '--loglevel', 'warn'], { stdio: 'inherit' })
  const published = await fetch(url)
  if (!published.ok || (await published.json()).dist?.integrity !== integrity) {
    throw new Error(`Publication integrity not yet verified: ${name}@${version}. Retry after registry propagation.`)
  }
  console.log(`Published and verified: ${name}@${version}`)
}
