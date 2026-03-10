import { Elysia, t } from 'elysia'
import { db } from '../db'
import { incidents, rooms } from '../db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { broadcast } from '../ws/live'

export const incidentRoutes = new Elysia({ prefix: '/api/incidents', tags: ['incidents'] })
  .use(authMiddleware)

  // GET /api/incidents
  .get('/', async ({ query }) => {
    return db
      .select({
        id:           incidents.id,
        type:         incidents.type,
        status:       incidents.status,
        title:        incidents.title,
        description:  incidents.description,
        roomNumber:   rooms.number,
        createdAt:    incidents.createdAt,
        updatedAt:    incidents.updatedAt,
      })
      .from(incidents)
      .leftJoin(rooms, eq(incidents.roomId, rooms.id))
      .where(query?.status ? eq(incidents.status, query.status as any) : sql`1=1`)
      .orderBy(
        sql`CASE ${incidents.type} WHEN 'urgent' THEN 0 ELSE 1 END`,
        sql`${incidents.createdAt} DESC`
      )
  }, {
    query: t.Optional(t.Object({ status: t.Optional(t.String()) })),
    detail: { summary: 'Listar incidencias', tags: ['incidents'] },
  })

  // POST /api/incidents — crear incidencia (habitación o staff la reporta)
  .post('/', async ({ body, currentUser }) => {
    // Buscar habitación por número si se proporciona
    let roomId: string | null = null
    if (body.roomNumber) {
      const [room] = await db.select().from(rooms).where(eq(rooms.number, body.roomNumber)).limit(1)
      if (room) roomId = room.id
    }

    const [created] = await db.insert(incidents).values({
      roomId:      roomId,
      reportedBy:  currentUser.id,
      type:        body.type,
      title:       body.title,
      description: body.description,
    }).returning()

    // Notificar a recepción y admin en tiempo real
    broadcast('recepcion', {
      type:      'new_incident',
      incident:  created,
      urgent:    body.type === 'urgent',
    })
    broadcast('admin', { type: 'new_incident', incident: created })

    return created
  }, {
    body: t.Object({
      roomNumber:  t.Optional(t.Number()),
      type:        t.Union([t.Literal('urgent'),t.Literal('request'),t.Literal('cleaning'),t.Literal('technical')]),
      title:       t.String({ minLength: 1, maxLength: 200 }),
      description: t.String({ minLength: 1 }),
    }),
    detail: { summary: 'Crear incidencia', tags: ['incidents'] },
  })

  // PATCH /api/incidents/:id/status
  .patch('/:id/status', async ({ params, body, currentUser }) => {
    const updateData: Record<string, any> = {
      status:    body.status,
      updatedAt: new Date(),
    }
    if (body.status === 'resolved') {
      updateData.resolvedAt = new Date()
      updateData.assignedTo = currentUser.id
    }
    const [updated] = await db.update(incidents)
      .set(updateData)
      .where(eq(incidents.id, params.id))
      .returning()

    broadcast('recepcion', { type: 'incident_updated', incident: updated })
    return updated
  }, {
    body: t.Object({
      status: t.Union([t.Literal('open'),t.Literal('in_progress'),t.Literal('resolved'),t.Literal('closed')]),
    }),
    detail: { summary: 'Actualizar estado de incidencia', tags: ['incidents'] },
  })

  // PATCH /api/incidents/:id/assign
  .patch('/:id/assign', async ({ params, body }) => {
    const [updated] = await db.update(incidents)
      .set({ assignedTo: body.userId, status: 'in_progress', updatedAt: new Date() })
      .where(eq(incidents.id, params.id))
      .returning()

    broadcast('staff', { type: 'assigned_incident', incident: updated })
    return updated
  }, {
    body: t.Object({ userId: t.String() }),
    detail: { summary: 'Asignar incidencia a usuario', tags: ['incidents'] },
  })
