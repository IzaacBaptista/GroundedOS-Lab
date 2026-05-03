# ADR-014: Authentication & Authorization Strategy

**Date**: 2026-04-25  
**Status**: Accepted  
**Context**: Phase 6 Infrastructure & Deploy

---

## Problem

GroundedOS Lab now has an authentication and authorization baseline in code,
but local development still defaults to open access until
`AUTH_ENFORCEMENT=true` is enabled. Before multi-user deployment or any public
exposure:

1. **API endpoints must be protected** — all endpoints except health/status should require either:
   - Bearer token (for programmatic or CLI access)
   - Session cookie (for web UI access)

2. **Index ownership must be scoped** — one user cannot read, modify or delete another user's:
   - Persisted indexes
   - Session memory
   - Cost/observability data

3. **Admin functions must be restricted** — operations like clearing all indexes, resetting rate limits or accessing system logs are only available to authenticated administrators.

4. **Lab Mode features must be opt-in** — authenticated users can disable access to:
   - Jailbreak Playground (`/lab/jailbreak`)
   - Prompt A/B testing (`/lab/experiments`)
   - Benchmark tools (`/lab/benchmarks`)

---

## Context: Current System

### Boundary Today

```
User (local dev default or authenticated client)
   ↓
Auth middleware available but optional in local dev
   ↓
API Endpoint with owner-aware resource handling
   ↓
Persisted Index / Memory / Cost Data
```

**Current state**: when auth enforcement is disabled, requests remain anonymous;
when enabled, bearer tokens, session cookies and API keys are validated before
protected endpoints run.

### Implementation Snapshot (current code)

- `POST /auth/login`, `POST /auth/refresh` and `POST /auth/logout` are implemented.
- Fastify `preHandler` middleware validates bearer tokens, session cookies or
  API keys when `AUTH_ENFORCEMENT=true`.
- `/admin/*` routes are admin-only and `/lab/*` routes are gated by
  `ALLOWED_LAB_ROLES`.
- RAG index listing/deletion, persisted-index loading and session memory use
  request `ownerId` scoping.
- Rate limiting, audit logging and API-key issuance/rotation are implemented.
- Database-backed users, OAuth and persistent auth storage remain future work.

### Multiuser Boundary (Phase 6 Target)

```
User (claims identity via token or cookie)
   ↓
(Verify token OR session cookie)
   ↓
Extract user ID from claims
   ↓
Enforce scope: GET/POST/DELETE only affect resources owned by this user
   ↓
API Endpoint (scoped)
   ↓
Persisted Index / Memory / Cost Data (user-scoped)
```

---

## Decision

**Use JWT Bearer Tokens + Session Cookies with per-user resource scoping.**

### 1. **Authentication Method**

#### JWT Bearer Tokens (for CLI, programmatic, API-first clients)

- **Endpoint**: `POST /auth/login`
- **Request**:
  ```json
  {
    "username": "alice",
    "password": "secure-password-or-api-key"
  }
  ```
- **Response**:
  ```json
  {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 86400
  }
  ```
- **Usage**: `Authorization: Bearer <accessToken>`
- **Refresh**: `POST /auth/refresh` → new `accessToken` when within refresh window
- **Expiry**: 24 hours access token, 30 days refresh token (configurable via `JWT_EXPIRY` env var)

#### Session Cookies (for web UI)

- **Endpoint**: `POST /auth/login` (same as bearer, returns `Set-Cookie` if `Accept: text/html`)
- **Cookie name**: `groundedos-session`
- **Attributes**:
  - `HttpOnly` — prevent JavaScript XSS attacks from stealing session
  - `Secure` — only send over HTTPS (skip in local dev with `FORCE_HTTPS=false`)
  - `SameSite=Strict` — prevent CSRF
  - `Max-Age`: 7 days (configurable)
- **Logout**: `POST /auth/logout` → clear cookie and invalidate session

### 2. **Authorization: Resource Scoping**

Every protected endpoint enforces **resource ownership**:

#### Example: Retrieve personal indexes

```typescript
GET /rag/indexes
// Before: returned all indexes
// After: returns only indexes where resourceOwner === currentUserId
```

#### Example: Delete a specific index

```typescript
DELETE /rag/indexes/:indexId
// Before: deleted any index by ID
// After: only allowed if indexes[indexId].resourceOwner === currentUserId
```

#### Example: Query an index

```typescript
POST /rag/ask
{
  "indexId": "some-uuid",
  "query": "...",
  "sessionId": "..."
}
// Before: any sessionId accepted
// After: sessionId must belong to currentUserId
```

### 3. **Protected vs Unprotected Endpoints**

#### Always Unprotected (for dev/ops)

```
GET /health          ← Health check, load balancer probe
GET /status          ← System stats (no sensitive data)
POST /auth/login     ← Login endpoint
```

#### Always Protected (auth required)

```
POST   /rag/index              ← Upload document
GET    /rag/indexes            ← List user indexes
DELETE /rag/indexes/:indexId   ← Delete index
POST   /rag/ask                ← Query document
GET    /rag/memory/:sessionId  ← Retrieve session memory
POST   /agents/execute         ← Run agent
GET    /lab/*                  ← Lab features (A/B, benchmarks, evals)
POST   /auth/logout            ← Logout
```

#### Conditional (protected unless public scope explicitly set)

```
GET /datasets/registry         ← Public datasets (unprotected)
GET /datasets/experiments/*    ← Public benchmarks (currently unprotected, maybe opt-out)
```

### 4. **Admin Operations**

Certain operations available **only to users in the `admin` role**:

```typescript
// In JWT claims:
{
  "userId": "alice",
  "roles": ["user", "admin"]  // or ["user"] for regular users
}
```

#### Admin-only endpoints

```
DELETE /admin/indexes/all                  ← Clear all user indexes
GET    /admin/cost/summary                 ← Aggregate cost across all users
GET    /admin/audit/logs                   ← Access logs and audit trail
POST   /admin/api-keys                     ← Create API key
GET    /admin/api-keys                     ← List API keys
DELETE /admin/api-keys/:id                ← Revoke API key
POST   /admin/api-keys/:id/rotate         ← Rotate API key
```

### 5. **Lab Mode Opt-In**

By default, users with `user` role can access Lab Mode. To restrict it:

```bash
# Environment variable allowing lab access (comma-separated roles)
ALLOWED_LAB_ROLES=admin,power-user
```

If a user lacks the required role, they see 403 Forbidden:

```
POST /lab/experiments
→ 403 Forbidden: "Lab Mode features require 'power-user' role"
```

---

## Implementation Phases

### Phase 6.1 (Immediate)

- [x] Implement `POST /auth/login` with environment-based credentials
- [x] Generate JWT and session cookie on successful login
- [x] Add auth middleware to protect endpoints
- [x] Scope indexes, memory, and sessions to `userId`

**DB Schema Addition**:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  roles TEXT[] DEFAULT ARRAY['user'],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  session_id VARCHAR(255) NOT NULL,
  memory_entries JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- Modify indexes table
ALTER TABLE indexes ADD COLUMN resource_owner UUID REFERENCES users(id);
ALTER TABLE indexes ADD CONSTRAINT check_owner CHECK (resource_owner IS NOT NULL);
```

### Phase 6.2 (Follow-up)

- [ ] OAuth2 integration (GitHub, Google) for easier signup
- [x] Rate limiting per user (configurable requests/hour)
- [x] API key generation for programmatic access
- [x] Audit logging (user, action, timestamp, resource)

### Phase 6.3+ (Future)

- [ ] SAML/LDAP for enterprise single sign-on
- [ ] Fine-grained permissions (can read but not delete)
- [ ] Organization support (shared indexes, collaborative sessions)

---

## Security Trade-offs

| Trade-off | Decision | Rationale |
|---|---|---|
| **Hardcoded credentials** (Phase 6.1) vs **database-backed users** | Start hardcoded for local dev; move to DB in Phase 6.2 | Simpler for initial rollout; no dependency on user creation API |
| **Memory-backed rate limiting now** vs **durable/shared limiter later** | Start with in-memory or Redis-backed local limits; expand only if deployment needs it | Keeps the current local stack simple while still enforcing per-user limits when auth is enabled |
| **JWT stored in localStorage** (web) vs **session-only** (cookies) | Use both: session cookie for web UI (safer), JWT for CLI | Balances security (HttpOnly cookie) with developer ergonomics (JWT for tools) |
| **HTTPS required** (production) vs **HTTP ok** (local dev) | Enforce HTTPS in production; allow `FORCE_HTTPS=false` locally | Standards-compliant; unblocks local development |

---

## Current Rollout Status

1. **Completed in code**: JWT login/refresh/logout, session cookie issuance,
   API keys, admin routes, audit logging, owner scoping, and rate limiting.
2. **Enabled selectively**: auth enforcement remains opt-in in local dev via
   `AUTH_ENFORCEMENT=true` while the web login flow catches up.
3. **Still pending**: database-backed users/sessions, OAuth, and broader
   deployment hardening.

---

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Session Cookie Best Practices](https://owasp.org/www-community/attacks/csrf)
