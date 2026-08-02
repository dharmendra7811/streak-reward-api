# Streak Reward API

Backend REST API for a user engagement and streak reward platform. Users log daily activities, a midnight scheduler processes streaks, milestone streaks earn reward points, and a real-time leaderboard streams live rankings over WebSocket.

Built with Node.js + Express + TypeScript (strict, zero `any`), Prisma + PostgreSQL, Redis, and Socket.io.

## Features

- JWT authentication with admin/user roles (bcrypt-hashed passwords)
- Daily activity logging — one log per type per day, duplicates rejected with `409`
- Midnight streak scheduler — transactional, idempotent, with a full audit trail
- Milestone rewards: 3d = 50, 7d = 150, 14d = 400, 30d = 1000, then 40/day
- Redis-backed leaderboard (sorted set) with live Socket.io updates
- Bonus: manual scheduler trigger, login rate limiting (5/min/IP), Jest integration tests, CI

## Tech Stack

| Layer            | Choice                          |
| ---------------- | ------------------------------- |
| Language         | TypeScript (strict mode)        |
| Framework        | Express.js                      |
| ORM              | Prisma                          |
| Database         | PostgreSQL                      |
| Cache / realtime | Redis (leaderboard state)       |
| Realtime         | Socket.io                       |
| Scheduler        | node-cron                       |
| Auth             | JWT (admin / user roles)        |
| Validation       | Zod (all request bodies)        |

## Prerequisites

- Node.js 18+
- Docker + Docker Compose (for PostgreSQL and Redis)

## Getting Started

One command — installs dependencies, bootstraps a local `.env` (dev defaults), starts PostgreSQL + Redis (Docker Compose), applies migrations, and runs the API:

```bash
npm start
```

Verify with `curl http://localhost:3000/health` — expect `{"status":"ok"}`.

What `npm start` does, step by step:

1. `npm install` if `node_modules` is missing.
2. Creates `.env` with local dev defaults if it doesn't exist (or fills in empty
   values if you copied `.env.example` verbatim — existing values are never
   overwritten; exported `DATABASE_URL`/`REDIS_URL`/`PORT`/`JWT_SECRET` take
   precedence). The generated `.env` is gitignored.
3. `docker compose up -d` for PostgreSQL + Redis — or skips straight to
   migrations if both services are already reachable at the configured URLs.
4. `prisma migrate deploy` — applies all migrations to a fresh database.
5. Runs the API on `http://localhost:3000`.

### Manual (step-by-step)

Prefer full control? Same steps, explicitly:

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    fill in the values (see Environment Variables below)

# 3. Start PostgreSQL and Redis, apply migrations
npm run setup

# 4. Run the API
npm run dev
```

The server listens on `http://localhost:3000` — verify with `curl http://localhost:3000/health`.

## Environment Variables

| Variable            | Description                                  | Example                          |
| ------------------- | -------------------------------------------- | -------------------------------- |
| `PORT`              | HTTP port                                    | `3000`                           |
| `DATABASE_URL`      | PostgreSQL connection string                 | `postgresql://user:pass@localhost:5432/db` |
| `REDIS_URL`         | Redis connection string                      | `redis://localhost:6379`         |
| `JWT_SECRET`        | Secret used to sign JWTs                     | *(long random string)*           |
| `JWT_EXPIRES_IN`    | Token lifetime                               | `7d`                             |
| `SCHEDULER_TIMEZONE`| Timezone defining "midnight" and "yesterday"| `Asia/Kolkata`                   |
| `SCHEDULER_ENABLED` | Set `false` to disable the midnight cron     | `true`                           |

## Folder Structure

```
src/
  routes/        Express route definitions (wiring only)
  controllers/   Request/response handling — no business logic
  services/      All business logic — nothing touches req/res
  scheduler/     node-cron midnight streak job
  sockets/       Socket.io setup and event handlers
  middleware/    Auth, role guard, Zod validation, error handler, rate limiter
  lib/           Prisma client, Redis client, Socket.io instance, date/error helpers
  types/         Zod schemas, request types, Express/Socket type augmentations
prisma/
  schema.prisma
```

Deviations from the suggested structure (both additive and documented):
- `middleware/asyncHandler.ts` — tiny wrapper so async controllers can `throw` and reach the error handler (Express 4 does not catch rejected promises natively).
- `lib/dates.ts` — calendar-day helpers; all "days" are `Date`s at UTC midnight so `DATE` columns map 1:1 to `YYYY-MM-DD` with no timezone drift.
- `lib/errors.ts` — typed HTTP errors (`ConflictError`, `UnauthorizedError`, ...) that the central error handler maps to status codes.

## API Reference

### Auth

| Method | Endpoint            | Access      | Body                                            |
| ------ | ------------------- | ----------- | ----------------------------------------------- |
| POST   | `/auth/register`    | Public      | `{ name, email, password, role: "admin" \| "user" }` |
| POST   | `/auth/login`       | Public      | `{ email, password }` (rate limited: 5/min/IP)  |

### Activities

| Method | Endpoint              | Access | Body / Notes                                    |
| ------ | --------------------- | ------ | ----------------------------------------------- |
| POST   | `/activities/log`     | user   | `{ activity_type: exercise\|meditation\|reading\|hydration, date? }` — `date` defaults to today (`YYYY-MM-DD`); duplicate type+day → `409` |
| GET    | `/activities/my`      | user   | All logs with `date`, `activity_type`, `contributed` (whether the day is part of the current streak) |
| GET    | `/activities/summary` | user   | Today's activities, `currentStreak`, `totalPoints` |

### Scheduler

| Method | Endpoint           | Access | Notes                                   |
| ------ | ------------------ | ------ | --------------------------------------- |
| GET    | `/scheduler/history` | admin | Last 30 runs: date, users processed, incremented, reset, milestones |
| POST   | `/scheduler/run`   | admin  | Manual trigger for testing (see below)  |

### Leaderboard

| Method | Endpoint              | Access | Notes                                |
| ------ | --------------------- | ------ | ------------------------------------ |
| GET    | `/leaderboard`        | auth   | Top 20 by points (rank, name, points, streak) — served from Redis |
| GET    | `/leaderboard/my-rank`| auth   | Caller's rank, points, streak        |

### Rewards

| Method | Endpoint              | Access | Notes                                  |
| ------ | --------------------- | ------ | -------------------------------------- |
| GET    | `/rewards/my`         | user   | All reward records (milestone, points, date) |
| GET    | `/rewards/summary`    | user   | Total points, current/longest streak, next milestone |
| GET    | `/rewards/user/:id`   | admin  | Reward history for any user            |

## Triggering the Scheduler Manually

For testing without waiting for midnight:

```bash
# register an admin, capture the token
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Admin","email":"admin@test.com","password":"adminpass123","role":"admin"}'

TOKEN=<admin-token>

# first run — processes the day
curl -s -X POST http://localhost:3000/scheduler/run -H "Authorization: Bearer $TOKEN"

# second run — idempotent, exits immediately
curl -s -X POST http://localhost:3000/scheduler/run -H "Authorization: Bearer $TOKEN"
# -> {"runDate":"2026-08-02","alreadyProcessed":true,"usersProcessed":0,...}
```

## Idempotency Design

The scheduler is safe to run any number of times for the same day. Three layers:

1. **Unique claim.** `SchedulerLog.run_date` has a `UNIQUE` constraint. The very first statement of the run is an `INSERT` of today's `SchedulerLog` — the claim. A second run for the same day fails that insert with Prisma error `P2002`, and the job returns `{ alreadyProcessed: true }` immediately.
2. **One transaction.** The claim insert and every streak update, reward record, and points increment for all users run inside a single `prisma.$transaction`. If the server dies mid-run, everything rolls back — the day was never claimed, so the next run redoes the work cleanly. No partial state is ever visible.
3. **Concurrent runs.** If two runs overlap, the unique constraint arbitrates: one inserts first, the other blocks on the uncommitted row, then fails with `P2002` once the winner commits.

The audit log is written inside the same transaction, so `users_processed`, `streaks_incremented`, `streaks_reset`, and `milestones_awarded` always match what was actually applied.

## Design Decisions

- **`DATE` not `DateTime` for `logged_date`** (Prisma `@db.Date`): the duplicate-log check and the scheduler's "yesterday" comparison are pure date math — no timezone or boundary bugs.
- **Timezone:** `SCHEDULER_TIMEZONE` (default `Asia/Kolkata`) defines "today" and "yesterday". All calendar days are stored as UTC-midnight `Date`s, so a day maps 1:1 to its `YYYY-MM-DD` key.
- **Milestone math:** a streak increments by exactly 1 per run, so a single run can hit at most one milestone (3/7/14/30) — no multi-award logic needed. After 30, every day pays 40 points.
- **Redis sorted set:** `ZSET` member = userId, score = total_points; top-20 via `ZREVRANGE`, rank via `ZREVRANK`, with a side hash for name/streak. The leaderboard is rebuilt from the DB after every points change, and both the REST endpoint and the Socket.io broadcasts read from Redis — the database is never hit on the read path.
- **Socket.io:** JWT is verified on the handshake; `leaderboard:update` broadcasts the top 20 to all subscribed clients; `leaderboard:my-rank` is emitted per socket only when that user's rank actually changes (tracked per socket).

## Testing

Integration tests run against a real PostgreSQL + Redis (start them with `npm run setup` first):

```bash
npm test
```

Covers: streak increments when activity logged, streak resets when no activity, milestone reward at 7 days, and scheduler idempotency.

## CI

GitHub Actions runs `tsc --noEmit` and the test suite on every push/PR (PostgreSQL and Redis provided as service containers).
