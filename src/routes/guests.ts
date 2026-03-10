import { Elysia, t } from 'elysia'
import { db } from '../db'
import { guests } from '../db/schema'
import { eq, sql, ilike, or } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

export const guestRoutes = new Elysia({ prefix: '/api/guests', tags: ['guests'] })
  .use(authMiddleware)

  .get('/', async ({ query }) => {
    if (query?.search) {
      return db.select().from(guests).where(
        or(
          ilike(guests.firstName, `%${query.search}%`),
          ilike(guests.lastName,  `%${query.search}%`),
          ilike(guests.email,     `%${query.search}%`),
        )
      ).limit(50)
    }
    return db.select().from(guests).orderBy(sql`${guests.totalSpent} DESC`).limit(100)
  }, {
    query: t.Optional(t.Object({ search: t.Optional(t.String()) })),
    detail: { summary: 'Listar huéspedes', tags: ['guests'] },
  })

  .get('/:id', async ({ params, set }) => {
    const [g] = await db.select().from(guests).where(eq(guests.id, params.id)).limit(1)
    if (!g) { set.status = 404; return { error: 'Huésped no encontrado' } }
    return g
  })

  .post('/', async ({ body }) => {
    const [created] = await db.insert(guests).values({
      firstName:   body.firstName,
      lastName:    body.lastName,
      email:       body.email ?? null,
      phone:       body.phone ?? null,
      idType:      body.idType ?? null,
      idNumber:    body.idNumber ?? null,
      nationality: body.nationality ?? 'México',
      notes:       body.notes ?? null,
    }).returning()
    return created
  }, {
    body: t.Object({
      firstName:   t.String({ minLength: 1 }),
      lastName:    t.String({ minLength: 1 }),
      email:       t.Optional(t.String()),
      phone:       t.Optional(t.String()),
      idType:      t.Optional(t.String()),
      idNumber:    t.Optional(t.String()),
      nationality: t.Optional(t.String()),
      notes:       t.Optional(t.String()),
    }),
    detail: { summary: 'Crear huésped', tags: ['guests'] },
  })

  .patch('/:id', async ({ params, body }) => {
    const [updated] = await db.update(guests).set({ ...body, updatedAt: new Date() })
      .where(eq(guests.id, params.id)).returning()
    return updated
  }, {
    body: t.Partial(t.Object({
      firstName: t.String(), lastName: t.String(), email: t.String(),
      phone: t.String(), notes: t.String(),
    })),
    detail: { summary: 'Actualizar huésped', tags: ['guests'] },
  })
