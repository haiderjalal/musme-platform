# MUSME

Live music lessons, a teacher marketplace, and a practice room with a taal player, tanpura drone and tuner.

Status: Phase 1 foundation. Sign-in, teacher discovery and applications, admin review, slot holds, chat and the practice room are built. Payments and live video are waiting on provider decisions (see [docs/decisions.md](docs/decisions.md)).

## Documentation

- [Product plan](docs/product-plan.md): scope, phases, and the Practice Room specification
- [Architecture](docs/architecture.md): layers, access model, and request flow
- [Database](docs/database.md): schema, constraints, row level security and tests
- [API](docs/api.md): route handlers, server actions and notice codes
- [Deployment](docs/deployment.md): Supabase and Vercel setup, and pre-release checks
- [Decisions](docs/decisions.md): open business decisions and the placeholder values in use
- [Design prototype](docs/design-prototype.html): interactive reference for the visual design

## Requirements

- Node.js 20.9 or newer
- A Supabase project (for real data). Local development needs the public URL and anon key.

## Setup

```bash
npm ci
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command                           | What it does                                                            |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                     | Development server                                                      |
| `npm run build`                   | Production build                                                        |
| `npm run start`                   | Serve the production build                                              |
| `npm run lint`                    | ESLint (zero warnings policy for new code)                              |
| `npm run typecheck`               | TypeScript in strict mode, including `noUncheckedIndexedAccess`         |
| `npm run format` / `format:check` | Prettier                                                                |
| `npm test`                        | Unit tests (domain rules, schemas, security helpers) and database tests |

## Project layout

See [docs/architecture.md](docs/architecture.md#folder-structure).

## Contributing

Work on a feature branch (`feature/…`, `fix/…`, `docs/…`). Commit with conventional commits, one logical change per commit. Open a pull request into `main`. Run the four checks in [docs/deployment.md](docs/deployment.md#3-pre-release-checks) first.
