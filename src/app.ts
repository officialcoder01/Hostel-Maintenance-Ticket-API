import express from "express";
import { rateLimit } from "express-rate-limit";
import { errorHandler } from "./middleware/error-handler.js";
import { createAdminRouter } from "./routes/admin.routes.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createStaffRouter } from "./routes/staff.routes.js";
import { createTicketRouter } from "./routes/ticket.routes.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
app.set("trust proxy", 1); // trust first proxy

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        status: 429,
        error: "TOO_MANY_REQUESTS",
        message: "Too many requests, please try again after 15 minutes."
    },
    standardHeaders: "draft-7", // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

app.get("/", (_req, res) => {
    return res.status(200).json({
        message: "Hurray, Hostel Maintenance API is up and running!"
    })
});

app.use("/api/auth", createAuthRouter());
app.use("/api/tickets", createTicketRouter());
app.use("/api/admin", createAdminRouter());
app.use("/api/staff", createStaffRouter());
app.use(errorHandler);

export default app;
