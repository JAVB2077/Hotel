import { Elysia, t } from 'elysia'
import { db } from '../db'
import { reservations, rooms, guests } from '../db/schema'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { broadcast } from '../ws/live'

export const reservationRoutes = new Elysia({ prefix: '/api/reservations', tags: ['reservations'] })
  .use(authMiddleware)

  // GET /api/reservations
  .get('/', async ({ query }) => {
    const base = db
      .select({
        id:           reservations.id,
        code:         reservations.code,
        roomNumber:   rooms.number,
        guestName:    sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`,
        checkInDate:  reservations.checkInDate,
        checkOutDate: reservations.checkOutDate,
        adults:       reservations.adults,
        children:     reservations.children,
        status:       reservations.status,
        totalAmount:  reservations.totalAmount,
        amountPaid:   reservations.amountPaid,
        createdAt:    reservations.createdAt,
      })
      .from(reservations)
      .innerJoin(rooms,   eq(reservations.roomId,  rooms.id))
      .innerJoin(guests,  eq(reservations.guestId, guests.id))
      .orderBy(sql`${reservations.checkInDate} DESC`)

    return base
  }, {
    query: t.Optional(t.Object({ status: t.Optional(t.String()) })),
    detail: { summary: 'Listar reservaciones', tags: ['reservations'] },
  })

  // GET /api/reservations/today — checkins y checkouts de hoy
  .get('/today', async () => {
    const today = new Date().toISOString().split('T')[0]
    const checkins = await db
      .select({
        id: reservations.id, code: reservations.code,
        roomNumber: rooms.number, roomType: rooms.type,
        guestName: sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`,
        checkOutDate: reservations.checkOutDate, adults: reservations.adults,
        children: reservations.children, specialRequests: reservations.specialRequests,
        status: reservations.status,
      })
      .from(reservations)
      .innerJoin(rooms,  eq(reservations.roomId,  rooms.id))
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(and(eq(reservations.checkInDate, today), eq(reservations.status, 'confirmed')))

    const checkouts = await db
      .select({
        id: reservations.id, code: reservations.code,
        roomNumber: rooms.number, roomType: rooms.type,
        guestName: sql<string>`${guests.firstName} || ' ' || ${guests.lastName}`,
        checkInDate: reservations.checkInDate, totalAmount: reservations.totalAmount,
        amountPaid: reservations.amountPaid, status: reservations.status,
      })
      .from(reservations)
      .innerJoin(rooms,  eq(reservations.roomId,  rooms.id))
      .innerJoin(guests, eq(reservations.guestId, guests.id))
      .where(and(eq(reservations.checkOutDate, today), eq(reservations.status, 'checked_in')))

    return { checkins, checkouts, date: today }
  }, {
    detail: { summary: 'Checkins y checkouts de hoy', tags: ['reservations'] },
  })

  // GET /api/reservations/:id
  .get('/:id', async ({ params, set }) => {
    const [res] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, params.id))
      .limit(1)
    if (!res) { set.status = 404; return { error: 'Reservación no encontrada' } }
    return res
  })

  // POST /api/reservations — crear nueva reservación
  .post('/', async ({ body, currentUser, set }) => {
    // Verificar que la habitación existe y está disponible
    const [room] = await db.select().from(rooms).where(eq(rooms.number, body.roomNumber)).limit(1)
    if (!room) { set.status = 404; return { error: 'Habitación no encontrada' } }
    if (room.status === 'occupied' || room.status === 'maintenance' || room.status === 'blocked') {
      set.status = 409; return { error: `Habitación no disponible (${room.status})` }
    }

    // Calcular total
    const nights = Math.ceil(
      (new Date(body.checkOutDate).getTime() - new Date(body.checkInDate).getTime()) / 86400000
    )
    const total = parseFloat(String(room.ratePerNight)) * nights

    // Generar código
    const count = await db.select({ c: sql<number>`count(*)` }).from(reservations)
    const code = `RES-${new Date().getFullYear()}-${String(Number(count[0].c) + 1).padStart(4,'0')}`

    const [created] = await db.insert(reservations).values({
      code,
      roomId:          room.id,
      guestId:         body.guestId,
      createdBy:       currentUser.id,
      checkInDate:     body.checkInDate,
      checkOutDate:    body.checkOutDate,
      adults:          body.adults ?? 1,
      children:        body.children ?? 0,
      totalAmount:     String(total),
      specialRequests: body.specialRequests ?? null,
      status:          'confirmed',
    }).returning()

    // Marcar habitación como reservada
    await db.update(rooms).set({ status: 'reserved', updatedAt: new Date() }).where(eq(rooms.id, room.id))

    broadcast('recepcion', { type: 'new_reservation', reservation: created })
    return created
  }, {
    body: t.Object({
      roomNumber:      t.Number(),
      guestId:         t.String(),
      checkInDate:     t.String(),
      checkOutDate:    t.String(),
      adults:          t.Optional(t.Number({ default: 1 })),
      children:        t.Optional(t.Number({ default: 0 })),
      specialRequests: t.Optional(t.String()),
    }),
    detail: { summary: 'Crear reservación', tags: ['reservations'] },
  })

  // PATCH /api/reservations/:id/checkin
  .patch('/:id/checkin', async ({ params, currentUser, set }) => {
    const [res] = await db.select().from(reservations).where(eq(reservations.id, params.id)).limit(1)
    if (!res) { set.status = 404; return { error: 'Reservación no encontrada' } }
    if (res.status !== 'confirmed') { set.status = 409; return { error: `No se puede hacer check-in (estado: ${res.status})` } }

    await db.update(reservations).set({ status: 'checked_in', checkedInAt: new Date(), updatedAt: new Date() }).where(eq(reservations.id, params.id))
    await db.update(rooms).set({ status: 'occupied', updatedAt: new Date() }).where(eq(rooms.id, res.roomId))

    broadcast('recepcion', { type: 'checkin', reservationId: params.id })
    broadcast('staff',     { type: 'room_status', roomId: res.roomId, status: 'occupied' })
    return { success: true, checkedInAt: new Date() }
  }, {
    detail: { summary: 'Realizar check-in', tags: ['reservations'] },
  })

  // PATCH /api/reservations/:id/checkout
  .patch('/:id/checkout', async ({ params, set }) => {
    const [res] = await db.select().from(reservations).where(eq(reservations.id, params.id)).limit(1)
    if (!res) { set.status = 404; return { error: 'Reservación no encontrada' } }
    if (res.status !== 'checked_in') { set.status = 409; return { error: `No se puede hacer check-out (estado: ${res.status})` } }

    await db.update(reservations).set({ status: 'checked_out', checkedOutAt: new Date(), updatedAt: new Date() }).where(eq(reservations.id, params.id))
    await db.update(rooms).set({ status: 'free_dirty', updatedAt: new Date() }).where(eq(rooms.id, res.roomId))

    // Actualizar stats del huésped
    const { guests: guestsTable } = await import('../db/schema')
    await db.update(guestsTable).set({
      totalStays:  sql`total_stays + 1`,
      totalSpent:  sql`total_spent + ${res.totalAmount}`,
      updatedAt:   new Date(),
    }).where(eq(guestsTable.id, res.guestId))

    broadcast('recepcion', { type: 'checkout', reservationId: params.id })
    broadcast('staff',     { type: 'new_task', message: `Limpieza requerida hab. ${res.roomId}` })
    return { success: true, checkedOutAt: new Date() }
  }, {
    detail: { summary: 'Realizar check-out', tags: ['reservations'] },
  })
