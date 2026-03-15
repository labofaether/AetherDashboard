# Aether Dashboard - Architecture Redesign Plan

Date: 2026-03-15
Status: In Progress

## Current Architecture Assessment

### Strengths
- Clean separation of concerns (MVC pattern)
- Modular provider design for email integrations
- JSON-based storage (simple, no external DB required)
- Comprehensive feature set (tasks, projects, email, calendar, AI filtering)

### Weaknesses
1. **Monolithic frontend**: 50k+ line single `script.js` file
2. **No state management**: Ad-hoc state scattered across frontend
3. **Database limitations**: No transactions, concurrency control, or indexing
4. **No input validation**: Inconsistent validation across endpoints
5. **No tests**: Zero test coverage
6. **In-memory OAuth state**: OAuth states lost on server restart
7. **Polling instead of realtime**: 60s polling for updates

---

## Redesign Goals

### Primary Goals
1. Improve maintainability
2. Enhance developer experience
3. Prepare for future feature expansion
4. Improve reliability and error handling
5. Maintain backward compatibility

### Non-Goals (for now)
- Full rewrite (incremental refactoring only)
- Switching frontend frameworks
- Adding user authentication
- Multi-tenant support

---

## Phase 1: Frontend Refactoring (Highest Priority)

### 1.1 Split `script.js` into modules
| File | Responsibility |
|------|-----------------|
| `public/js/main.js` | Entry point, initialization |
| `public/js/state.js` | Centralized state management |
| `public/js/api.js` | API client wrappers |
| `public/js/views/dashboard.js` | Dashboard view rendering |
| `public/js/views/board.js` | Board view rendering |
| `public/js/views/calendar.js` | Calendar view rendering |
| `public/js/views/list.js` | List view rendering |
| `public/js/views/email.js` | Email view rendering |
| `public/js/components/*.js` | Reusable UI components |
| `public/js/utils/*.js` | Utility functions (date formatting, escaping, etc.) |

### 1.2 Implement simple state management
- Create a centralized store with getters/setters
- Add subscription mechanism for state changes
- Avoid full-blown framework, keep it simple

### 1.3 Optimize rendering
- Virtual DOM or targeted updates instead of full re-renders
- Debounce frequent updates
- Lazy load non-critical views

---

## Phase 2: Backend Improvements

### 2.1 Add input validation middleware
- Use `joi` or `zod` for request validation
- Standardize error responses
- Validate all API inputs

### 2.2 Improve database layer
- Add write queue to prevent race conditions
- Implement incremental saves (only write changed data)
- Add backup mechanism (auto-save previous version)

### 2.3 Extract configuration
- Move all constants to `config/` directory
- Environment-based config overrides
- Feature flags for optional features

### 2.4 Add structured logging
- Replace `console.log` with a logger (winston/pino)
- Log levels (debug, info, warn, error)
- Request/response logging

---

## Phase 3: Testing Infrastructure

### 3.1 Unit tests
- Test all model functions in isolation
- Mock database layer
- Target: 80% coverage for business logic

### 3.2 Integration tests
- Test API endpoints end-to-end
- Test external integrations with mocks

### 3.3 E2E tests (optional)
- Critical user flows with Playwright/Cypress

---

## Phase 4: OAuth & Security Improvements

### 4.1 Persist OAuth state
- Store OAuth states in database instead of memory
- Add TTL (time-to-live) for stale states
- Clean up expired states periodically

### 4.2 Security hardening
- Add rate limiting (express-rate-limit)
- Restrict CORS to specific origins
- Add security headers (helmet)

---

## Implementation Order

1. **Week 1**: Frontend module split (Phase 1.1)
2. **Week 2**: State management + rendering optimization (Phase 1.2-1.3)
3. **Week 3**: Input validation + logging (Phase 2.1, 2.4)
4. **Week 4**: Database improvements + config (Phase 2.2-2.3)
5. **Week 5**: Testing setup + unit tests (Phase 3.1)
6. **Week 6**: OAuth persistence + security (Phase 4)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Maintain backward compatibility, feature flags |
| Frontend refactor too disruptive | Incremental split, one module at a time |
| Performance regressions | Load testing before/after changes |

---

## Success Metrics

- Frontend build time < 1s
- Test coverage > 80% for business logic
- No production bugs from refactoring
- Developer satisfaction improved
