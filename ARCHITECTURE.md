# Architecture

This document explains the architectural philosophy of `tnp-notification` —
**why** the structure looks the way it does, what to **add as the service grows**,
and what to **never add**.

For day-to-day "do this, don't do that" rules, see
[`.claude/rules/`](.claude/rules/). This file is the rationale behind those
rules.

## Service nature

`tnp-notification` is intentionally **small, stateless, and I/O-shaped**:

- **Stateless** — no DB, no cache, no queue. Persistence belongs to Laravel.
  See [`.claude/rules/stateless.md`](.claude/rules/stateless.md).
- **I/O-shaped** — receive HTTP from Laravel → validate → emit Socket.io to
  a per-user room. Almost no domain logic.
- **Small** — currently 2 modules (`health`, `notify`). Designed to stay small.

These three properties shape every decision below. When evaluating a proposed
change, check it against them: if it adds state, adds domain logic, or pushes
the service past "small", reconsider whether it belongs in this repo at all.

## Why we don't use Laravel's pattern

`tnp-backend` (the Laravel sibling) uses Controller → Service → Repository.
That's the right shape for it: lots of entities, lots of business logic,
MySQL-backed. Porting that here would be over-engineering for a fundamentally
different kind of service.

| Aspect          | tnp-backend                | tnp-notification         |
| --------------- | -------------------------- | ------------------------ |
| Persistence     | MySQL, dozens of entities  | None — stateless         |
| Business logic  | Quotations, accounting, KPI| Validate → emit          |
| Concerns        | Domain modeling            | Pure I/O routing         |
| Scale           | 50+ controllers            | 2 modules                |

The Laravel layers exist to solve specific problems:

- **Repository pattern** abstracts data access for testability and DB
  swapping. We have no data, so nothing to wrap.
- **Service layer** (the "S" in MVCS) holds non-trivial business logic.
  Our route handlers are 5–20 lines each. Adding a Service layer now is
  ceremony.
- **Controller** in MVC sense = the Fastify route handler. Already there
  under a different name.

## Current structure

```
src/
├── server.ts           # boot + signal handlers
├── app.ts              # composition root (buildApp factory)
│
├── core/               # framework-agnostic primitives
│   ├── config/         # env (dotenv)
│   └── types/          # shared types + FastifyInstance augment
│
├── plugins/            # Fastify plugins (decorate instance)
│   └── socket/         # Socket.io
│
└── modules/            # feature modules
    ├── health/
    │   ├── index.ts
    │   └── health.route.ts
    └── notify/
        ├── index.ts
        ├── notify.route.ts
        └── notify.types.ts
```

Three layers, one rule per layer:

- `core/` — no Fastify, no Socket.io, no HTTP. Pure config, types, helpers.
- `plugins/` — Fastify plugins. Wrap with `fastify-plugin` so decorators leak
  into the parent instance.
- `modules/` — feature code. Each module is a folder with `<name>.route.ts`
  mandatory; other files added when they earn their place.

For the day-to-day layer rules (where new code goes, barrel imports, file
naming), see
[`.claude/rules/module-structure.md`](.claude/rules/module-structure.md).

## Roadmap — what to add when

Add structure when there's pain to relieve, not because the pattern is
fashionable. The order below reflects how the pains typically appear.

### Near-term — when modules grow ~200–500 LoC

#### 1. `<name>.schema.ts` — JSON Schema for body validation ⭐

This is the most useful next addition. Today we type request bodies via
Fastify generics — that's compile-time only. If Laravel sends a malformed
body (e.g. `user_id` missing, `unread_count` as a string), nothing catches
it until the handler crashes deep in the call stack.

Fastify supports JSON Schema natively via Ajv:

```ts
// modules/notify/notify.schema.ts
export const notifyBodySchema = {
  type: "object",
  required: ["user_id", "title", "message"],
  properties: {
    user_id: { type: "string" },
    title:   { type: "string", minLength: 1 },
    message: { type: "string", minLength: 1 },
    type:    { type: "string", enum: ["info", "success", "error", "customer"] },
  },
} as const;
```

```ts
// notify.route.ts
fastify.post("/", { schema: { body: notifyBodySchema } }, handler);
```

You get runtime validation with proper 400 responses, plus automatic OpenAPI
doc generation if `@fastify/swagger` is added later.

The `as const` is so the type can be derived from the schema (via
`FromSchema` from `json-schema-to-ts`) — single source of truth for both
runtime and compile-time.

#### 2. Auth as a plugin (`plugins/auth/`)

Today the api-key `onRequest` hook is inline in `notify.route.ts`. The
`add-notify-endpoint` skill copy-pastes the same hook into every new module.
Once a third caller exists, hoist it:

```ts
// plugins/auth/index.ts
import fp from "fastify-plugin";

export const apiKeyAuth = fp(async (fastify) => {
  fastify.decorate("requireApiKey", async (request, reply) => {
    if (process.env.NODE_ENV === "production" && config.apiSecretKey) {
      if (request.headers["x-api-key"] !== config.apiSecretKey) {
        return reply.code(401).send({ error: "unauthorized" });
      }
    }
  });
});
```

```ts
// notify.route.ts
fastify.addHook("onRequest", fastify.requireApiKey);
```

The predicate moves to one place — change it once, all modules update.
This is the same pattern Laravel uses for middleware groups, just spelled
in Fastify's native vocabulary.

#### 3. `<name>.service.ts` — only when handlers grow past ~30–40 lines

Don't pre-create empty service files. The signal that you need one is: the
route handler does meaningful work beyond "validate, emit, return 202", and
that work is testable in isolation.

When you do extract one, keep it as a plain module — no class, no DI
decorator, no `BaseService`. A service is just a file with functions.

### Medium-term — if/when scaling

#### 4. `plugins/observability/` — metrics and tracing

Prometheus metrics, OpenTelemetry tracing. Add when ops asks for them —
not before.

#### 5. `<name>.events.ts` — split socket handlers from HTTP routes

When one module has more than 2–3 socket events, extract the event
registrations into their own file so the HTTP route file stays focused.

## What NOT to add — ever

| Pattern                                   | Why not                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| **Repository layer**                      | No DB → nothing to wrap.                                      |
| **Domain entities / DTO mappers**         | This service is a relay, not a domain layer.                  |
| **CQRS / Event Sourcing**                 | Overkill — there are no domain events to source.              |
| **DI container** (TSyringe, Inversify)    | Fastify decorators already do this lighter.                   |
| **Hexagonal / Ports-and-adapters**        | Excess abstraction — there are no ports to abstract.          |
| **Generic `BaseService` / `AbstractController`** | Favors composition (Fastify's pattern) over inheritance. |

If someone wants any of these, they should:

1. Read this file (you're already here).
2. Justify a **real pain** the existing structure doesn't address.
3. Open an RFC before merging.

## Decision framework

When tempted to add a layer or abstraction, ask three questions:

1. **What pain does this relieve?** If you can't name a concrete pain, don't
   add it.
2. **Are there at least 2 (preferably 3) places duplicated?** Rule of three:
   see the duplication twice; abstract on the third occurrence.
3. **If we cut this abstraction, who suffers?** If the answer is "nobody, it
   would just be slightly less elegant" → don't add it.

`tnp-backend` uses Controller/Service/Repository because it has real pain:
domain logic complexity, testability across many services, multi-developer
concurrency. `tnp-notification` does not have those pains while it remains
stateless and I/O-shaped — and the rules in `.claude/rules/` exist
specifically to keep it that way.

## Why Fastify's mental model fits

Fastify is built around **plugin + decorator + composition**:

- **Plugin** = cross-cutting concern (auth, CORS, socket, metrics).
- **Module** = feature (notify, health, future ones).
- **Decorator** = inject something into the instance (`fastify.io`,
  `fastify.requireApiKey`).

This is what Laravel calls a service container, but Fastify makes it
lightweight via `fastify-plugin`. No extra abstraction needed.

Every recommendation in the roadmap above (`schema.ts`, auth plugin, events
file) follows this same grain. Every pattern in the "do not add" list works
against it. That's not coincidence — it's the design rule.

## Related

- [`CLAUDE.md`](CLAUDE.md) — high-level project overview.
- [`.claude/rules/`](.claude/rules/) — day-to-day rules.
- [`.claude/rules/module-structure.md`](.claude/rules/module-structure.md) —
  layer rules, file naming, barrel exports.
- [`.claude/rules/stateless.md`](.claude/rules/stateless.md) — why no DB/cache.
