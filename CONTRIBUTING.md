# Contributing

Thanks for looking. imogen is small enough that a patch can land quickly.

## Getting set up

```bash
bun install
docker compose -f docker/compose.dev.yml up -d
export DATABASE_URL='postgres://imogen:imogen@localhost:5432/imogen'
bun run db:migrate
bun run dev      # and, in another terminal, bun run dev:web
```

## Before you open a pull request

```bash
bun run lint
bun run typecheck
bun test
```

## How this codebase is tested

Tests run against a real Postgres and a real HTTP server. That is deliberate: the
behaviour most worth protecting lives in unique indexes, transactional guards, PKCE
verification, and a generated search vector — and a mocked store would happily let all
of those be wrong.

Two habits are worth keeping:

- **Write the test first and watch it fail.** A test that passed the moment you wrote it
  has not been shown to catch anything.
- **When you fix a bug, first write the test that reproduces it.** Several bugs found
  during the initial build round-tripped cleanly through the ORM and were invisible to
  any test that did not ask the database what it had actually stored.

## Changing the API

`packages/shared` is the contract. Change the Zod schema there and the server, SDK, and
web app all move together — that is the point of it. The OpenAPI document is generated
from those schemas, so it cannot drift from what the server actually accepts.

## Database changes

Edit `packages/server/src/db/schema.ts`, then:

```bash
bun run db:generate    # writes a migration
bun run db:migrate     # applies it
```

Commit the generated SQL.

## Notes on style

Small, focused modules. Comments explain *why* — the surprising constraint, the
alternative that was rejected — because what the code does is already on the screen.
