import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.ts'
import { scheduleMaintenance } from './jobs/maintenance.ts'
import { loadConfig } from './lib/config.ts'
import { createServices } from './services.ts'

const config = loadConfig()
const services = createServices(config)

// The built web bundle sits next to the server in the container; in development the
// Vite dev server serves it instead, so its absence is expected.
const here = dirname(fileURLToPath(import.meta.url))
const webRoot = join(here, '../../web/dist')
const app = createApp({ services, ...(existsSync(webRoot) ? { webRoot } : {}) })

services.queue.start()
await scheduleMaintenance(services.queue)

const server = Bun.serve({
  port: config.port,
  // Home lab servers ingest 4K video; the default 128 MB body limit is not enough.
  maxRequestBodySize: 8 * 1024 * 1024 * 1024,
  idleTimeout: 255,
  fetch: app.fetch,
})

console.log(`imogen listening on http://localhost:${server.port}`)
console.log(`  API docs   ${config.publicUrl}/api/v1/docs`)
console.log(`  MCP        ${config.publicUrl}/mcp`)
if (!existsSync(webRoot)) console.log('  (web bundle not built; run bun run dev:web)')

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down`)
  await server.stop()
  await services.shutdown()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
