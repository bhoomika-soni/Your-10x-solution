import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Central error handler: zod validation failures become clean 400s,
// deliberate HttpErrors keep their status, and everything else is a 500
// that never leaks internals (or secrets) to the client.
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
