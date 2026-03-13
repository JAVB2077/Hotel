import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no definida en .env')DATABASE_URL="postgresql://neondb_owner:npg_dr4tiQq6XsWG@ep-polished-queen-akmsry7t.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

JWT_SECRET="grand-elite-secret-2025"

PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:4321
}

const sql = neon(process.env.DATABASE_URL)
export const db = drizzle(sql, { schema, logger: process.env.NODE_ENV === 'development' })
