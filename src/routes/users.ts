import { Elysia, t } from 'elysia'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { authMiddleware, requireRole } from '../middleware/auth'

export const userRoutes = new Elysia({ prefix: '/api/users', tags: ['users'] })
  .use(authMiddleware)

  // GET /api/users — solo admin
  .get('/', async ({ currentUser, set }) => {
    if (currentUser.role !== 'admin') {
      set.status = 403; return { error: 'Solo administradores' }
    }
    return db.select({
      id:        users.id,
      fullName:  users.fullName,
      username:  users.username,
      role:      users.role,
      shift:     users.shift,
      status:    users.status,
      createdAt: users.createdAt,
    }).from(users).orderBy(users.fullName)
  }, {
    detail: { summary: 'Listar usuarios (admin)', tags: ['users'] },
  })

  // POST /api/users — crear usuario (solo admin)
  .post('/', async ({ body, currentUser, set }) => {
    if (currentUser.role !== 'admin') {
      set.status = 403; return { error: 'Solo administradores' }
    }

    // Verificar username único
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, body.username)).limit(1)
    if (existing) { set.status = 409; return { error: 'El nombre de usuario ya existe' } }

    const hash = await Bun.password.hash(body.password, { algorithm: 'bcrypt', cost: 10 })

    const [created] = await db.insert(users).values({
      fullName:     body.fullName,
      username:     body.username,
      passwordHash: hash,
      role:         body.role,
      shift:        body.shift,
      status:       'active',
    }).returning({
      id: users.id, fullName: users.fullName, username: users.username,
      role: users.role, shift: users.shift, status: users.status,
    })
    return created
  }, {
    body: t.Object({
      fullName: t.String({ minLength: 2 }),
      username: t.String({ minLength: 3 }),
      password: t.String({ minLength: 4 }),
      role:     t.Union([t.Literal('admin'),t.Literal('recepcion'),t.Literal('staff')]),
      shift:    t.Union([t.Literal('morning'),t.Literal('afternoon'),t.Literal('night'),t.Literal('full')]),
    }),
    detail: { summary: 'Crear usuario (admin)', tags: ['users'] },
  })

  // PATCH /api/users/:id — editar (admin puede editar cualquiera, usuario solo su propia contraseña)
  .patch('/:id', async ({ params, body, currentUser, set }) => {
    const isAdmin = currentUser.role === 'admin'
    const isSelf  = currentUser.id === params.id

    if (!isAdmin && !isSelf) { set.status = 403; return { error: 'Sin permisos' } }
    if (!isAdmin && body.role) { set.status = 403; return { error: 'No puedes cambiar tu propio rol' } }

    const updateData: Record<string, any> = { updatedAt: new Date() }
    if (body.fullName) updateData.fullName = body.fullName
    if (body.role     && isAdmin) updateData.role   = body.role
    if (body.shift    && isAdmin) updateData.shift  = body.shift
    if (body.status   && isAdmin) updateData.status = body.status
    if (body.password) {
      updateData.passwordHash = await Bun.password.hash(body.password, { algorithm: 'bcrypt', cost: 10 })
    }

    const [updated] = await db.update(users).set(updateData).where(eq(users.id, params.id)).returning({
      id: users.id, fullName: users.fullName, username: users.username,
      role: users.role, shift: users.shift, status: users.status,
    })
    return updated
  }, {
    body: t.Partial(t.Object({
      fullName: t.String(),
      password: t.String({ minLength: 4 }),
      role:     t.Union([t.Literal('admin'),t.Literal('recepcion'),t.Literal('staff')]),
      shift:    t.Union([t.Literal('morning'),t.Literal('afternoon'),t.Literal('night'),t.Literal('full')]),
      status:   t.Union([t.Literal('active'),t.Literal('inactive'),t.Literal('vacation'),t.Literal('terminated')]),
    })),
    detail: { summary: 'Editar usuario', tags: ['users'] },
  })

  // DELETE /api/users/:id — solo admin, no puede eliminar a sí mismo
  .delete('/:id', async ({ params, currentUser, set }) => {
    if (currentUser.role !== 'admin') { set.status = 403; return { error: 'Solo administradores' } }
    if (currentUser.id === params.id) { set.status = 400; return { error: 'No puedes eliminarte a ti mismo' } }
    await db.update(users).set({ status: 'terminated', updatedAt: new Date() }).where(eq(users.id, params.id))
    return { success: true }
  }, {
    detail: { summary: 'Dar de baja usuario (admin)', tags: ['users'] },
  })
