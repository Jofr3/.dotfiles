# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chronos is a modern full-stack task management application built as a Bun workspace monorepo with a Qwik frontend and Hono backend, deployable to Cloudflare Workers/Pages.

## Architecture

### Monorepo Structure

- **apps/backend** - `@chronos/backend`: Hono API server using Cloudflare Workers runtime with D1 database
- **apps/frontend** - `@chronos/frontend`: Qwik application with file-based routing (QwikCity)
- **packages/types** - `@chronos/types`: Shared TypeScript type definitions

### Backend Architecture

**Entry Point**: `apps/backend/src/index.ts`

**Layers**:
- **Routes** (`src/routes/`): Hono route handlers for `/api/auth`, `/api/users`, `/api/tasks`
- **Services** (`src/services/`): Business logic layer (AuthService, UserService, TaskService)
- **DB Queries** (`src/db/queries/`): Raw SQL queries and database access functions
- **Types** (`src/types/env.ts`): Backend-specific environment types

**Key Patterns**:
- All routes use the `ApiResponse<T>` wrapper type for consistent responses
- JWT authentication handled via Web Crypto API (no external libraries)
- Services are instantiated per-request with DB and secrets from Hono context
- Database uses snake_case, TypeScript uses camelCase - conversion happens in query layer

**Authentication Flow**:
- JWT tokens generated/verified in `AuthService` using HS256
- Token stored in `chronos_auth_token` cookie on frontend
- Protected routes extract token from `Authorization: Bearer <token>` header
- Auth middleware in frontend layout files (`routes/(app)/layout.tsx`) checks `/api/auth/me`

**Database**:
- SQLite via Cloudflare D1
- Migrations in `apps/backend/migrations/` (numbered sequentially)
- Tables: users, task_lists, tasks
- Relationships: users → task_lists → tasks (cascade delete)

### Frontend Architecture

**Framework**: Qwik with QwikCity for file-based routing

**Key Directories**:
- `src/routes/` - File-based routes with nested layouts
- `src/routes/(app)/` - Protected routes requiring authentication (has auth layout)
- `src/routes/admin/` - Admin-only routes (has admin layout)
- `src/services/` - Frontend service layer for API calls
- `src/config/` - Configuration (e.g., API base URL)

**Authentication Pattern**:
- `routeLoader$` in layout.tsx checks auth cookie
- Redirects to `/login` if unauthenticated or token invalid
- Auth state managed via cookie, user data loaded in layout loader

### Shared Types Package

All types are centralized in `@chronos/types`:
- `api.ts` - ApiResponse<T>, ApiError
- `auth.ts` - LoginRequest, SignupRequest, AuthResponse, AuthUser, JwtPayload
- `user.ts` - User, UserRole types
- `task.ts` - Task, TaskList, TaskListWithTasks, DayOfWeek
- `database.ts` - D1 type definitions

## Development Commands

### Running the Application

```bash
# Install dependencies (run once after clone)
bun install

# Run both frontend and backend concurrently
bun dev

# Run backend only (http://localhost:3000)
bun dev:backend
# or: cd apps/backend && bun dev

# Run frontend only
bun dev:frontend
# or: cd apps/frontend && bun dev

# Run specific workspace using filter
bun --filter @chronos/backend dev
bun --filter @chronos/frontend dev
```

### Building

```bash
# Build all workspaces
bun build

# Build specific workspace
bun --filter @chronos/backend build
bun --filter @chronos/frontend build
```

### Database Migrations

```bash
cd apps/backend

# Local development (uses local D1 database)
bunx wrangler d1 execute DB --local --file=migrations/XXXX_migration_name.sql

# Remote environments
bunx wrangler d1 execute DB --remote --env development --file=migrations/XXXX_migration_name.sql
bunx wrangler d1 execute DB --remote --env preview --file=migrations/XXXX_migration_name.sql
bunx wrangler d1 execute DB --remote --file=migrations/XXXX_migration_name.sql
```

**Migration Workflow**:
1. Create new migration file with sequential number (e.g., `0009_description.sql`)
2. Write SQL in migration file
3. Run migration against target environment
4. Update TypeScript types if schema changed

### Linting & Formatting

```bash
cd apps/frontend

# Run ESLint
bun lint

# Format code with Prettier
bun fmt

# Check formatting without writing
bun fmt.check
```

### Wrangler Environments

Backend supports multiple Cloudflare environments configured in `wrangler.toml`:

- **Local** (default): `bun dev` - Local D1 database for development
- **Development**: `bun dev:remote` - Remote development database
- **Preview**: `bun pre:remote` - Preview environment
- **Production**: `bun prod:remote` - Production environment

## Code Conventions

### API Response Pattern

All backend endpoints return `ApiResponse<T>`:

```typescript
// Success
return c.json({
  data: result,
  success: true,
  message: "Operation successful"
}, 200);

// Error
return c.json({
  data: null,
  success: false,
  message: "Operation failed",
  error: { code: "ERROR_CODE", message: "Details" }
}, 400);
```

### Type Safety

- Use shared types from `@chronos/types` for all cross-boundary data
- Backend DB queries convert snake_case to camelCase before returning
- Frontend services use shared types for all API calls
- Never use `any` - prefer `unknown` if type is truly unknown

### Service Layer Pattern

Services encapsulate business logic and are instantiated per-request:

```typescript
// In route handler
const service = new AuthService(c.env.DB, c.env.JWT_SECRET);
const result = await service.someMethod();
```

### Database Access

- All queries in `src/db/queries/` files
- Use prepared statements, never string concatenation
- Helper functions convert DB rows to TypeScript types
- Store JSON in SQLite as TEXT (e.g., recurring_days)

## Deployment

### Backend (Cloudflare Workers)

```bash
cd apps/backend
bun deploy  # Uses wrangler deploy
```

### Frontend (Cloudflare Pages)

```bash
cd apps/frontend
bun deploy
```

Or connect Git repository to Cloudflare Pages:
- Build command: `bun install && bun build`
- Build output directory: `dist`
- Root directory: `apps/frontend`

## Tech Stack Summary

- **Runtime**: Bun (dev), Cloudflare Workers (prod backend), Cloudflare Pages (prod frontend)
- **Backend**: Hono 4.x on Cloudflare Workers
- **Frontend**: Qwik 1.x with QwikCity
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: Custom JWT using Web Crypto API
- **Type Checking**: TypeScript 5 with strict mode
- **Code Quality**: ESLint, Prettier
