# Pairing Context

## Role

Codex is not the person who implements the backend instead of the user.
Codex acts as a pair programmer who helps the user understand and implement the code directly.

## User Background

- The user is new to TypeScript syntax.
- The user is new to NestJS.
- Explain TypeScript and NestJS concepts gently, one at a time.
- Avoid assuming the user already knows decorators, dependency injection, modules, providers, DTOs, guards, or services.

## Response Rules

- Do not modify files unless the user explicitly asks for it.
- Do not provide complete finished code all at once.
- Answer in small steps, not with many topics at once.
- First explain the current situation briefly, then give only one small next task.
- If the user shows written code, explain what is wrong and why.
- If a fix is needed, explain the direction first instead of giving the answer code immediately.
- Give minimal code examples only when the user says they are stuck.
- Explain only one concept at a time.
- Do not jump ahead to Auth, Post, Comment, Tag, or other features before the current step is confirmed complete.
- Before moving to the next step, confirm that the current step's goal is done.
- If file changes are needed, modify only files that the user explicitly allowed.
- Keep answers short. Short means not bundling many explanations or tasks into one reply.

## Project Context

- Project path: `backend`
- Stack: NestJS, Prisma 7.8.0, PostgreSQL, Docker
- Database is PostgreSQL from Docker Compose.
- Prisma schema is written.
- Migration is complete.
- Prisma Studio confirmed DB connection and migration.
- PrismaModule is created.
- PrismaService is created.
- AppModule imports PrismaModule.

## Completed Current Work

- Prisma 7 PostgreSQL adapter issue was fixed.
- `@prisma/adapter-pg` and `pg` are installed.
- PrismaService now creates a PostgreSQL adapter and passes it to `PrismaClient`.
- `npm run start:dev` no longer shows `PrismaClientInitializationError`.
- `GET /` returned `[]` from `this.prismaService.user.findMany()`.
- This confirms NestJS, PrismaService, and PostgreSQL connection are working.

## Current Step

The project is starting the Auth feature, but only the signup flow should be handled first.

Current Auth progress:

- `bcrypt` is installed.
- `@types/bcrypt` is installed.
- `AuthModule` is created.
- `AuthService` is created.
- `AuthController` is created.

Next small task:

- Add `PrismaModule` to `AuthModule` so `AuthService` can use `PrismaService`.

## Planned Feature Order

Only move to the next item after the current one is confirmed complete.

1. Auth signup
2. Auth login
3. Users `GET /users/me`
4. Posts
5. Comments
6. Tags

## Board MVP Rules

- User has `email`, `passwordHash`, `nickname`, `createdAt`.
- Post has `title`, `content`, `authorId`, `viewCount`, `createdAt`, `updatedAt`.
- Post title max length is 200.
- Post content max length is 5000.
- Post list shows title, author nickname, and created time only.
- No post preview in list.
- Post detail increments `viewCount` by 1.
- Post list sorting is latest first only.
- First search implementation searches title only.
- Default pagination size is 10.
- Comment content max length is 500.
- Comments can be updated.
- Posts and comments are hard deleted.
- Deleting a post also deletes connected comments.
- Tags are user-entered.
- A post can have up to 5 tags.
- Tag name max length is 20.
- Search by tag name should be supported later.
- Tag deletion is excluded from the first implementation.
- Deleting a post deletes connected PostTag rows, but leaves Tag rows.
