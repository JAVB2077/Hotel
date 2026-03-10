import { Elysia } from 'elysia'
import { jwt } from '@elysiajs/jwt'

// Plugin reutilizable que verifica el JWT en cada ruta protegida
export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  }))
  .derive(async ({ jwt, headers, set }) => {
    const auth = headers.authorization
    if (!auth || !auth.startsWith('Bearer ')) {
      set.status = 401
      throw new Error('Token no proporcionado')
    }
    const token = auth.slice(7)
    const payload = await jwt.verify(token)
    if (!payload) {
      set.status = 401
      throw new Error('Token inválido o expirado')
    }
    return {
      currentUser: payload as { id: string; username: string; role: string },
    }
  })

// Guard por rol — usar como: .use(requireRole('admin'))
export const requireRole = (...roles: string[]) =>
  new Elysia({ name: `role-${roles.join('-')}` })
    .use(authMiddleware)
    .onBeforeHandle(({ currentUser, set }) => {
      if (!roles.includes(currentUser.role)) {
        set.status = 403
        return { error: 'Sin permisos para esta acción', required: roles }
      }
    })
