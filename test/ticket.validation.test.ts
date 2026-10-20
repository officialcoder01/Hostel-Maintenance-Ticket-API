import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdSchema,
  updateTicketSchema
} from "../src/validations/ticket.validation.js";

const id = "550e8400-e29b-41d4-a716-446655440000";

describe("ticket validation", () => {
  it("accepts a valid create body and trims its text", () => {
    const result = createTicketSchema.parse({
      hostelId: id,
      title: " Tap ",
      description: " Leaking ",
      locationDetails: " Room 1 "
    });

    expect(result).toEqual({
      hostelId: id,
      title: "Tap",
      description: "Leaking",
      locationDetails: "Room 1"
    });
  });

  it("rejects invalid IDs, missing text, and server-managed fields", () => {
    expect(() => createTicketSchema.parse({
      hostelId: "not-a-uuid",
      title: "",
      description: "",
      locationDetails: "",
      status: "RESOLVED"
    })).toThrow();
  });

  it("validates pagination and status filters", () => {
    expect(listTicketsQuerySchema.parse({
      status: "PENDING",
      page: "2",
      limit: "10"
    })).toEqual({
      status: "PENDING",
      page: 2,
      limit: 10
    });
    expect(() => listTicketsQuerySchema.parse({
      status: "UNKNOWN"
    })).toThrow();
    expect(() => listTicketsQuerySchema.parse({
      page: "0"
    })).toThrow();
    expect(() => listTicketsQuerySchema.parse({
      limit: "101"
    })).toThrow();
  });

  it("requires a UUID and a non-empty, permitted update body", () => {
    expect(() => ticketIdSchema.parse({
      id: "invalid"
    })).toThrow();
    expect(() => updateTicketSchema.parse({})).toThrow();
    expect(() => updateTicketSchema.parse({
      status: "PENDING"
    })).toThrow();
    expect(updateTicketSchema.parse({
      title: " Changed "
    })).toEqual({
      title: "Changed"
    });
  });
});
