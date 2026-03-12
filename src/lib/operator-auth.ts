/**
 * @fileoverview Shared operator auth utility for API routes.
 *
 * Extracts the duplicated isAuthorized() pattern from admin routes into
 * a single reusable function. Uses timing-safe comparison to prevent
 * timing attacks on the admin password.
 *
 * Used by: /api/operator/* routes, /api/admin/* routes (can migrate over time).
 * Auth flow: Client sends ADMIN_PASSWORD via X-Admin-Password header.
 * Middleware also checks this, but routes use this as defense-in-depth.
 */

import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Validates the X-Admin-Password header against the ADMIN_PASSWORD env var.
 *
 * @param req - The incoming Next.js request
 * @returns true if the request contains a valid admin password
 */
export function isOperatorAuthorized(req: NextRequest): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const fromHeader = req.headers.get("x-admin-password");
  if (!fromHeader) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(fromHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
