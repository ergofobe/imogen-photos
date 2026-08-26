import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { AdminUserList } from '@imogen/shared'
import { type AppEnv, requireHiddenAdmin } from '../auth/middleware.ts'
import { ERROR_RESPONSES, ok, security } from './openapi.ts'

/**
 * The administration API.
 *
 * Guarded as a whole rather than route by route, so a new endpoint added here is
 * hidden by default and cannot be left exposed by forgetting a line.
 */
export function createAdminRoutes() {
  const app = new OpenAPIHono<AppEnv>()
  app.use('*', requireHiddenAdmin())

  app.openapi(
    createRoute({
      method: 'get',
      path: '/users',
      tags: ['Admin'],
      summary: 'List every account on the server',
      security: security(),
      responses: { ...ok(AdminUserList, 'The accounts'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const items = await c.get('services').admin.users()
      return c.json({ items }, 200)
    },
  )

  return app
}
