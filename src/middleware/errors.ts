import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

/**
 * The last stop. Express 5 forwards rejected promises here on its own, so
 * routes can stay free of try/catch.
 *
 * Clients get a flat message; the stack goes to the log. A database error
 * should never explain the database to the internet.
 */
export function onError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error("[error]", error);

  if (res.headersSent) return;

  res.status(500).json({
    error: "Something went wrong on our side",
    ...(env.isProd ? {} : { detail: String(error) }),
  });
}