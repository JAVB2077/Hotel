import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no definida en .env')
}

const sql = neon(process.env.DATABASE_URL)
export const db = drizzle(sql, { schema, logger: process.env.NODE_ENV === 'development' })
