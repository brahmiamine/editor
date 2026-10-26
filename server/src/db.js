import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'

const connectionOptions = (env) => ({
  ...(env.DB_SOCKET
    ? { socketPath: env.DB_SOCKET }
    : { host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 3306) }),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  timezone: 'Z',
  dateStrings: true,
  charset: 'utf8mb4_unicode_ci',
})

export const createPool = (env = process.env) =>
  mysql.createPool({ ...connectionOptions(env), connectionLimit: Number(env.DB_POOL_SIZE || 10) })

/** Applique le schéma idempotent (CREATE TABLE IF NOT EXISTS…). */
export async function migrate(schemaUrl, env = process.env) {
  const sql = await readFile(schemaUrl, 'utf8')
  const connection = await mysql.createConnection({ ...connectionOptions(env), multipleStatements: true })
  try {
    await connection.query(sql)
  } finally {
    await connection.end()
  }
}

/** DATETIME MariaDB (UTC) → ISO 8601. */
export const toIso = (value) => (value ? `${String(value).replace(' ', 'T')}Z` : value)

/** ISO 8601 → DATETIME(3) MariaDB en UTC. */
export const toDbDateTime = (value) => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 23).replace('T', ' ')
}

export async function transaction(pool, work) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
