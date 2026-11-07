import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        status: 429,
        error: "TOO_MANY_REQUESTS",
        message: "Too many requests, please try again after 15 minutes."
    },
    standardHeaders: "draft-7",
    legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 7, // limit each IP to 7 requests per windowMs
  message: {
    status: 429,
    error: "TOO_MANY_REQUESTS",
    message: "Too many authentication requests, please try again after 15 minutes."
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const ticketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 requests per windowMs
  message: {
    status: 429,
    error: "TOO_MANY_REQUESTS",
    message: "Too many ticket creation requests, please try again after 15 minutes."
  },
  standardHeaders: "draft-7", // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
