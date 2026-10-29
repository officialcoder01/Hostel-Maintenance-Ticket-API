# Hostel Maintenance Ticket API

A REST API built with Node.js, Express, TypeScript, PostgreSQL, and Prisma. Residents can report and manage maintenance tickets for their hostel.

## Project status

### Implemented

- Resident registration, login, and authenticated profile lookup.
- JWT authentication and resident-role authorization for ticket endpoints.
- Resident ticket creation, listing with pagination and status filtering, detail lookup, and updates.
- Editing and soft deletion rules for tickets, including ownership and assignment-state checks.
- Request validation and a consistent API error response format.
- Prisma database schema and migrations.
- Development scripts for creating a hostel, creating a resident, and generating a resident JWT.
- Automated tests for authentication, validation, services, and HTTP endpoints.
- Admin-only ticket listing with pagination and status, hostel, and assignment-eligibility filters.
- Admin ticket details with resident, hostel, assignment history, and update history.
- Transactional ticket assignment and reassignment with 24-hour response deadlines.
- Admin ticket rejection with a required reason and a ticket-history event.
- A race-safe assignment expiration job that can be run by an external scheduler.

Staff-facing assignment response and resolution endpoints are not implemented yet.

There are no public API endpoints for hostel management; create local development hostels with the script below.

See [docs/api-spec.md](docs/api-spec.md) for the full intended API behavior, [docs/admin-workflow.md](docs/admin-workflow.md) for the admin workflow architecture diagram, and [prisma/schema.prisma](prisma/schema.prisma) for the current data model.

## Run locally

### 1. Install prerequisites

Install:

- Node.js and npm.
- PostgreSQL, and make sure the PostgreSQL service is running.

### 2. Get the code and install dependencies

```bash
git clone https://github.com/officialcoder01/Hostel-Maintenance-Ticket-API.git
cd Hostel-Maintenance-Ticket-API
npm ci
```

### 3. Create a PostgreSQL database

Create a local database named `hostel_maintenance` (or choose another name). For example, from `psql`:

```sql
CREATE DATABASE hostel_maintenance;
```

### 4. Configure environment variables

Create a `.env` file in the project root and set the values for your local PostgreSQL installation:

```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/hostel_maintenance?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=8080
NODE_ENV=development
```

Replace `postgres` and `your_password` with your PostgreSQL username and password. URL-encode special characters in the password. Keep `.env` local and do not commit it.

### 5. Apply migrations and generate Prisma Client

With PostgreSQL running and the database created, run:

```bash
npx prisma migrate dev
npx prisma generate
```

This applies the checked-in migrations and generates the Prisma Client used by the application.

### 6. Start the API

```bash
npm run dev
```

The server listens on `http://localhost:8080` by default. If you changed `PORT`, use that port instead. Check that it is running by opening `http://localhost:8080/`; the root endpoint returns a JSON status message.

To build and run the compiled application instead:

```bash
npm run build
npm start
```

### Expire unanswered assignments

Configure your hosting platform's persistent scheduler to run this command regularly (for example, once per minute):

```bash
npm run assignments:expire
```

The job expires up to 100 assignments per invocation and writes a system-authored ticket update for each expiration. It does not change the ticket's overall `PENDING` status.

## Try the resident workflow

With the API running, create a hostel in a second terminal:

```bash
npm run dev:create-hostel -- "North Hall" "123 Campus Road"
```

Copy the displayed hostel ID. Create a resident (the script prompts for a password of at least 8 characters):

```bash
npm run dev:create-resident -- "Alex Resident" alex@example.com
```

Residents can also register through `POST /api/auth/register`. Log in through `POST /api/auth/login` to receive an access token. Use that token as a bearer token when calling the protected endpoints:

- `GET /api/auth/me`
- `POST /api/tickets`
- `GET /api/tickets/mine`
- `GET /api/tickets/:id`
- `PATCH /api/tickets/:id`
- `DELETE /api/tickets/:id`

To generate a one-hour development JWT for an existing resident instead of logging in:

```bash
npm run dev:token -- alex@example.com
```

Use the hostel ID from the earlier script when creating a ticket. For request formats, validation rules, and response details, see [docs/api-spec.md](docs/api-spec.md). Development data scripts only run when `NODE_ENV=development`.

## Checks

Run the test suite and TypeScript checks with:

```bash
npm test
npm run typecheck
```
