import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { createAdminRouter } from "./routes/admin.routes.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createTicketRouter } from "./routes/ticket.routes.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

app.get("/", (_req, res) => {
    return res.status(200).json({
        message: "Hurray, Hostel Maintenance API is up and running!"
    })
});

app.use("/api/auth", createAuthRouter());
app.use("/api/tickets", createTicketRouter());
app.use("/api/admin", createAdminRouter());
app.use(errorHandler);

export default app;
