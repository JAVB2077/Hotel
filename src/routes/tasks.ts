import { Elysia, t } from 'elysia'
import { db } from '../db'
import { tasks, rooms } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { broadcast } from '../ws/live'

export const taskRoutes = new Elysia({ prefix: '/api/tasks', tags: ['tasks'] })
  .use(authMiddleware)

  // GET /api/tasks — tareas del usuario actual (staff ve las suyas, admin ve todas)
  .get('/', async ({ currentUser }) => {
    const filter = currentUser.role === 'admin'
      ? sql`1=1`
      : eq(tasks.assignedTo, currentUser.id)

    return db
      .select({
        id:           tasks.id,
        type:         tasks.type,
        status:       tasks.status,
        title:        tasks.title,
        description:  tasks.description,
        priority:     tasks.priority,
        roomNumber:   rooms.number,
        scheduledFor: tasks.scheduledFor,
        completedAt:  tasks.completedAt,
        createdAt:    tasks.createdAt,
      })
      .from(tasks)
      .leftJoin(rooms, eq(tasks.roomId, rooms.id))
      .where(filter)
      .orderBy(tasks.priority, sql`${tasks.createdAt} DESC`)
  }, {
    detail: { summary: 'Listar tareas', tags: ['tasks'] },
  })

  // POST /api/tasks
  .post('/', async ({ body, currentUser }) => {
    let roomId: string | null = null
    if (body.roomNumber) {
      const [room] = await db.select().from(rooms).where(eq(rooms.number, body.roomNumber)).limit(1)
      if (room) roomId = room.id
    }

    const [created] = await db.insert(tasks).values({
      roomId:       roomId,
      assignedTo:   body.assignedTo ?? currentUser.id,
      createdBy:    currentUser.id,
      type:         body.type,
      title:        body.title,
      description:  body.description ?? null,
      priority:     body.priority ?? 2,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
    }).returning()

    broadcast('staff', { type: 'new_task', task: created })
    return created
  }, {
    body: t.Object({
      roomNumber:   t.Optional(t.Number()),
      assignedTo:   t.Optional(t.String()),
      type:         t.Union([t.Literal('cleaning'),t.Literal('service'),t.Literal('maintenance'),t.Literal('urgent')]),
      title:        t.String({ minLength: 1 }),
      description:  t.Optional(t.String()),
      priority:     t.Optional(t.Number({ default: 2 })),
      scheduledFor: t.Optional(t.String()),
    }),
    detail: { summary: 'Crear tarea', tags: ['tasks'] },
  })

  // PATCH /api/tasks/:id/complete
  .patch('/:id/complete', async ({ params, currentUser }) => {
    const [updated] = await db.update(tasks)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, params.id))
      .returning()

    // Agregar a bitácora
    const { shiftLogs } = await import('../db/schema')
    await db.insert(shiftLogs).values({
      userId:      currentUser.id,
      type:        'completed',
      title:       `Tarea completada: ${updated.title}`,
      description: null,
      roomId:      updated.roomId,
    })

    broadcast('recepcion', { type: 'task_completed', task: updated })
    return updated
  }, {
    detail: { summary: 'Completar tarea', tags: ['tasks'] },
  })

  // PATCH /api/tasks/:id/status
  .patch('/:id/status', async ({ params, body }) => {
    const [updated] = await db.update(tasks)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(tasks.id, params.id))
      .returning()
    return updated
  }, {
    body: t.Object({
      status: t.Union([t.Literal('pending'),t.Literal('in_progress'),t.Literal('completed'),t.Literal('cancelled')]),
    }),
    detail: { summary: 'Cambiar estado de tarea', tags: ['tasks'] },
  })
