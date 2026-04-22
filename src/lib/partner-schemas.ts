/**
 * Zod schemas for partner API request bodies.
 *
 * Why: manual validation inside route handlers silently ignores unknown
 * fields, lacks length caps, and duplicates "required field" logic across
 * routes. Centralizing here gives strict parsing (unknown fields rejected),
 * type-safe parsed.data, and one place to evolve the shape.
 *
 * Usage in a route handler:
 *
 *   const parsed = AddClientSchema.safeParse(await req.json());
 *   if (!parsed.success) {
 *     return NextResponse.json(
 *       { error: parsed.error.issues[0]?.message ?? "Invalid body" },
 *       { status: 400 },
 *     );
 *   }
 *   // parsed.data is typed
 */

import { z } from "zod";
import { CHARGE_DISPLAY_NAMES } from "./court-reminders";

// Length caps — chosen to allow reasonable human names / emails / city names,
// reject 10KB-of-garbage injection attempts.
const MAX_NAME = 120;
const MAX_EMAIL = 254; // RFC 5321
const MAX_CITY_STATE = 100;
const MAX_CHARGE_TYPE = 80;

// Email regex — same shape as the existing manual check in add-client/route.ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Schema for POST /api/partner/add-client.
 *
 * Strict mode: unknown fields are rejected. If you add a new optional
 * field to the route, add it here first.
 */
export const AddClientSchema = z
  .object({
    first_name: z
      .string()
      .trim()
      .min(1, "First name is required")
      .max(MAX_NAME),
    last_name: z.string().trim().max(MAX_NAME).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(MAX_EMAIL)
      .regex(EMAIL_RE, "Invalid email address"),
    charge_type: z
      .string()
      .trim()
      .max(MAX_CHARGE_TYPE)
      .refine(
        (v) => Object.prototype.hasOwnProperty.call(CHARGE_DISPLAY_NAMES, v),
        { message: "Invalid charge type" },
      ),
    county_state: z.string().trim().min(1).max(MAX_CITY_STATE),
    court_date: z
      .string()
      .trim()
      // Accept YYYY-MM-DD (ISO date) — the existing route parses via `new Date(court_date + "T00:00:00")`.
      // Enforce the shape here; future-date check stays in the route (needs runtime "today").
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Court date must be YYYY-MM-DD"),
    indemnitor_name: z.string().trim().max(MAX_NAME).optional(),
    indemnitor_email: z
      .string()
      .trim()
      .toLowerCase()
      .max(MAX_EMAIL)
      .regex(EMAIL_RE, "Invalid co-signer email")
      .optional()
      .or(z.literal("")),
  })
  .strict();

export type AddClientInput = z.infer<typeof AddClientSchema>;
