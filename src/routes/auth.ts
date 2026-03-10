import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export const authRoutes = new Elysia({ prefix: '/api/auth', tags: ['auth'] })
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    exp: '8h',
  }))

  // POST /api/auth/login
  .post('/login', async ({ body, jwt, set }) => {
    const { username, password } = body

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)

    if (!user) {
      set.status = 401
      return { error: 'Credenciales incorrectas' }
    }

    if (user.status !== 'active') {
      set.status = 403
      return { error: 'Usuario inactivo o dado de baja' }
    }

    // Verificar contraseña con bcrypt de Bun
    const valid = await Bun.password.verify(password, user.passwordHash)
    if (!valid) {
      set.status = 401
      return { error: 'Credenciales incorrectas' }
    }

    // Generar JWT
    const token = await jwt.sign({
      id:       user.id,
      username: user.username,
      role:     user.role,
      shift:    user.shift,
    })

    return {
      token,
      user: {
        id:       user.id,
        fullName: user.fullName,
        username: user.username,
        role:     user.role,
        shift:    user.shift,
        status:   user.status,
      },
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 }),
    }),
    detail: { summary: 'Iniciar sesión', tags: ['auth'] },
  })

  // GET /api/auth/me — validar token y devolver usuario actual
  .get('/me', async ({ jwt, headers, set }) => {
    const token = headers.authorization?.slice(7)
    if (!token) { set.status = 401; return { error: 'No autorizado' } }

    const payload = await jwt.verify(token) as { id: string } | false
    if (!payload) { set.status = 401; return { error: 'Token inválido' } }

    const [user] = await db
      .select({
        id:       users.id,
        fullName: users.fullName,
        username: users.username,
        role:     users.role,
        shift:    users.shift,
        status:   users.status,
      })
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1)

    if (!user) { set.status = 404; return { error: 'Usuario no encontrado' } }
    return user
  }, {
    detail: { summary: 'Obtener usuario actual', tags: ['auth'] },
  })
