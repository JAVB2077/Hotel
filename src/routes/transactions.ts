import { Elysia, t } from 'elysia'
import { db } from '../db'
import { transactions } from '../db/schema'
import { eq, sql, and, gte, lte } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

export const transactionRoutes = new Elysia({ prefix: '/api/transactions', tags: ['transactions'] })
  .use(authMiddleware)

  // GET /api/transactions — con filtro opcional de mes
  .get('/', async ({ query }) => {
    const conditions = []
    if (query?.from) conditions.push(gte(transactions.createdAt, new Date(query.from)))
    if (query?.to)   conditions.push(lte(transactions.createdAt, new Date(query.to)))

    return db.select().from(transactions)
      .where(conditions.length ? and(...conditions) : sql`1=1`)
      .orderBy(sql`${transactions.createdAt} DESC`)
      .limit(100)
  }, {
    query: t.Optional(t.Object({
      from: t.Optional(t.String()),
      to:   t.Optional(t.String()),
    })),
    detail: { summary: 'Listar transacciones', tags: ['transactions'] },
  })

  // GET /api/transactions/kpis — KPIs financieros del mes actual
  .get('/kpis', async () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const [result] = await db.select({
      totalIncome:  sql<number>`COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END), 0)`,
      totalExpense: sql<number>`COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0)`,
      netProfit:    sql<number>`COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE -amount END), 0)`,
      count:        sql<number>`COUNT(*)`,
    }).from(transactions).where(
      and(gte(transactions.createdAt, firstDay), lte(transactions.createdAt, lastDay))
    )

    // Por categoría
    const byCategory = await db.select({
      category: transactions.category,
      type:     transactions.type,
      total:    sql<number>`SUM(amount)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, firstDay), lte(transactions.createdAt, lastDay)))
      .groupBy(transactions.category, transactions.type)
      .orderBy(sql`SUM(amount) DESC`)

    return {
      period:       { from: firstDay, to: lastDay },
      totalIncome:  Number(result.totalIncome),
      totalExpense: Number(result.totalExpense),
      netProfit:    Number(result.netProfit),
      margin:       result.totalIncome > 0 ? Math.round(Number(result.netProfit) / Number(result.totalIncome) * 100 * 10) / 10 : 0,
      byCategory,
    }
  }, {
    detail: { summary: 'KPIs financieros del mes', tags: ['transactions'] },
  })

  // POST /api/transactions
  .post('/', async ({ body, currentUser }) => {
    const [created] = await db.insert(transactions).values({
      reservationId: body.reservationId ?? null,
      createdBy:     currentUser.id,
      type:          body.type,
      category:      body.category,
      concept:       body.concept,
      amount:        String(body.amount),
      method:        body.method ?? 'card',
      reference:     body.reference ?? null,
      notes:         body.notes ?? null,
    }).returning()
    return created
  }, {
    body: t.Object({
      reservationId: t.Optional(t.String()),
      type:          t.Union([t.Literal('income'), t.Literal('expense')]),
      category:      t.String({ minLength: 1 }),
      concept:       t.String({ minLength: 1 }),
      amount:        t.Number({ minimum: 0 }),
      method:        t.Optional(t.Union([t.Literal('cash'),t.Literal('card'),t.Literal('transfer'),t.Literal('other')])),
      reference:     t.Optional(t.String()),
      notes:         t.Optional(t.String()),
    }),
    detail: { summary: 'Registrar transacción', tags: ['transactions'] },
  })
