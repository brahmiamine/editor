import { createApp } from './app.js'
import { createPool, migrate } from './db.js'

const port = Number(process.env.PORT || 8080)

await migrate(new URL('../schema.sql', import.meta.url))
const pool = createPool()
const server = createApp({ pool })

server.listen(port, () => console.log(`Papertrail API listening on :${port}`))

const shutdown = () => {
  server.close(() => pool.end().finally(() => process.exit(0)))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
