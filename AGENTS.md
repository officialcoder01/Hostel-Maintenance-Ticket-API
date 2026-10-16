# AGENTS.md

# Project Engineering Guidelines

## 1. Project Context

This project is a Hostel Maintenance Tickets API built with Node.js, Express, TypeScript, PostgreSQL, and Prisma.

The goal is to build a clean, secure, maintainable API while keeping the implementation straightforward and easy to understand.

Before implementing or modifying any endpoint, consult:

- `docs/api-spec.md` for endpoint behavior, permissions, request bodies, responses, and business rules.
- `prisma/schema.prisma` for the database models and relationships.

These files are the primary sources of truth. Do not silently introduce behavior that conflicts with them.

## 2. Architecture

All application source code belongs in `src/`.

Follow this architecture:

- **Routes:** Define endpoints and attach the appropriate middleware and controllers.
- **Controllers:** Handle HTTP requests and responses. Extract validated input, call services, and return the appropriate status code and response.
- **Services:** Contain business logic and database operations using Prisma.

Keep responsibilities separate. Do not put database queries or substantial business logic in route files or controllers.

Use the existing project structure if it is already established. Do not reorganize the project unnecessarily.

## 3. TypeScript Guidelines

Write TypeScript that is readable, explicit, and easy for a beginner to understand.

- Prefer clear names over abbreviations.
- Use appropriate types for function parameters, return values, and important data structures.
- Let TypeScript infer straightforward types when explicit annotations add no value.
- Avoid `any`. Use `unknown` for genuinely unknown values and narrow the type before using them.
- Do not use type assertions simply to silence compiler errors.
- Avoid unnecessary generics, complex utility types, elaborate abstractions, and deeply nested conditional logic.
- Use early returns where they make the code easier to follow.
- Keep functions focused on one clear responsibility.
- Handle asynchronous operations and errors deliberately.

Do not sacrifice type safety to make an error disappear. Understand and fix the underlying cause.

## 4. Routes, Controllers, and Services

### Routes

- Use the HTTP methods and paths defined in `docs/api-spec.md`.
- Keep route files focused on endpoint registration and middleware.
- Apply authentication and role-based authorization where required by the specification.
- Do not duplicate business rules across routes.

### Controllers

- Keep controllers thin and predictable.
- Read input from the appropriate request location: body, route parameters, or query parameters.
- Validate or consume validated input before passing it to services.
- Call the relevant service and return an appropriate HTTP status and response.
- Pass errors to the project's centralized error-handling middleware if one exists.
- Do not expose Prisma errors, stack traces, or internal implementation details to clients.

### Services

- Keep business rules and Prisma operations in services.
- Do not depend on Express request or response objects in service functions.
- Return useful results to controllers.
- Handle resource ownership and workflow constraints in the appropriate service or authorization layer.
- Use database transactions when multiple related database changes must succeed or fail together.
- Avoid repeating the same business logic in multiple services.

## 5. Validation and Error Handling

- Validate request bodies, route parameters, and query parameters.
- Reject invalid input with a consistent `400 Bad Request` response.
- Use `401` for unauthenticated requests, `403` for insufficient permissions, `404` for inaccessible or nonexistent resources, and `409` for conflicts with the current resource state, as appropriate.
- Use the project's existing validation and error-handling approach if one is established.
- Do not introduce a new library when the existing tools can handle the requirement adequately.
- Never treat TypeScript types alone as runtime validation for client input.
- Never return passwords, password hashes, secrets, or raw internal errors.

Follow the standard error response defined in `docs/api-spec.md`.

## 6. Prisma and Database Rules

- Use the existing Prisma models and relationships.
- Use Prisma Client rather than raw SQL unless there is a clear, documented reason not to.
- Avoid fetching unnecessary fields or related records.
- Handle missing records and database errors appropriately.
- Never trust client-supplied IDs to establish ownership or permissions.
- Do not change the Prisma schema or create migrations without a requirement supported by the API specification.
- If the API specification and database schema conflict, identify the conflict before making changes.

## 7. API Consistency

Every endpoint must follow the API specification for:

- HTTP method and route.
- Authentication and authorization.
- Request validation.
- Response status and structure.
- Error handling.
- Resource ownership.
- Allowed state transitions.

Use consistent naming, response patterns, and error conventions across related endpoints.

Do not introduce different conventions for individual endpoints without a good reason.

## 8. Scope and Simplicity

- Implement only what is needed for the current task.
- Prefer straightforward solutions over clever or overly abstract ones.
- Do not introduce repositories, factories, dependency injection frameworks, base controllers, or other architectural layers without a demonstrated need.
- Do not add packages, configuration files, or abstractions merely because they are common in larger projects.
- Do not refactor unrelated code while implementing an endpoint.
- Reuse existing utilities and middleware where appropriate.
- Do not implement out-of-scope features without explicit approval.

The goal is not the fewest lines of code. It is the simplest correct solution that remains easy to maintain.

## 9. Implementation Workflow

Before implementing a feature:

1. Inspect the existing project structure and relevant files.
2. Read the corresponding section of `docs/api-spec.md`.
3. Check the Prisma models, existing middleware, and established code patterns.
4. Identify the route, controller, service, validation, and authorization changes required.
5. Implement only the necessary changes.

After implementation:

1. Run the available TypeScript checks and relevant tests.
2. Fix errors introduced by the changes.
3. Check success cases, invalid input, missing resources, and unauthorized access where relevant.
4. Confirm that the implementation matches the API specification.
5. Summarize the files changed, behavior implemented, checks performed, and any remaining limitations.

Never claim that a test or validation passed unless it was actually run successfully.

## 10. Learning and Explanation

This is a learning project. Code quality and understanding matter more than implementation speed alone.

When implementing a feature:

- Prefer familiar TypeScript patterns over unnecessarily advanced techniques.
- Explain important design decisions briefly.
- Explain unfamiliar TypeScript concepts when they materially affect the implementation.
- Do not explain every basic line of code unless asked.
- If a requirement is ambiguous or conflicts with existing decisions, explain the issue and ask before making a significant design change.

**Final principle:** Build the correct behavior first, keep responsibilities clear, handle errors consistently, and introduce complexity only when the project genuinely needs it.