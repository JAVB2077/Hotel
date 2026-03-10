import { Elysia } from 'elysia'

// Mapa de conexiones activas por rol
// rol → Set de ServerWebSocket
const connections = new Map<string, Set<any>>()

/**
 * Envía un mensaje a todos los clientes conectados con el rol especificado.
 * Se llama desde cualquier ruta cuando ocurre un evento relevante.
 */
export function broadcast(role: string, data: unknown): void {
  const payload = JSON.stringify(data)
  const pool = connections.get(role)
  if (!pool || pool.size === 0) return
  pool.forEach(ws => {
    try { ws.send(payload) } catch { /* cliente desconectado */ }
  })
}

/**
 * Enviar a todos los roles
 */
export function broadcastAll(data: unknown): void {
  const payload = JSON.stringify(data)
  connections.forEach(pool => {
    pool.forEach(ws => {
      try { ws.send(payload) } catch { /* ignorar */ }
    })
  })
}

export const liveRoutes = new Elysia()
  .ws('/live', {
    // El cliente debe conectarse como:
    // ws://localhost:3000/live?role=recepcion&token=JWT_AQUI
    open(ws) {
      const role  = (ws.data as any).query?.role  ?? 'guest'
      const token = (ws.data as any).query?.token

      // Guardamos el rol en los datos del ws para usarlo en close()
      ;(ws as any).__role = role

      if (!connections.has(role)) connections.set(role, new Set())
      connections.get(role)!.add(ws)

      console.log(`[WS] Conectado: role=${role}, total=${connections.get(role)!.size}`)

      // Confirmar conexión al cliente
      ws.send(JSON.stringify({ type: 'connected', role, timestamp: new Date().toISOString() }))
    },

    close(ws) {
      const role = (ws as any).__role ?? 'guest'
      connections.get(role)?.delete(ws)
      console.log(`[WS] Desconectado: role=${role}, restantes=${connections.get(role)?.size ?? 0}`)
    },

    message(ws, raw) {
      try {
        const msg = JSON.parse(raw as string)

        // Ping/pong para mantener conexión viva
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }))
          return
        }

        // Staff reporta incidencia vía WebSocket (alternativa al REST)
        if (msg.type === 'incident_report') {
          broadcast('recepcion', { type: 'new_incident', data: msg.data, urgent: msg.data?.type === 'urgent' })
          broadcast('admin',     { type: 'new_incident', data: msg.data })
        }

        // Recepción notifica a staff una nueva tarea
        if (msg.type === 'task_assigned') {
          broadcast('staff', { type: 'new_task', data: msg.data })
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Mensaje inválido' }))
      }
    },
  })
