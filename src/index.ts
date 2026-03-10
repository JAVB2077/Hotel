import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { jwt } from '@elysiajs/jwt'
import { swagger } from '@elysiajs/swagger'
import { authRoutes } from './routes/auth'
import { roomRoutes } from './routes/rooms'
import { reservationRoutes } from './routes/reservations'
import { guestRoutes } from './routes/guests'
import { incidentRoutes } from './routes/incidents'
import { taskRoutes } from './routes/tasks'
import { userRoutes } from './routes/users'
import { inventoryRoutes } from './routes/inventory'
import { transactionRoutes } from './routes/transactions'
import { liveRoutes } from './ws/live'

const app = new Elysia()
  .use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:4321',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  }))
  .use(swagger({
    path: '/swagger',
    documentation: {
      info: { title: 'Grand Élite Hotels API', version: '1.0.0' },
      tags: [
        { name: 'auth',         description: 'Autenticación' },
        { name: 'rooms',        description: 'Habitaciones' },
        { name: 'reservations', description: 'Reservaciones' },
        { name: 'guests',       description: 'Huéspedes' },
        { name: 'incidents',    description: 'Incidencias' },
        { name: 'tasks',        description: 'Tareas de staff' },
        { name: 'users',        description: 'Gestión de usuarios' },
        { name: 'inventory',    description: 'Inventario' },
        { name: 'transactions', description: 'Transacciones' },
      ],
    },
  }))
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    exp: '8h',
  }))
  // Rutas
  .use(authRoutes)
  .use(roomRoutes)
  .use(reservationRoutes)
  .use(guestRoutes)
  .use(incidentRoutes)
  .use(taskRoutes)
  .use(userRoutes)
  .use(inventoryRoutes)
  .use(transactionRoutes)
  .use(liveRoutes)
  // Health check
  .get('/health', () => ({
    status: 'ok',
    service: 'Grand Élite Hotels API',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }))
  // 404
  .onError(({ code, error }) => {
    if (code === 'NOT_FOUND') return { error: 'Ruta no encontrada', code: 404 }
    console.error(`[ERROR] ${error}`)
    return { error: 'Error interno del servidor', code: 500 }
  })
  .listen(process.env.PORT ?? 3000)

console.log(`\n🏨  Grand Élite API corriendo en http://localhost:${app.server?.port}`)
console.log(`📖  Swagger docs: http://localhost:${app.server?.port}/swagger`)
console.log(`🌍  Entorno: ${process.env.NODE_ENV ?? 'development'}\n`)
