import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  AdminPasswordReset,
  AdminUser,
  AdminUserList,
  AdminUserUpdate,
  Invite,
  InviteCreate,
  InviteCreated,
} from '@imogen/shared'
import { type AppEnv, requireHiddenAdmin } from '../auth/middleware.ts'
import { created, ERROR_RESPONSES, NO_CONTENT, ok, security } from './openapi.ts'

const IdParam = z.object({ id: z.uuid() })

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

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/users/{id}',
      tags: ['Admin'],
      summary: 'Change an account’s role, or take its access away',
      security: security(),
      request: {
        params: IdParam,
        body: { content: { 'application/json': { schema: AdminUserUpdate } } },
      },
      responses: { ...ok(AdminUser, 'The updated account'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      const updated = await services.admin.updateUser(c.req.valid('param').id, c.req.valid('json'))
      return c.json(updated, 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/users/{id}',
      tags: ['Admin'],
      summary: 'Delete an account and send its photos to the trash',
      description:
        'The account goes at once. Its photographs are trashed rather than destroyed, so the existing retention sweep clears them and a mistake stays recoverable.',
      security: security(),
      request: { params: IdParam },
      responses: { ...NO_CONTENT, ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      await services.admin.deleteUser(c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/users/{id}/password',
      tags: ['Admin'],
      summary: 'Set a password on someone’s behalf',
      security: security(),
      request: {
        params: IdParam,
        body: { content: { 'application/json': { schema: AdminPasswordReset } } },
      },
      responses: { ...NO_CONTENT, ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      const hash = await services.accounts.hashPassword(c.req.valid('json').password)
      await services.admin.resetPassword(c.req.valid('param').id, hash)
      return c.body(null, 204)
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/invites',
      tags: ['Admin'],
      summary: 'List invitations',
      description: 'Tokens are stored hashed and are never returned here.',
      security: security(),
      responses: {
        ...ok(z.object({ items: z.array(Invite) }), 'The invitations'),
        ...ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const items = await c.get('services').admin.invites()
      return c.json({ items }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/invites',
      tags: ['Admin'],
      summary: 'Invite someone to open an account',
      description: 'The token comes back exactly once. It is stored only as a hash.',
      security: security(),
      request: { body: { content: { 'application/json': { schema: InviteCreate } } } },
      responses: { ...created(InviteCreated, 'The invitation'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      const invite = await services.admin.createInvite(
        c.get('principal').user.id,
        c.req.valid('json'),
      )
      return c.json(invite, 201)
    },
  )

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/invites/{id}',
      tags: ['Admin'],
      summary: 'Revoke an invitation',
      security: security(),
      request: { params: IdParam },
      responses: { ...NO_CONTENT, ...ERROR_RESPONSES },
    }),
    async (c) => {
      await c.get('services').admin.revokeInvite(c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  return app
}
