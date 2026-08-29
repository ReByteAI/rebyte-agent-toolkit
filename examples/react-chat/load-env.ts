import { loadEnvFile } from 'node:process'
import { resolve } from 'node:path'

try {
  loadEnvFile(resolve(process.cwd(), '.env.local'))
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
}
