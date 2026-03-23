// ============================================================
//  Grand Élite Hotels · API Client
//  Archivo: src/lib/api.js  (o public/api.js)
//  Importar en cada dashboard:
//  <script type="module">
//    import { api, auth } from '/api.js'
//  </script>
// ============================================================

const BASE_URL = import.meta?.env?.PUBLIC_API_URL ?? 'http://localhost:3000'

// ── HELPERS INTERNOS ─────────────────────────────────────────

function getToken() {
  return sessionStorage.getItem('hotel_token')
}

async function request(method, path, body = null) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const options = { method, headers }
  if (body) options.body = JSON.stringify(body)

  const res = await fetch(`${BASE_URL}${path}`, options)

  // Token expirado → redirigir al login
  if (res.status === 401) {
    sessionStorage.clear()
    window.location.href = '/logIn'
    return null
  }

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
  return data
}

const get    = (path)        => request('GET',    path)
const post   = (path, body)  => request('POST',   path, body)
const patch  = (path, body)  => request('PATCH',  path, body)
const del    = (path)        => request('DELETE', path)

// ── AUTH ─────────────────────────────────────────────────────

export const auth = {
  /**
   * Login → guarda token y datos de usuario en sessionStorage
   * Retorna { user, token } o lanza error
   */
  async login(username, password) {
    const data = await post('/api/auth/login', { username, password })
    if (!data) return null
    sessionStorage.setItem('hotel_token',    data.token)
    sessionStorage.setItem('hotel_user',     data.user.username)
    sessionStorage.setItem('hotel_role',     data.user.role)
    sessionStorage.setItem('hotel_fullname', data.user.fullName)
    sessionStorage.setItem('hotel_shift',    data.user.shift)
    sessionStorage.setItem('hotel_id',       data.user.id)
    return data
  },

  logout() {
    sessionStorage.clear()
    window.location.href = '/logIn'
  },

  /**
   * Verificar si hay sesión activa.
   * Llamar al inicio de cada dashboard.
   */
  check(requiredRole = null) {
    const token = getToken()
    const role  = sessionStorage.getItem('hotel_role')
    if (!token) { window.location.href = '/logIn'; return false }
    if (requiredRole && role !== requiredRole) {
      window.location.href = `/${role}/dashboard`
      return false
    }
    return true
  },

  getUser() {
    return {
      id:       sessionStorage.getItem('hotel_id'),
      username: sessionStorage.getItem('hotel_user'),
      role:     sessionStorage.getItem('hotel_role'),
      fullName: sessionStorage.getItem('hotel_fullname'),
      shift:    sessionStorage.getItem('hotel_shift'),
    }
  },
}

// ── ROOMS ────────────────────────────────────────────────────

export const roomsApi = {
  getAll:       ()            => get('/api/rooms'),
  getByFloor:   (floor)       => get(`/api/rooms/by-floor/${floor}`),
  getStats:     ()            => get('/api/rooms/stats'),
  getOne:       (number)      => get(`/api/rooms/${number}`),
  changeStatus: (number, status, notes = '') =>
    patch(`/api/rooms/${number}/status`, { status, notes }),
}

// ── RESERVATIONS ─────────────────────────────────────────────

export const reservationsApi = {
  getAll:   ()    => get('/api/reservations'),
  getToday: ()    => get('/api/reservations/today'),
  getOne:   (id)  => get(`/api/reservations/${id}`),
  create:   (body) => post('/api/reservations', body),
  checkIn:  (id)  => patch(`/api/reservations/${id}/checkin`),
  checkOut: (id)  => patch(`/api/reservations/${id}/checkout`),
}

// ── GUESTS ───────────────────────────────────────────────────

export const guestsApi = {
  getAll:  (search = '') => get(`/api/guests${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getOne:  (id)          => get(`/api/guests/${id}`),
  create:  (body)        => post('/api/guests', body),
  update:  (id, body)    => patch(`/api/guests/${id}`, body),
}

// ── INCIDENTS ────────────────────────────────────────────────

export const incidentsApi = {
  getAll:       (status = '')  => get(`/api/incidents${status ? `?status=${status}` : ''}`),
  create:       (body)         => post('/api/incidents', body),
  changeStatus: (id, status)   => patch(`/api/incidents/${id}/status`, { status }),
  assign:       (id, userId)   => patch(`/api/incidents/${id}/assign`, { userId }),
}

// ── TASKS ────────────────────────────────────────────────────

export const tasksApi = {
  getAll:    ()     => get('/api/tasks'),
  create:    (body) => post('/api/tasks', body),
  complete:  (id)   => patch(`/api/tasks/${id}/complete`),
  setStatus: (id, status) => patch(`/api/tasks/${id}/status`, { status }),
}

// ── USERS ────────────────────────────────────────────────────

export const usersApi = {
  getAll:  ()          => get('/api/users'),
  create:  (body)      => post('/api/users', body),
  update:  (id, body)  => patch(`/api/users/${id}`, body),
  remove:  (id)        => del(`/api/users/${id}`),
}

// ── INVENTORY ────────────────────────────────────────────────

export const inventoryApi = {
  getAll:   ()              => get('/api/inventory'),
  adjust:   (id, delta)     => patch(`/api/inventory/${id}/adjust`, { delta }),
  request:  (itemId)        => post('/api/inventory/request', { itemId }),
}

// ── TRANSACTIONS ─────────────────────────────────────────────

export const transactionsApi = {
  getAll:  (from = '', to = '') => get(`/api/transactions${from ? `?from=${from}&to=${to}` : ''}`),
  getKpis: ()                   => get('/api/transactions/kpis'),
  create:  (body)               => post('/api/transactions', body),
}

// ── WEBSOCKET ────────────────────────────────────────────────

/**
 * Conectar al WebSocket para recibir eventos en tiempo real.
 * 
 * Uso:
 *   const ws = connectLive({
 *     onIncident:    (data) => renderIncidencias(),
 *     onCheckin:     (data) => actualizarMapa(),
 *     onTaskUpdated: (data) => actualizarTareas(),
 *   })
 *   // Para cerrar: ws.close()
 */
export function connectLive(handlers = {}) {
  const role  = sessionStorage.getItem('hotel_role') ?? 'guest'
  const token = getToken() ?? ''
  const wsUrl = BASE_URL.replace('http', 'ws')
  const ws    = new WebSocket(`${wsUrl}/live?role=${role}&token=${token}`)

  ws.onopen = () => {
    console.log(`[WS] Conectado como ${role}`)
    // Ping cada 30s para mantener conexión viva
    ws._pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
    }, 30000)
  }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'new_incident':    handlers.onIncident?.(msg);    break
        case 'incident_updated':handlers.onIncidentUpdate?.(msg); break
        case 'new_reservation': handlers.onReservation?.(msg); break
        case 'checkin':         handlers.onCheckin?.(msg);     break
        case 'checkout':        handlers.onCheckout?.(msg);    break
        case 'new_task':        handlers.onTask?.(msg);        break
        case 'task_completed':  handlers.onTaskComplete?.(msg);break
        case 'room_status':     handlers.onRoomStatus?.(msg);  break
        case 'assigned_incident': handlers.onAssigned?.(msg); break
        case 'pong':            /* ignorar */                  break
        default: handlers.onMessage?.(msg)
      }
    } catch { /* mensaje inválido */ }
  }

  ws.onclose = () => {
    clearInterval(ws._pingInterval)
    console.log('[WS] Desconectado')
    // Reconectar tras 3s si la página sigue abierta
    setTimeout(() => connectLive(handlers), 3000)
  }

  ws.onerror = (e) => console.error('[WS] Error:', e)

  return ws
}