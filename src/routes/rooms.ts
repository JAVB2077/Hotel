import { Elysia, t } from 'elysia'
import { db } from '../db'
import { rooms, floors } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

export const roomRoutes = new Elysia({ prefix: '/api/rooms', tags: ['rooms'] })
  .use(authMiddleware)

  // GET /api/rooms — todas las habitaciones con piso
  .get('/', async () => {
    return db
      .select({
        id:           rooms.id,
        number:       rooms.number,
        floor:        floors.number,
        type:         rooms.type,
        capacity:     rooms.capacity,
        ratePerNight: rooms.ratePerNight,
        status:       rooms.status,
        notes:        rooms.notes,
        updatedAt:    rooms.updatedAt,
      })
      .from(rooms)
      .innerJoin(floors, eq(rooms.floorId, floors.id))
      .orderBy(rooms.number)
  }, {
    detail: { summary: 'Listar habitaciones', tags: ['rooms'] },
  })

  // GET /api/rooms/by-floor/:floor — habitaciones de un piso
  .get('/by-floor/:floor', async ({ params }) => {
    return db
      .select({ id: rooms.id, number: rooms.number, type: rooms.type,
                capacity: rooms.capacity, ratePerNight: rooms.ratePerNight,
                status: rooms.status })
      .from(rooms)
      .innerJoin(floors, eq(rooms.floorId, floors.id))
      .where(eq(floors.number, parseInt(params.floor)))
      .orderBy(rooms.number)
  })

  // GET /api/rooms/stats — conteo por estado
  .get('/stats', async () => {
    const result = await db
      .select({
        status: rooms.status,
        count:  sql<number>`cast(count(*) as integer)`,
      })
      .from(rooms)
      .groupBy(rooms.status)

    const stats = Object.fromEntries(result.map(r => [r.status, r.count]))
    const total = result.reduce((s, r) => s + r.count, 0)
    const occupied = stats['occupied'] ?? 0
    return {
      ...stats,
      total,
      occupancyPct: total > 0 ? Math.round(occupied / total * 100 * 10) / 10 : 0,
    }
  }, {
    detail: { summary: 'Estadísticas de ocupación', tags: ['rooms'] },
  })

  // GET /api/rooms/:number
  .get('/:number', async ({ params, set }) => {
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.number, parseInt(params.number)))
      .limit(1)
    if (!room) { set.status = 404; return { error: 'Habitación no encontrada' } }
    return room
  })

  // PATCH /api/rooms/:number/status — cambiar estado
  .patch('/:number/status', async ({ params, body, currentUser }) => {
    await db
      .update(rooms)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(rooms.number, parseInt(params.number)))

    // Registrar en shift_logs si es staff o recepcion
    const { shiftLogs } = await import('../db/schema')
    await db.insert(shiftLogs).values({
      userId:      currentUser.id,
      type:        'status_change',
      title:       `Hab. ${params.number} → ${body.status}`,
      description: body.notes ?? null,
    })

    return { success: true, number: params.number, newStatus: body.status }
  }, {
    body: t.Object({
      status: t.Union([
        t.Literal('occupied'),    t.Literal('free_clean'),
        t.Literal('free_dirty'),  t.Literal('reserved'),
        t.Literal('checkout'),    t.Literal('maintenance'),
        t.Literal('blocked'),
      ]),
      notes: t.Optional(t.String()),
    }),
    detail: { summary: 'Cambiar estado de habitación', tags: ['rooms'] },
  })

  // POST /api/rooms — crear habitación (solo admin)
  .post('/', async ({ body, currentUser, set }) => {
    if (currentUser.role !== 'admin') {
      set.status = 403; return { error: 'Solo admin puede crear habitaciones' }
    }
    const [floor] = await db.select().from(floors).where(eq(floors.number, body.floor)).limit(1)
    if (!floor) { set.status = 404; return { error: 'Piso no encontrado' } }

    const [created] = await db.insert(rooms).values({
      number:       body.number,
      floorId:      floor.id,
      type:         body.type,
      capacity:     body.capacity,
      ratePerNight: String(body.ratePerNight),
    }).returning()
    return created
  }, {
    body: t.Object({
      number:       t.Number(),
      floor:        t.Number(),
      type:         t.Union([t.Literal('standard'),t.Literal('double'),t.Literal('junior_suite'),t.Literal('suite_deluxe'),t.Literal('executive'),t.Literal('penthouse')]),
      capacity:     t.Number({ default: 2 }),
      ratePerNight: t.Number(),
    }),
    detail: { summary: 'Crear habitación (admin)', tags: ['rooms'] },
  })
