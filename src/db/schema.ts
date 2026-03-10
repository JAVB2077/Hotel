import {
  pgTable, uuid, varchar, text, smallint, integer,
  numeric, timestamp, date, pgEnum, serial, index, uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── ENUMS ────────────────────────────────────────────────────────────────────

export const roomStatusEnum      = pgEnum('room_status',       ['occupied','free_clean','free_dirty','reserved','checkout','maintenance','blocked'])
export const roomTypeEnum        = pgEnum('room_type',         ['standard','double','junior_suite','suite_deluxe','executive','penthouse'])
export const reservationStatusEnum = pgEnum('reservation_status', ['pending','confirmed','checked_in','checked_out','cancelled','no_show'])
export const userRoleEnum        = pgEnum('user_role',         ['admin','recepcion','staff'])
export const shiftTypeEnum       = pgEnum('shift_type',        ['morning','afternoon','night','full'])
export const userStatusEnum      = pgEnum('user_status',       ['active','inactive','vacation','terminated'])
export const incidentTypeEnum    = pgEnum('incident_type',     ['urgent','request','cleaning','technical'])
export const incidentStatusEnum  = pgEnum('incident_status',   ['open','in_progress','resolved','closed'])
export const taskTypeEnum        = pgEnum('task_type',         ['cleaning','service','maintenance','urgent'])
export const taskStatusEnum      = pgEnum('task_status',       ['pending','in_progress','completed','cancelled'])
export const paymentMethodEnum   = pgEnum('payment_method',    ['cash','card','transfer','other'])
export const transactionTypeEnum = pgEnum('transaction_type',  ['income','expense'])

// ── TABLAS ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  fullName:     varchar('full_name',    { length: 120 }).notNull(),
  username:     varchar('username',     { length: 60  }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role:         userRoleEnum('role').notNull().default('staff'),
  shift:        shiftTypeEnum('shift').notNull().default('morning'),
  status:       userStatusEnum('status').notNull().default('active'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  usernameIdx: uniqueIndex('idx_users_username').on(t.username),
  roleIdx:     index('idx_users_role').on(t.role),
}))

export const sessions = pgTable('sessions', {
  id:        text('id').primaryKey(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const floors = pgTable('floors', {
  id:          serial('id').primaryKey(),
  number:      smallint('number').notNull().unique(),
  description: varchar('description', { length: 80 }),
  totalRooms:  smallint('total_rooms').notNull().default(0),
})

export const rooms = pgTable('rooms', {
  id:           uuid('id').primaryKey().defaultRandom(),
  number:       smallint('number').notNull().unique(),
  floorId:      integer('floor_id').notNull().references(() => floors.id),
  type:         roomTypeEnum('type').notNull().default('standard'),
  capacity:     smallint('capacity').notNull().default(2),
  ratePerNight: numeric('rate_per_night', { precision: 10, scale: 2 }).notNull(),
  status:       roomStatusEnum('status').notNull().default('free_clean'),
  notes:        text('notes'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  numberIdx: uniqueIndex('idx_rooms_number').on(t.number),
  statusIdx: index('idx_rooms_status').on(t.status),
  floorIdx:  index('idx_rooms_floor').on(t.floorId),
}))

export const guests = pgTable('guests', {
  id:          uuid('id').primaryKey().defaultRandom(),
  firstName:   varchar('first_name', { length: 80 }).notNull(),
  lastName:    varchar('last_name',  { length: 80 }).notNull(),
  email:       varchar('email',      { length: 160 }).unique(),
  phone:       varchar('phone',      { length: 30  }),
  idType:      varchar('id_type',    { length: 20  }),
  idNumber:    varchar('id_number',  { length: 60  }),
  nationality: varchar('nationality',{ length: 60  }).default('México'),
  notes:       text('notes'),
  totalStays:  integer('total_stays').notNull().default(0),
  totalSpent:  numeric('total_spent', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  emailIdx:    uniqueIndex('idx_guests_email').on(t.email),
  lastNameIdx: index('idx_guests_last_name').on(t.lastName),
}))

export const reservations = pgTable('reservations', {
  id:              uuid('id').primaryKey().defaultRandom(),
  code:            varchar('code', { length: 20 }).notNull().unique(),
  roomId:          uuid('room_id').notNull().references(() => rooms.id),
  guestId:         uuid('guest_id').notNull().references(() => guests.id),
  createdBy:       uuid('created_by').references(() => users.id),
  checkInDate:     date('check_in_date').notNull(),
  checkOutDate:    date('check_out_date').notNull(),
  adults:          smallint('adults').notNull().default(1),
  children:        smallint('children').notNull().default(0),
  status:          reservationStatusEnum('status').notNull().default('pending'),
  totalAmount:     numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  amountPaid:      numeric('amount_paid',  { precision: 12, scale: 2 }).notNull().default('0'),
  specialRequests: text('special_requests'),
  checkedInAt:     timestamp('checked_in_at',  { withTimezone: true }),
  checkedOutAt:    timestamp('checked_out_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  roomIdx:    index('idx_res_room').on(t.roomId),
  guestIdx:   index('idx_res_guest').on(t.guestId),
  statusIdx:  index('idx_res_status').on(t.status),
  ciIdx:      index('idx_res_ci').on(t.checkInDate),
  coIdx:      index('idx_res_co').on(t.checkOutDate),
}))

export const incidents = pgTable('incidents', {
  id:            uuid('id').primaryKey().defaultRandom(),
  roomId:        uuid('room_id').references(() => rooms.id),
  reservationId: uuid('reservation_id').references(() => reservations.id),
  reportedBy:    uuid('reported_by').references(() => users.id),
  assignedTo:    uuid('assigned_to').references(() => users.id),
  type:          incidentTypeEnum('type').notNull().default('request'),
  status:        incidentStatusEnum('status').notNull().default('open'),
  title:         varchar('title',       { length: 200 }).notNull(),
  description:   text('description').notNull(),
  resolvedAt:    timestamp('resolved_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  roomIdx:   index('idx_inc_room').on(t.roomId),
  statusIdx: index('idx_inc_status').on(t.status),
  typeIdx:   index('idx_inc_type').on(t.type),
}))

export const tasks = pgTable('tasks', {
  id:           uuid('id').primaryKey().defaultRandom(),
  roomId:       uuid('room_id').references(() => rooms.id),
  assignedTo:   uuid('assigned_to').references(() => users.id),
  createdBy:    uuid('created_by').references(() => users.id),
  type:         taskTypeEnum('type').notNull().default('cleaning'),
  status:       taskStatusEnum('status').notNull().default('pending'),
  title:        varchar('title',       { length: 200 }).notNull(),
  description:  text('description'),
  priority:     smallint('priority').notNull().default(2),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  completedAt:  timestamp('completed_at',  { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  assignedIdx: index('idx_tasks_assigned').on(t.assignedTo),
  roomIdx:     index('idx_tasks_room').on(t.roomId),
  statusIdx:   index('idx_tasks_status').on(t.status),
}))

export const transactions = pgTable('transactions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  reservationId: uuid('reservation_id').references(() => reservations.id),
  createdBy:     uuid('created_by').references(() => users.id),
  type:          transactionTypeEnum('type').notNull(),
  category:      varchar('category', { length: 80  }).notNull(),
  concept:       varchar('concept',  { length: 200 }).notNull(),
  amount:        numeric('amount',   { precision: 12, scale: 2 }).notNull(),
  method:        paymentMethodEnum('method').notNull().default('card'),
  reference:     varchar('reference', { length: 100 }),
  notes:         text('notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  resIdx:     index('idx_tx_reservation').on(t.reservationId),
  typeIdx:    index('idx_tx_type').on(t.type),
  createdIdx: index('idx_tx_created').on(t.createdAt),
}))

export const shiftLogs = pgTable('shift_logs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id),
  type:        varchar('type',  { length: 40  }).notNull(),
  title:       varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  roomId:      uuid('room_id').references(() => rooms.id),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const inventory = pgTable('inventory', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        varchar('name',     { length: 120 }).notNull(),
  category:    varchar('category', { length: 60  }).notNull(),
  unit:        varchar('unit',     { length: 20  }).notNull().default('pza'),
  quantity:    integer('quantity').notNull().default(0),
  maxQuantity: integer('max_quantity').notNull().default(100),
  minQuantity: integer('min_quantity').notNull().default(10),
  updatedBy:   uuid('updated_by').references(() => users.id),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── RELACIONES ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions:          many(sessions),
  reservations:      many(reservations),
  reportedIncidents: many(incidents, { relationName: 'reported' }),
  assignedIncidents: many(incidents, { relationName: 'assigned' }),
  tasks:             many(tasks),
  shiftLogs:         many(shiftLogs),
}))

export const floorsRelations = relations(floors, ({ many }) => ({
  rooms: many(rooms),
}))

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  floor:        one(floors,  { fields: [rooms.floorId], references: [floors.id] }),
  reservations: many(reservations),
  incidents:    many(incidents),
  tasks:        many(tasks),
}))

export const guestsRelations = relations(guests, ({ many }) => ({
  reservations: many(reservations),
}))

export const reservationsRelations = relations(reservations, ({ one, many }) => ({
  room:         one(rooms,  { fields: [reservations.roomId],   references: [rooms.id]   }),
  guest:        one(guests, { fields: [reservations.guestId],  references: [guests.id]  }),
  creator:      one(users,  { fields: [reservations.createdBy], references: [users.id]  }),
  transactions: many(transactions),
  incidents:    many(incidents),
}))

// ── TIPOS INFERIDOS ──────────────────────────────────────────────────────────

export type User            = typeof users.$inferSelect
export type NewUser         = typeof users.$inferInsert
export type Room            = typeof rooms.$inferSelect
export type NewRoom         = typeof rooms.$inferInsert
export type Guest           = typeof guests.$inferSelect
export type NewGuest        = typeof guests.$inferInsert
export type Reservation     = typeof reservations.$inferSelect
export type NewReservation  = typeof reservations.$inferInsert
export type Incident        = typeof incidents.$inferSelect
export type NewIncident     = typeof incidents.$inferInsert
export type Task            = typeof tasks.$inferSelect
export type NewTask         = typeof tasks.$inferInsert
export type Transaction     = typeof transactions.$inferSelect
export type NewTransaction  = typeof transactions.$inferInsert
export type InventoryItem   = typeof inventory.$inferSelect
