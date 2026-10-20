# Hostel Maintenance Tickets API

**Version:** 1.0  
**Track:** Backend Development  
**Stack:** Node.js, Express, TypeScript, PostgreSQL, Prisma  
**Authentication:** JWT Bearer Token

## 1. Overview

The Hostel Maintenance Tickets API allows hostel residents to report maintenance issues, administrators to manage and assign tickets, and maintenance staff to handle assigned repairs.

The API maintains a history of ticket assignments so that an issue can be reassigned without losing records of previous assignments.

## 2. User Roles and Permissions

### Resident
- Register and log in.
- Create maintenance tickets.
- View and track their own tickets.
- Edit or delete their own pending tickets if no active assignment exists.
- View updates on their own tickets.

### Admin
- View all maintenance tickets.
- Filter tickets by status, hostel, and assignment state.
- View ticket details and assignment history.
- Assign and reassign tickets to maintenance staff.
- Reject invalid or duplicate tickets with a reason.
- View updates on all tickets.

### Staff
- View their own assignments.
- Accept or decline assignments.
- Resolve accepted assignments.
- View updates for tickets assigned to them.

**Important:** Public registration creates resident accounts only. Admin and staff accounts must be created through a controlled administrative process; users cannot assign themselves these roles.

## 3. General API Conventions

- **Base URL:** `/api`
- **Data format:** JSON
- **Resource IDs:** UUIDs
- **Timestamps:** ISO 8601 in UTC.
- **Authentication:** Protected endpoints require a valid JWT.
- **Authorization:** Each endpoint must enforce role and resource ownership.
- **Content-Type:** `application/json` for requests with JSON bodies.

Authenticated requests must include:

`Authorization: Bearer <accessToken>`

### Standard Error Response

Errors use a consistent structure:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Ticket not found."
  }
}
```

Validation errors may include field-specific details when useful.

## 4. Data Model and Statuses

### 4.1 Maintenance Ticket Status

| Status | Meaning |
|---|---|
| `PENDING` | Reported and awaiting assignment or reassignment |
| `IN_PROGRESS` | A staff member has accepted the assignment |
| `RESOLVED` | The maintenance issue has been fixed |
| `REJECTED` | An administrator has rejected the report |

### 4.2 Ticket Assignment Status

| Status | Meaning |
|---|---|
| `AWAITING_RESPONSE` | Staff has been assigned but has not responded |
| `ACCEPTED` | Staff has accepted the assignment |
| `DECLINED` | Staff has declined the assignment |
| `EXPIRED` | Staff did not respond before the deadline |
| `COMPLETED` | The assigned repair has been completed |

### 4.3 Core Entities

The database contains five main entities:

- **User:** Residents, administrators, and maintenance staff.
- **Hostel:** Hostel information.
- **MaintenanceTicket:** The maintenance issue reported by a resident.
- **TicketAssignment:** Each attempt to assign a ticket to a staff member.
- **TicketUpdate:** A history of important events on a ticket.

A ticket and its assignment are separate records. One ticket can have multiple assignment records over time, preserving assignment history.

## 5. Authentication Endpoints

### 5.1 Register a Resident

**Endpoint:** `POST /api/auth/register`  
**Access:** Public

**Request body:**

```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123"
}
```

**Success:** `201 Created`

Returns the created user's public information. Never return the password or password hash.

**Possible errors:**
- `400 Bad Request` — Invalid input.
- `409 Conflict` — Email already exists.

The server automatically assigns the `RESIDENT` role.

`fullName` must be non-empty and at most 100 characters, `email` must be a
valid email address, and `password` must contain 8 to 72 characters. Additional
fields, including `role`, are not accepted.

### 5.2 Log In

**Endpoint:** `POST /api/auth/login`  
**Access:** Public

**Request body:**

```json
{
  "email": "john@example.com",
  "password": "SecurePassword123"
}
```

**Success:** `200 OK`

Returns an access token and public user information.

Example:

```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "<uuid>",
    "fullName": "John Doe",
    "email": "john@example.com",
    "role": "RESIDENT"
  }
}
```

**Possible errors:**
- `400 Bad Request` — Invalid input.
- `401 Unauthorized` — Invalid credentials.

`email` must be a valid email address and `password` must contain 8 to 72
characters. Invalid credentials always return the same response whether the
email address is unknown or the password is incorrect.

### 5.3 Get Current User

**Endpoint:** `GET /api/auth/me`  
**Access:** Authenticated users

Returns the authenticated user's public profile.

**Success:** `200 OK`  
**Possible errors:** `401 Unauthorized`

## 6. Resident Endpoints

### 6.1 Create a Maintenance Ticket

**Endpoint:** `POST /api/tickets`  
**Access:** Resident

**Request body:**

```json
{
  "hostelId": "<hostel-uuid>",
  "title": "Leaking bathroom tap",
  "description": "The bathroom tap has been leaking since yesterday.",
  "locationDetails": "Block A, Room 12"
}
```

**Success:** `201 Created`

Creates a ticket with:
- `residentId` set from the authenticated user.
- `status` set to `PENDING`.
- `resolvedAt` set to `null`.

The hostel must exist. The resident must not be allowed to set the ticket's owner, status, or resolution timestamp directly.

**Possible errors:**
- `400 Bad Request` — Invalid input.
- `401 Unauthorized` — Not authenticated.
- `404 Not Found` — Hostel does not exist.

### 6.2 List My Tickets

**Endpoint:** `GET /api/tickets/mine`  
**Access:** Resident

Returns only tickets created by the authenticated resident.

**Optional query parameters:**
- `status` — Filter by ticket status.
- `page` — Page number.
- `limit` — Number of results per page.

**Success:** `200 OK`  
**Possible errors:** `400 Bad Request`, `401 Unauthorized`

### 6.3 Get a Ticket

**Endpoint:** `GET /api/tickets/:id`  
**Access:** Resident who owns the ticket

Returns the details of a ticket owned by the authenticated resident.

**Success:** `200 OK`  
**Possible errors:**
- `401 Unauthorized` — Not authenticated.
- `404 Not Found` — Ticket does not exist or does not belong to the resident.

### 6.4 Update a Ticket

**Endpoint:** `PATCH /api/tickets/:id`  
**Access:** Resident who owns the ticket

**Request body:** Any permitted combination of the following fields.

```json
{
  "title": "Leaking bathroom tap",
  "description": "The leak has become worse.",
  "locationDetails": "Block A, Room 12"
}
```

**Success:** `200 OK`

Only the ticket's `title`, `description`, and `locationDetails` may be updated.

A ticket can be edited only when:
- It belongs to the authenticated resident.
- Its status is `PENDING`.
- It has no assignment with status `AWAITING_RESPONSE` or `ACCEPTED`.

**Possible errors:**
- `400 Bad Request` — Invalid input.
- `401 Unauthorized` — Not authenticated.
- `404 Not Found` — Ticket does not exist or does not belong to the resident.
- `409 Conflict` — Ticket cannot be edited in its current state.

### 6.5 Delete a Ticket

**Endpoint:** `DELETE /api/tickets/:id`  
**Access:** Resident who owns the ticket

Soft-deletes a ticket only if it is owned by the resident, has status `PENDING`, and has no assignment with status `AWAITING_RESPONSE` or `ACCEPTED`. Soft-deleted tickets are excluded from normal resident and administrator queries, but remain in the database so their assignment and update history is preserved. A ticket with only declined or expired assignments remains eligible for soft deletion.

**Success:** `204 No Content`  
**Possible errors:**
- `401 Unauthorized` — Not authenticated.
- `404 Not Found` — Ticket does not exist or does not belong to the resident.
- `409 Conflict` — Ticket cannot be deleted in its current state.

## 7. Admin Endpoints

All endpoints in this section require authentication and the `ADMIN` role.

### 7.1 List All Tickets

**Endpoint:** `GET /api/admin/tickets`

Returns tickets across all residents and hostels.

**Optional query parameters:**
- `status` — Filter by ticket status.
- `hostelId` — Filter by hostel.
- `unassigned=true` — Return tickets eligible for assignment.
- `page` — Page number.
- `limit` — Number of results per page.

For this API, a ticket is eligible for assignment when it is `PENDING` and has no assignment with status `AWAITING_RESPONSE` or `ACCEPTED`.

**Success:** `200 OK`  
**Possible errors:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`

### 7.2 Get Ticket Details

**Endpoint:** `GET /api/admin/tickets/:id`

Returns a ticket's details, resident information, and its current and previous assignment records.

**Success:** `200 OK`  
**Possible errors:** `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

### 7.3 Assign or Reassign a Ticket

**Endpoint:** `PATCH /api/admin/tickets/:id/assignments`

**Request body:**

```json
{
  "staffId": "<staff-user-uuid>"
}
```

Creates a new `TicketAssignment` record with:
- `ticketId` — The ticket being assigned.
- `staffId` — The selected maintenance staff member.
- `assignedById` — The authenticated administrator.
- `status` — `AWAITING_RESPONSE`.
- `assignedAt` — Current time.
- `responseDeadline` — 24 hours after assignment.
- `respondedAt` — `null`.

**Success:** `201 Created`

The ticket remains `PENDING` until the staff member accepts the assignment.

A ticket may be assigned or reassigned only if:
- It is currently `PENDING`.
- It has no assignment with status `AWAITING_RESPONSE` or `ACCEPTED`.
- The selected user exists and has the `STAFF` role.

Reassignment creates a new assignment record. It must not overwrite previous assignment history.

**Possible errors:**
- `400 Bad Request` — Invalid input.
- `401 Unauthorized` — Not authenticated.
- `403 Forbidden` — Not an administrator.
- `404 Not Found` — Ticket or staff user does not exist.
- `409 Conflict` — Ticket is not eligible for assignment.

### 7.4 Reject a Ticket

**Endpoint:** `PATCH /api/admin/tickets/:id/rejection`

**Request body:**

```json
{
  "reason": "This report duplicates an existing ticket."
}
```

**Success:** `200 OK`

Sets the ticket's status to `REJECTED` and records the rejection reason. A `TicketUpdate` event must also record the rejection.

A ticket may be rejected only before work begins. Tickets that are `IN_PROGRESS` or `RESOLVED` cannot be rejected.

**Possible errors:**
- `400 Bad Request` — Missing or invalid reason.
- `401 Unauthorized` — Not authenticated.
- `403 Forbidden` — Not an administrator.
- `404 Not Found` — Ticket does not exist.
- `409 Conflict` — Ticket cannot be rejected in its current state.

## 8. Staff Endpoints

All endpoints in this section require authentication and the `STAFF` role.

### 8.1 List My Assignments

**Endpoint:** `GET /api/staff/assignments`

Returns only assignment records belonging to the authenticated staff member.

**Optional query parameters:**
- `status` — Filter by assignment status.
- `page` — Page number.
- `limit` — Number of results per page.

**Success:** `200 OK`  
**Possible errors:** `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`

### 8.2 Accept an Assignment

**Endpoint:** `PATCH /api/staff/assignments/:assignmentId/accept`

**Request body:** None.

**Success:** `200 OK`

Sets:
- Assignment status to `ACCEPTED`.
- Assignment `respondedAt` to the current time.
- Related ticket status to `IN_PROGRESS`.

A staff member may accept only their own assignment when its status is `AWAITING_RESPONSE` and its response deadline has not passed.

**Possible errors:**
- `401 Unauthorized` — Not authenticated.
- `403 Forbidden` — Not a staff member or assignment belongs to another user.
- `404 Not Found` — Assignment does not exist.
- `409 Conflict` — Assignment has expired or is no longer awaiting a response.

### 8.3 Decline an Assignment

**Endpoint:** `PATCH /api/staff/assignments/:assignmentId/decline`

**Request body:**

```json
{
  "reason": "I am unavailable to handle this repair."
}
```

**Success:** `200 OK`

Sets the assignment status to `DECLINED` and records `respondedAt`. The reason must be recorded in a `TicketUpdate` event.

The related ticket remains `PENDING` and becomes eligible for reassignment, provided no other active assignment exists.

A staff member may decline only their own assignment when its status is `AWAITING_RESPONSE` and its response deadline has not passed.

**Possible errors:**
- `400 Bad Request` — Invalid input or missing reason.
- `401 Unauthorized` — Not authenticated.
- `403 Forbidden` — Assignment belongs to another user.
- `404 Not Found` — Assignment does not exist.
- `409 Conflict` — Assignment is no longer awaiting a response.

### 8.4 Resolve an Assignment

**Endpoint:** `PATCH /api/staff/assignments/:assignmentId/resolve`

**Request body:**

```json
{
  "message": "The leaking tap has been repaired and tested."
}
```

**Success:** `200 OK`

When the authenticated staff member owns an assignment with status `ACCEPTED`:
- Set assignment status to `COMPLETED`.
- Set ticket status to `RESOLVED`.
- Set ticket `resolvedAt` to the current time.
- Record the resolution in `TicketUpdate`.

**Possible errors:**
- `400 Bad Request` — Invalid input.
- `401 Unauthorized` — Not authenticated.
- `403 Forbidden` — Assignment belongs to another user.
- `404 Not Found` — Assignment does not exist.
- `409 Conflict` — Assignment is not accepted or the ticket cannot be resolved in its current state.

## 9. Ticket Update History

### 9.1 Get Ticket Updates

**Endpoint:** `GET /api/tickets/:id/updates`  
**Access:** Authorized users

Returns a chronological history of important events for a ticket, such as:
- Ticket created.
- Assignment created.
- Assignment accepted, declined, or expired.
- Ticket rejected.
- Ticket resolved.

Access rules:
- Residents can view updates for their own tickets.
- Admins can view updates for any ticket.
- Staff can view updates for tickets assigned to them.

Each update includes its ID, ticket ID, actor ID when applicable, event type, message when applicable, and creation timestamp.

System-generated events may have a `null` actor ID.

**Success:** `200 OK`  
**Possible errors:** `401 Unauthorized`, `403 Forbidden`, `404 Not Found`

## 10. Assignment Expiration

Assignment expiration is handled by a background or scheduled system process, not by a user-facing endpoint.

When an assignment remains `AWAITING_RESPONSE` past its `responseDeadline`, the system must:
1. Change the assignment status to `EXPIRED`.
2. Record the expiration in `TicketUpdate` with a `null` actor ID.
3. Leave the ticket status as `PENDING`.
4. Make the ticket eligible for reassignment if no other active assignment exists.

Expiration must not overwrite an assignment that has already been accepted or declined.

The implementation must handle deadline checks safely to avoid conflicting updates if a staff member responds while the expiration process is running. The hosting environment must support the scheduled process reliably; an in-process timer alone is not sufficient for serverless deployments.

## 11. Ticket Update and Assignment Rules

The following rules apply throughout the API:

1. Residents cannot set their own role, ticket owner, ticket status, or resolution timestamp.
2. A staff member cannot accept, decline, or resolve another staff member's assignment.
3. An assignment can be accepted or declined only while it is awaiting a response and within its response deadline.
4. Accepting an assignment moves the ticket to `IN_PROGRESS`.
5. Declining or expiring an assignment leaves the ticket `PENDING`.
6. Only an accepted assignment can be resolved by the assigned staff member.
7. Resolving an assignment completes that assignment and resolves its ticket.
8. Every assignment attempt creates a separate record.
9. Ticket status and assignment status must remain consistent.
10. Important workflow transitions must be recorded in `TicketUpdate`.
11. Administrative rejection requires a reason and is allowed only before work begins.
12. Authorization and state-transition checks must be enforced by the server, not trusted to the client.

## 12. HTTP Status Codes

| Code | Meaning |
|---|---|
| `200 OK` | Request completed successfully |
| `201 Created` | Resource created successfully |
| `204 No Content` | Request succeeded with no response body |
| `400 Bad Request` | Invalid request or validation failure |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Authenticated user lacks permission |
| `404 Not Found` | Resource does not exist or is not accessible |
| `409 Conflict` | Request conflicts with the resource's current state |
| `500 Internal Server Error` | Unexpected server error |

## 13. Validation and Security Requirements

- Validate all request bodies, route parameters, and query parameters.
- Validate email format and enforce unique email addresses.
- Store passwords as secure hashes; never store or return plaintext passwords.
- Use JWT authentication for protected endpoints.
- Enforce role-based access control and resource ownership on every protected route.
- Never trust user-supplied IDs for ownership or role decisions.
- Restrict assignment creation to valid staff accounts.
- Enforce allowed status transitions on the server.
- Avoid exposing password hashes, JWT secrets, database credentials, or stack traces in API responses.
- Use environment variables for secrets and database connection configuration.
- Apply pagination to list endpoints to prevent unbounded responses.
- Use database transactions where multiple related records or status changes must succeed together.

## 14. Out of Scope for Version 1

The first version will not include:
- Real-time chat between residents and staff.
- Email, SMS, or push notifications.
- Image or video uploads for maintenance reports.
- Automatic staff selection or workload-based assignment.
- Public analytics dashboards or advanced reporting.

These features may be considered in later versions.

## 15. Implementation Notes

The API will be implemented with Node.js, Express, TypeScript, PostgreSQL, and Prisma.

The implementation should follow this order:
1. Set up the project and database schema.
2. Implement validation and ticket CRUD operations.
3. Implement authentication and role-based authorization.
4. Implement assignment, rejection, and resolution workflows.
5. Implement ticket history and assignment expiration.
6. Add automated tests, API documentation, and deployment configuration.

This document defines the intended API behavior. If implementation reveals a necessary design change, update this specification and the database model together.
