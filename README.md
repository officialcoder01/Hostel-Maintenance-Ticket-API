# Hostel Maintenance Ticket API

An Express and TypeScript API for hostel residents to report maintenance issues and for staff and administrators to manage tickets. It uses PostgreSQL with Prisma.

## Getting started

### 1. Install prerequisites

Install Node.js (which includes npm) and PostgreSQL. Create a PostgreSQL database for the project, for example `hostel_maintenance`.

### 2. Clone the repository and install dependencies

```bash
git clone https://github.com/officialcoder01/Hostel-Maintenance-Ticket-API.git
cd Hostel-Maintenance-Ticket-API
npm ci
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/hostel_maintenance?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=8080
NODE_ENV=development
```

Replace `USER` and `PASSWORD` with your PostgreSQL credentials. URL-encode special characters in the password if needed. Use a unique, strong `JWT_SECRET`; do not commit your `.env` file. `PORT` is optional and defaults to `8080`.

### 4. Apply database migrations and generate Prisma Client

Make sure PostgreSQL is running and the database in `DATABASE_URL` already exists, then run:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Run tests

```bash
npm test
```

To check TypeScript types, run `npm run typecheck`.

### 6. Start the API

```bash
npm run dev
```

The API listens on `http://localhost:8080` by default (or the port set in `.env`). Visit `http://localhost:8080/` to check that it is running.

## Development scripts

Create a resident user (you will be prompted to enter a password of at least 8 characters):

```bash
npm run dev:create-resident -- "Alex Resident" alex@example.com
```

Create a hostel:

```bash
npm run dev:create-hostel -- "North Hall" "123 Campus Road"
```

Generate a one-hour JWT for an existing resident:

```bash
npm run dev:token -- alex@example.com
```
