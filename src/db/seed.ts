/**
 * SEED — Grand Élite Hotels
 * Ejecutar: bun run src/db/seed.ts
 * Puebla la base de datos con datos iniciales reales.
 */

import { db } from './index'
import { users, floors, rooms, guests, reservations, inventory } from './schema'

console.log('🌱 Iniciando seed...\n')

// ── USUARIOS ─────────────────────────────────────────────────────────────────
console.log('→ Usuarios...')
const usersSeed = [
  { fullName: 'Administrador',       username: 'admin',     password: 'admin123',      role: 'admin'     as const, shift: 'full'      as const },
  { fullName: 'Recepcionista 1',     username: 'recepcion', password: 'recep123',      role: 'recepcion' as const, shift: 'morning'   as const },
  { fullName: 'Staff Housekeeping',  username: 'staff',     password: 'staff123',      role: 'staff'     as const, shift: 'afternoon' as const },
  { fullName: 'María Hernández',     username: 'maria.h',   password: 'maria123',      role: 'staff'     as const, shift: 'morning'   as const },
  { fullName: 'Carlos Ruiz',         username: 'carlos.r',  password: 'carlos123',     role: 'staff'     as const, shift: 'afternoon' as const },
  { fullName: 'Ana Recepción',       username: 'ana.r',     password: 'ana123',        role: 'recepcion' as const, shift: 'afternoon' as const },
]

for (const u of usersSeed) {
  const hash = await Bun.password.hash(u.password, { algorithm: 'bcrypt', cost: 10 })
  await db.insert(users).values({
    fullName: u.fullName, username: u.username, passwordHash: hash,
    role: u.role, shift: u.shift, status: 'active',
  }).onConflictDoNothing()
}
console.log(`   ✓ ${usersSeed.length} usuarios`)

// ── PISOS ────────────────────────────────────────────────────────────────────
console.log('→ Pisos...')
const floorsSeed = [
  { number: 1, description: 'Piso 1 · Estándar',      totalRooms: 36 },
  { number: 2, description: 'Piso 2 · Doble',          totalRooms: 36 },
  { number: 3, description: 'Piso 3 · Suite',          totalRooms: 36 },
  { number: 4, description: 'Piso 4 · Junior Suite',   totalRooms: 36 },
  { number: 5, description: 'Piso 5 · Suite Deluxe',   totalRooms: 36 },
  { number: 6, description: 'Piso 6 · Executive',      totalRooms: 36 },
  { number: 7, description: 'Penthouse',                totalRooms: 8  },
]

const insertedFloors = await db.insert(floors).values(floorsSeed).onConflictDoNothing().returning()
console.log(`   ✓ ${floorsSeed.length} pisos`)

// Refrescar pisos para obtener IDs
const allFloors = await db.select().from(floors)
const floorMap = Object.fromEntries(allFloors.map(f => [f.number, f.id]))

// ── HABITACIONES ─────────────────────────────────────────────────────────────
console.log('→ Habitaciones (248)...')
type RoomType = 'standard'|'double'|'junior_suite'|'suite_deluxe'|'executive'|'penthouse'
type RoomStatus = 'occupied'|'free_clean'|'free_dirty'|'reserved'|'checkout'|'maintenance'|'blocked'

const floorConfig: Record<number, { type: RoomType; count: number; rate: number }> = {
  1: { type: 'standard',     count: 36, rate: 1200 },
  2: { type: 'double',       count: 36, rate: 1800 },
  3: { type: 'junior_suite', count: 36, rate: 2800 },
  4: { type: 'junior_suite', count: 36, rate: 3200 },
  5: { type: 'suite_deluxe', count: 36, rate: 4500 },
  6: { type: 'executive',    count: 36, rate: 6000 },
  7: { type: 'penthouse',    count: 8,  rate: 14000 },
}

const statusPool: RoomStatus[] = [
  'occupied','occupied','occupied','occupied','occupied',
  'occupied','occupied','occupied','occupied',
  'free_clean','free_clean',
  'free_dirty',
  'reserved',
  'checkout',
  'maintenance',
]

let roomCount = 0
for (const [floorNum, config] of Object.entries(floorConfig)) {
  const fNum = parseInt(floorNum)
  const fId  = floorMap[fNum]
  if (!fId) continue

  for (let i = 1; i <= config.count; i++) {
    const num = fNum * 100 + i
    const status = statusPool[Math.floor(Math.random() * statusPool.length)]
    await db.insert(rooms).values({
      number: num, floorId: fId, type: config.type,
      capacity: fNum >= 5 ? 2 : fNum >= 3 ? 3 : 4,
      ratePerNight: String(config.rate),
      status,
    }).onConflictDoNothing()
    roomCount++
  }
}
console.log(`   ✓ ${roomCount} habitaciones`)

// ── HUÉSPEDES ────────────────────────────────────────────────────────────────
console.log('→ Huéspedes...')
const guestsSeed = [
  { firstName: 'Juan',    lastName: 'Pérez',     email: 'juan@email.com',    phone: '+52 55 1234-5678', nationality: 'México' },
  { firstName: 'Ana',     lastName: 'López',     email: 'ana@email.com',     phone: '+52 33 8765-4321', nationality: 'México' },
  { firstName: 'Robert',  lastName: 'Johnson',   email: 'johnson@corp.com',  phone: '+1 212 555-0190',  nationality: 'USA'    },
  { firstName: 'María',   lastName: 'Rodríguez', email: 'maria@email.com',   phone: '+52 81 2345-6789', nationality: 'México' },
  { firstName: 'Pedro',   lastName: 'Ruiz',      email: 'pedro@email.com',   phone: '+52 55 3456-7890', nationality: 'México' },
  { firstName: 'Laura',   lastName: 'Sánchez',   email: 'laura@email.com',   phone: '+52 55 9876-5432', nationality: 'México' },
  { firstName: 'Carlos',  lastName: 'García',    email: 'garcia@email.com',  phone: '+52 55 6543-2109', nationality: 'México' },
  { firstName: 'Sophie',  lastName: 'Dupont',    email: 'dupont@email.fr',   phone: '+33 1 42 86 77',   nationality: 'Francia'},
]

await db.insert(guests).values(guestsSeed).onConflictDoNothing()
console.log(`   ✓ ${guestsSeed.length} huéspedes`)

// ── INVENTARIO ───────────────────────────────────────────────────────────────
console.log('→ Inventario...')
const inventorySeed = [
  { name: 'Sábanas matrimoniales',  category: 'Ropa de cama', unit: 'jgo', quantity: 24, maxQuantity: 40, minQuantity: 8  },
  { name: 'Toallas de baño',        category: 'Ropa de baño', unit: 'pza', quantity: 8,  maxQuantity: 60, minQuantity: 15 },
  { name: 'Amenities completos',    category: 'Baño',         unit: 'kit', quantity: 35, maxQuantity: 50, minQuantity: 10 },
  { name: 'Agua mineral 500ml',     category: 'Alimentos',    unit: 'bts', quantity: 12, maxQuantity: 80, minQuantity: 20 },
  { name: 'Café molido',            category: 'Alimentos',    unit: 'sob', quantity: 6,  maxQuantity: 20, minQuantity: 5  },
  { name: 'Almohadas extra',        category: 'Ropa de cama', unit: 'pza', quantity: 18, maxQuantity: 30, minQuantity: 6  },
  { name: 'Gel desinfectante',      category: 'Limpieza',     unit: 'fco', quantity: 22, maxQuantity: 40, minQuantity: 10 },
  { name: 'Papel sanitario',        category: 'Limpieza',     unit: 'rol', quantity: 3,  maxQuantity: 100,minQuantity: 25 },
  { name: 'Fundas nórdicas',        category: 'Ropa de cama', unit: 'jgo', quantity: 15, maxQuantity: 25, minQuantity: 5  },
  { name: 'Vasos desechables',      category: 'Alimentos',    unit: 'pza', quantity: 40, maxQuantity: 200,minQuantity: 50 },
]

await db.insert(inventory).values(inventorySeed).onConflictDoNothing()
console.log(`   ✓ ${inventorySeed.length} items de inventario`)

console.log('\n✅ Seed completado exitosamente!')
console.log('\nCredenciales de acceso:')
console.log('  admin     / admin123')
console.log('  recepcion / recep123')
console.log('  staff     / staff123')
