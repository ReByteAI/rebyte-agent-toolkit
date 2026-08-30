import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const repositoryRoot = resolve(import.meta.dirname, '..')
const rootPackage = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))
const version = requireVersion(rootPackage.version, 'root package')
const tag = `v${version}`
const releaseBaseUrl = process.env.REBYTE_RELEASE_BASE_URL
  || `https://github.com/ReByteAI/rebyte-agent-toolkit/releases/download/${tag}`
const outputDirectory = resolve(process.argv[2] || join(repositoryRoot, 'release'))

if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
  throw new Error(`Release output directory is not empty: ${outputDirectory}`)
}
mkdirSync(outputDirectory, { recursive: true })

const packages = [
  {
    directory: 'react',
    archive: `rebyte-agent-react-${version}.tgz`,
    latestArchive: 'rebyte-agent-react.tgz',
  },
  {
    directory: 'ui',
    archive: `rebyte-agent-ui-${version}.tgz`,
    latestArchive: 'rebyte-agent-ui.tgz',
    dependencies: {
      '@rebyte/agent-react': `${releaseBaseUrl}/rebyte-agent-react-${version}.tgz`,
    },
  },
  {
    directory: 'cli',
    archive: `rebyte-cli-${version}.tgz`,
    latestArchive: 'rebyte-cli.tgz',
  },
]

for (const packageDefinition of packages) {
  const packageDirectory = join(repositoryRoot, 'packages', packageDefinition.directory)
  const packageJson = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'))
  const packageVersion = requireVersion(packageJson.version, packageJson.name)
  if (packageVersion !== version) {
    throw new Error(`${packageJson.name} is ${packageVersion}; expected ${version}`)
  }
  execFileSync(
    'pnpm',
    ['--dir', packageDirectory, 'pack', '--pack-destination', outputDirectory],
    { stdio: 'inherit' },
  )
  const archivePath = join(outputDirectory, packageDefinition.archive)
  if (!existsSync(archivePath)) throw new Error(`pnpm did not create ${archivePath}`)
  if (packageDefinition.dependencies) {
    rewriteDependencies(archivePath, packageDefinition.dependencies)
  }
  copyFileSync(archivePath, join(outputDirectory, packageDefinition.latestArchive))
}

const archives = packages
  .flatMap((packageDefinition) => [
    packageDefinition.archive,
    packageDefinition.latestArchive,
  ])
  .sort()
const checksums = archives.map((archive) => {
  const digest = createHash('sha256')
    .update(readFileSync(join(outputDirectory, archive)))
    .digest('hex')
  return `${digest}  ${archive}`
})
writeFileSync(join(outputDirectory, 'SHA256SUMS'), `${checksums.join('\n')}\n`, 'utf8')
process.stdout.write(`Packed ${tag} into ${outputDirectory}\n`)

function requireVersion(value, label) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`${label} has an invalid version`)
  }
  return value
}

function rewriteDependencies(archivePath, dependencies) {
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'rebyte-release-pack-'))
  const replacementArchive = join(stagingDirectory, basename(archivePath))
  try {
    execFileSync('tar', ['-xzf', archivePath, '-C', stagingDirectory])
    const manifestPath = join(stagingDirectory, 'package', 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest.dependencies !== 'object' || manifest.dependencies === null) {
      throw new Error(`${manifest.name} does not contain dependencies`)
    }
    for (const [name, url] of Object.entries(dependencies)) {
      if (typeof manifest.dependencies[name] !== 'string') {
        throw new Error(`${manifest.name} does not depend on ${name}`)
      }
      manifest.dependencies[name] = url
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    execFileSync('tar', [
      '-czf', replacementArchive,
      '-C', stagingDirectory,
      'package',
    ])
    renameSync(replacementArchive, archivePath)
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true })
  }
}
