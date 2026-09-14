import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const repositoryRoot = resolve(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version')
const outputDirectory = resolve(process.argv[2] || join(repositoryRoot, 'release'))
if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) throw new Error(`Release directory is not empty: ${outputDirectory}`)
mkdirSync(outputDirectory, { recursive: true })

// Dependency order is also the npm publication order. pnpm pack converts
// workspace:* to exact registry versions; never rewrite them to GitHub URLs.
const packages = [
  ['sdk/dist', '@rebyteai/agent-sdk', 'rebyteai-agent-sdk'],
  ['server', '@rebyteai/agent-server', 'rebyteai-agent-server'],
  ['react', '@rebyteai/agent-react', 'rebyteai-agent-react'],
  ['ui', '@rebyteai/agent-ui', 'rebyteai-agent-ui'],
  ['cli', '@rebyteai/cli', 'rebyteai-cli'],
]
const archives = []
for (const [directory, name, prefix] of packages) {
  const packageDirectory = join(repositoryRoot, 'packages', directory)
  const source = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'))
  if (source.name !== name || source.version !== version) throw new Error(`Unexpected package identity: ${directory}`)
  execFileSync('pnpm', ['--dir', packageDirectory, 'pack', '--pack-destination', outputDirectory], { stdio: 'inherit' })
  const archive = `${prefix}-${version}.tgz`
  const archivePath = join(outputDirectory, archive)
  const manifest = JSON.parse(execFileSync('tar', ['-xOf', archivePath, 'package/package.json'], { encoding: 'utf8' }))
  for (const [dependency, spec] of Object.entries(manifest.dependencies || {})) {
    if (dependency.startsWith('@rebyteai/') && spec !== version) throw new Error(`${name}: ${dependency} must use registry version ${version}, got ${spec}`)
    if (/^(workspace:|file:|link:)/.test(spec)) throw new Error(`${name}: unpackaged dependency ${dependency}`)
  }
  copyFileSync(archivePath, join(outputDirectory, `${prefix}.tgz`))
  archives.push(archive, `${prefix}.tgz`)
}
const checksums = archives.sort().map(archive => `${createHash('sha256').update(readFileSync(join(outputDirectory, archive))).digest('hex')}  ${archive}`)
writeFileSync(join(outputDirectory, 'SHA256SUMS'), checksums.join('\n') + '\n')
console.log(`Packed npm-ready v${version} into ${outputDirectory}`)
