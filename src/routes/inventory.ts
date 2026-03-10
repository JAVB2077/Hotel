import { Elysia, t } from 'elysia'
import { db } from '../db'
import { inventory } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

export const inventoryRoutes = new Elysia({ prefix: '/api/inventory', tags: ['inventory'] })
  .use(authMiddleware)

  .get('/', async () => {
    return db.select().from(inventory).orderBy(inventory.category, inventory.name)
  }, { detail: { summary: 'Listar inventario', tags: ['inventory'] } })

  .patch('/:id/adjust', async ({ params, body, currentUser }) => {
    const [item] = await db.select().from(inventory).where(eq(inventory.id, params.id)).limit(1)
    if (!item) return { error: 'Item no encontrado' }

    const newQty = Math.max(0, Math.min(item.maxQuantity, item.quantity + body.delta))
    const [updated] = await db.update(inventory)
      .set({ quantity: newQty, updatedBy: currentUser.id, updatedAt: new Date() })
      .where(eq(inventory.id, params.id))
      .returning()
    return updated
  }, {
    body: t.Object({ delta: t.Number() }),
    detail: { summary: 'Ajustar cantidad de inventario', tags: ['inventory'] },
  })

  .post('/request', async ({ body, currentUser }) => {
    // Registrar solicitud de reposición en shift_logs
    const { shiftLogs } = await import('../db/schema')
    const [item] = await db.select().from(inventory).where(eq(inventory.id, body.itemId)).limit(1)
    if (!item) return { error: 'Item no encontrado' }

    await db.insert(shiftLogs).values({
      userId:      currentUser.id,
      type:        'restock_request',
      title:       `Solicitud reposición: ${item.name}`,
      description: `Stock actual: ${item.quantity}/${item.maxQuantity} ${item.unit}`,
    })
    return { success: true, item: item.name }
  }, {
    body: t.Object({ itemId: t.String() }),
    detail: { summary: 'Solicitar reposición', tags: ['inventory'] },
  })
