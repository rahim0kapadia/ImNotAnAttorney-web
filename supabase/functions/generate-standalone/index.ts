/**
 * @fileoverview Supabase Edge Function: Standalone research report generator.
 *
 * Generates standalone research reports (e.g., Employment Impact Assessment)
 * for criminal defendants. These are simpler, faster reports than the full
 * Case Decoder — they answer ONE specific question deeply instead of covering
 * the whole case.
 *
 * INVOCATION:
 *   Called by Next.js intake API route or operator retry route via HTTP POST
 *   (fire-and-forget). The caller returns 202 immediately; this function
 *   runs async.
 *
 * FLOW (synchronous — no batch API):
 *   1. Fetch order from Supabase (with idempotency check)
 *   2. Read standalone_intake from order record
 *   3. Build prompts based on standalone_product_slug
 *   4. Call Claude API synchronously (30-60s — Sonnet for speed)
 *   5. Generate cryptographic report token + hash it (SHA-256)
 *   6. Upload report HTML to Supabase Storage
 *   7. Update order record with token hash, storage path, expiry
 *   8. Send delivery email to customer via Resend
 *   9. On failure: update order status, email operator with retry command
 *
 * ZERO EXTERNAL IMPORTS:
 *   This function has NO npm/esm.sh imports. Why: importing
 *   @supabase/supabase-js via esm.sh adds 60-90 seconds of cold start
 *   latency, which would consume most of the 150s budget before Claude
 *   even starts generating. Instead, all Supabase operations use raw
 *   PostgREST fetch calls, email uses raw Resend API fetch, and Claude
 *   uses raw Anthropic API fetch.
 *
 * CODE DUPLICATION (intentional):
 *   The following are duplicated from Next.js modules because Deno
 *   cannot import from the Next.js codebase:
 *     - escapeHtml() — duplicated from src/lib/email.ts
 *     - sendEmail() — duplicated from src/lib/email.ts (simplified)
 *     - PHYSICAL_ADDRESS — duplicated from src/lib/site.ts
 *   This edge function is fully self-contained — no cross-runtime imports.
 *
 * MODEL CHOICE — claude-sonnet-4-6 (default):
 *   Standalone reports are narrower in scope than Case Decoders. Sonnet
 *   provides sufficient quality for single-topic research at faster speed
 *   (30-60s vs 60-294s for Opus). Configurable via CLAUDE_MODEL env var.
 *
 * ERROR STRATEGY:
 *   On Claude API failure, the function:
 *     1. Sets order status to "generation-failed" in Supabase
 *     2. Emails the operator with error details and a curl retry command
 *   This ensures failures are visible and recoverable without dashboard login.
 */

// ============================================================
// SUPABASE REST HELPERS
// Raw PostgREST fetch calls — no SDK import needed.
// These replace @supabase/supabase-js to avoid esm.sh cold start.
// ============================================================

/**
 * Builds standard Supabase PostgREST headers with the service role key.
 *
 * @param serviceKey - The SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
 * @returns Headers object for PostgREST requests.
 */
function supabaseHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Performs a SELECT query against a Supabase table via PostgREST.
 *
 * @param url - Supabase project URL (SUPABASE_URL env var).
 * @param key - Service role key for authentication.
 * @param table - Table name to query.
 * @param query - PostgREST query string (e.g., "id=eq.123&select=*").
 * @returns Array of matching rows.
 * @throws If the HTTP request fails.
 */
async function supabaseSelect(
  url: string,
  key: string,
  table: string,
  query: string
): Promise<unknown[]> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { ...supabaseHeaders(key), Prefer: "return=representation" },
  });
  if (!res.ok) throw new Error(`Supabase SELECT ${table} failed: ${res.status}`);
  return res.json();
}

/**
 * Performs a PATCH (update) against a Supabase table via PostgREST.
 * Logs errors but does not throw — update failures are non-fatal
 * (the report may already be saved; we don't want to lose it).
 *
 * @param url - Supabase project URL.
 * @param key - Service role key.
 * @param table - Table name.
 * @param query - PostgREST filter (e.g., "id=eq.123").
 * @param body - Fields to update.
 */
async function supabaseUpdate(
  url: string,
  key: string,
  table: string,
  query: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { ...supabaseHeaders(key), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Supabase UPDATE ${table} failed: ${res.status}`, err);
  }
}

// ============================================================
// HELPERS (duplicated from Next.js modules — see file header for why)
// ============================================================

/**
 * Escapes HTML special characters to prevent XSS.
 * Duplicated from src/lib/email.ts because Deno cannot import Next.js modules.
 *
 * @param str - Raw string to escape.
 * @returns HTML-safe string.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Hashes a plaintext token using SHA-256 via Web Crypto API.
 * Returns the hex-encoded hash string for storage in the DB.
 *
 * @param token - Plaintext token to hash.
 * @returns Hex-encoded SHA-256 hash.
 */
async function hashTokenDeno(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * CAN-SPAM physical address. Duplicated from src/lib/site.ts.
 * If this changes, update src/lib/site.ts and src/lib/email.ts as well.
 */
const PHYSICAL_ADDRESS = "195 Dr MLK Jr St N, St Petersburg, FL 33701";

/**
 * Sends an email via the Resend API.
 *
 * Simplified version of the sendEmail in src/lib/email.ts — no unsubscribe
 * headers because this sends transactional emails (report delivery + operator
 * notifications). Includes the branded dark-theme wrapper and CAN-SPAM footer.
 *
 * @param params - Email parameters including Resend credentials.
 * @returns Success/failure result. Never throws.
 */
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  resendKey: string;
  fromEmail: string;
  operatorEmail: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: params.fromEmail,
        to: [params.to],
        subject: params.subject,
        reply_to: params.operatorEmail,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0C0A09; color: #D4D4D8; padding: 32px;">
            ${params.html}
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #27272A; font-size: 12px; color: #71717A; text-align: center;">
              <p style="margin: 0 0 8px;">ImNotAnAttorney</p>
              <p style="margin: 0;">Legal information and research services — not legal advice.</p>
              <p style="margin: 4px 0 0; font-size: 11px; color: #52525B;">${PHYSICAL_ADDRESS}</p>
            </div>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Failed to send email");
    }

    const data = await response.json();
    return { success: true, id: data.id };
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

// ============================================================
// PRODUCT METADATA
// Maps standalone_product_slug to display names and prompt builders.
// ============================================================

/** Human-readable product names keyed by slug. */
const PRODUCT_NAMES: Record<string, string> = {
  "employment-impact": "Employment Impact Assessment",
};

// ============================================================
// CLAUDE API — PROMPTS
// ============================================================

/**
 * System prompt for standalone report generation.
 * UPL-safe, anti-hallucination rules, HTML output format.
 */
function buildSystemPrompt(productName: string): string {
  return `You are generating a ${productName} for a criminal defendant. This is a PAID PRODUCT ($197) that must deliver standalone value.

CRITICAL UPL RULES:
- You provide legal INFORMATION, not legal ADVICE
- Never say "you should", "we recommend", "we advise", "your best option"
- Use: "one consideration is", "questions worth exploring", "factors that may apply"
- Frame everything as information to discuss WITH their attorney

ANTI-HALLUCINATION RULES:
- Only cite laws, statutes, and regulations that exist
- If unsure about a specific state statute, say "state law varies — verify current provisions with your attorney"
- Do not fabricate employer policies, licensing board rules, or agency regulations
- Every factual claim must be traceable to a statute, regulation, or documented pattern
- Never invent case names or case citations

OUTPUT FORMAT: Return clean HTML. Use semantic tags (h2, h3, p, ul, li, strong, table, tr, td, th). No markdown. No code fences. No preamble text before the HTML.

Include this disclaimer at the top of the report:
"This report provides legal INFORMATION — not legal ADVICE. The analysis draws on methods developed by elite defense attorneys, applied specifically to your case details. Your attorney remains the final authority on strategy decisions."`;
}

/**
 * Intake data shape for the employment-impact product.
 * Stored in orders.standalone_intake as JSONB.
 */
interface EmploymentImpactIntake {
  state: string;
  chargeType: string;
  occupation: string;
  employerType: string;
  industryRegulated: boolean;
  hasClearance: boolean;
}

/**
 * Builds the user prompt for a given standalone product slug.
 * Returns null for unknown slugs — the caller handles the error.
 *
 * @param slug - The standalone_product_slug from the order.
 * @param intake - The standalone_intake JSONB data.
 * @returns User prompt string, or null if slug is unsupported.
 */
function buildUserPrompt(slug: string, intake: Record<string, unknown>): string | null {
  switch (slug) {
    case "employment-impact": {
      const data = intake as unknown as EmploymentImpactIntake;
      return `Generate an Employment Impact Assessment for:
- State: ${data.state}
- Charge Type: ${data.chargeType}
- Occupation: """${data.occupation}"""
- Employer Type: ${data.employerType}
- Industry Regulated: ${data.industryRegulated ? "Yes" : "No"}
- Security Clearance: ${data.hasClearance ? "Yes" : "No"}

Produce a comprehensive HTML report covering:
1. Executive Summary with risk level (CRITICAL / SIGNIFICANT / MODERATE / LOW) — under 200 words
2. Background Check Impact (FCRA, state-specific, timing, Ban-the-Box laws)
3. Employer Type Analysis (specific to the defendant's employer type)
4. Industry-Specific Consequences (for the defendant's occupation)
5. Financial Impact Estimate (income loss scenarios)
6. Protective Strategies (framed as questions to explore with attorney — NOT advice)
7. 10 Questions for Your Defense Attorney (charge-type and occupation-specific)`;
    }

    default:
      return null;
  }
}

/**
 * Calls the Anthropic Messages API synchronously.
 * Returns the text content from the first text block.
 *
 * @param systemPrompt - System prompt string.
 * @param userPrompt - User prompt string.
 * @param apiKey - ANTHROPIC_API_KEY.
 * @param model - Claude model ID.
 * @returns Generated text content.
 * @throws On API error or unexpected response shape.
 */
async function callClaudeAPI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API ${response.status}: ${errBody}`);
  }

  const data = await response.json();

  // Extract text from the first text content block
  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === "text"
  );
  if (!textBlock?.text) {
    throw new Error("Claude API returned no text content");
  }

  return textBlock.text;
}

// ============================================================
// ENTRY POINT
// ============================================================

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const headers = { "Content-Type": "application/json" };

  try {
    // --- Read env vars ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase env vars not configured" }),
        { status: 500, headers }
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers }
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@imnotanattorney.com";
    const operatorEmail = Deno.env.get("OPERATOR_EMAIL") || "rahim0kapadia@gmail.com";
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://imnotanattorney.com";
    const claudeModel = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-6-20250514";

    // --- Parse request body ---
    const { orderId } = await req.json();
    if (
      !orderId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
    ) {
      return new Response(
        JSON.stringify({ error: "Valid orderId (UUID) required" }),
        { status: 400, headers }
      );
    }

    console.log(`[generate-standalone] Starting for order ${orderId}`);

    // --- 1. Fetch order ---
    const orders = await supabaseSelect(
      supabaseUrl, supabaseKey, "orders",
      `id=eq.${orderId}&select=*`
    );
    // deno-lint-ignore no-explicit-any
    const order = (orders as any[])[0];
    if (!order) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers }
      );
    }

    // --- 2. Idempotency guard ---
    // If the order already has a report uploaded, skip generation.
    // Prevents duplicate work on webhook retries or operator re-triggers.
    if (order.standalone_report_storage_path) {
      console.log(`[generate-standalone] Order ${orderId} already has report, skipping`);
      return new Response(
        JSON.stringify({
          success: true,
          orderId,
          status: order.status,
          skipped: true,
        }),
        { headers }
      );
    }

    // --- 3. Validate standalone data ---
    const slug = order.standalone_product_slug;
    const intake = order.standalone_intake;

    if (!slug || !intake) {
      const msg = !slug
        ? "Order missing standalone_product_slug"
        : "Order missing standalone_intake";
      console.error(`[generate-standalone] ${msg}: ${orderId}`);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers }
      );
    }

    const productName = PRODUCT_NAMES[slug];
    if (!productName) {
      return new Response(
        JSON.stringify({ error: `Unsupported product slug: ${slug}` }),
        { status: 400, headers }
      );
    }

    // --- 4. Build prompts ---
    const systemPrompt = buildSystemPrompt(productName);
    const userPrompt = buildUserPrompt(slug, intake);

    if (!userPrompt) {
      return new Response(
        JSON.stringify({ error: `No prompt builder for slug: ${slug}` }),
        { status: 400, headers }
      );
    }

    // --- 5. Update status to generating ---
    await supabaseUpdate(supabaseUrl, supabaseKey, "orders", `id=eq.${orderId}`, {
      status: "generating",
      updated_at: new Date().toISOString(),
    });

    console.log(`[generate-standalone] Calling Claude API (${claudeModel}) for ${slug}...`);

    // --- Generation phase (inner try/catch) ---
    // Errors here have orderId in scope, so we can update order status
    // and send operator notification with retry command.
    try {
      // --- 6. Call Claude API ---
      const reportHtml = await callClaudeAPI(systemPrompt, userPrompt, anthropicKey, claudeModel);

      console.log(`[generate-standalone] Claude returned ${reportHtml.length} chars`);

      // --- 7. Generate report token ---
      const tokenBytes = crypto.getRandomValues(new Uint8Array(16));
      const plaintextToken = Array.from(tokenBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const tokenHash = await hashTokenDeno(plaintextToken);

      // --- 8. Upload HTML to Supabase Storage ---
      const storagePath = `standalone-reports/${orderId}.html`;
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/${storagePath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "text/html",
            "x-upsert": "true",
          },
          body: reportHtml,
        }
      );

      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.text();
        throw new Error(`Storage upload failed: ${uploadRes.status} — ${uploadErr}`);
      }

      console.log(`[generate-standalone] Report uploaded to ${storagePath}`);

      // --- 9. Update order with token + path + expiry ---
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year expiry

      await supabaseUpdate(supabaseUrl, supabaseKey, "orders", `id=eq.${orderId}`, {
        standalone_report_token_hash: tokenHash,
        standalone_report_storage_path: storagePath,
        standalone_report_token_expires_at: expiresAt.toISOString(),
        status: "delivered",
        updated_at: new Date().toISOString(),
      });

      console.log(`[generate-standalone] Order ${orderId} updated — status: delivered`);

      // --- 10. Send delivery email ---
      if (resendKey && order.email) {
        const reportUrl = `${siteUrl}/report/standalone/${plaintextToken}`;
        const emailResult = await sendEmail({
          to: order.email,
          subject: `Your ${productName} is ready`,
          html: `
            <h1 style="color: #F5F5F4; font-size: 24px; margin-bottom: 16px;">Your Report Is Ready</h1>
            <p style="color: #D4D4D8; font-size: 16px; line-height: 1.6; margin-bottom: 8px;">
              Your personalized ${escapeHtml(productName)} is ready to view.
            </p>
            <p style="color: #A1A1AA; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
              This report was generated specifically for your situation and contains
              detailed analysis based on the information you provided.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${reportUrl}"
                 style="display: inline-block; background: #2563EB; color: #FFFFFF; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                View Your Report
              </a>
            </div>
            <p style="color: #71717A; font-size: 12px; line-height: 1.5; margin-top: 24px;">
              This report provides legal INFORMATION — not legal ADVICE. Your attorney
              remains the final authority on strategy decisions.
            </p>
          `,
          resendKey,
          fromEmail: resendFrom,
          operatorEmail,
        });

        if (emailResult.success) {
          console.log(`[generate-standalone] Delivery email sent to ${order.email}`);
        } else {
          console.error(`[generate-standalone] Delivery email failed: ${emailResult.error}`);
        }
      }

      // --- 11. Return success ---
      return new Response(
        JSON.stringify({
          success: true,
          orderId,
          storagePath,
          status: "delivered",
        }),
        { status: 200, headers }
      );
    } catch (genError) {
      // --- Generation-phase error handler ---
      // orderId is in scope here, so we can update the order and notify operator.
      console.error(`[generate-standalone] Generation failed for ${orderId}:`, genError);

      await supabaseUpdate(supabaseUrl, supabaseKey, "orders", `id=eq.${orderId}`, {
        status: "generation-failed",
        updated_at: new Date().toISOString(),
      });

      if (resendKey) {
        const errMsg = genError instanceof Error ? genError.message : String(genError);
        await sendEmail({
          to: operatorEmail,
          subject: `URGENT: Standalone report generation failed — ${productName}`,
          html: `<h1 style="color: #EF4444;">Report Generation Failed</h1>
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Customer:</strong> ${escapeHtml(order.email || "unknown")}</p>
            <p><strong>Product:</strong> ${escapeHtml(productName)}</p>
            <p><strong>Error:</strong> ${escapeHtml(errMsg)}</p>
            <p style="margin-top: 16px;"><strong>Retry command:</strong></p>
            <code style="display: block; background: #1C1917; padding: 12px; border-radius: 8px; margin: 8px 0; color: #F59E0B; word-break: break-all;">curl -X POST ${supabaseUrl}/functions/v1/generate-standalone -H "Content-Type: application/json" -H "Authorization: Bearer ${supabaseKey}" -d '{"orderId":"${orderId}"}'</code>`,
          resendKey,
          fromEmail: resendFrom,
          operatorEmail,
        });
      }

      return new Response(
        JSON.stringify({ error: "Report generation failed" }),
        { status: 500, headers }
      );
    }
  } catch (error) {
    // --- Outer error handler ---
    // Catches pre-generation errors (env vars missing, JSON parse failure,
    // order not found in DB, etc.) where orderId may not be available.
    console.error("[generate-standalone] Unhandled error:", error);

    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@imnotanattorney.com";
      const operatorEmail = Deno.env.get("OPERATOR_EMAIL") || "rahim0kapadia@gmail.com";

      if (resendKey) {
        await sendEmail({
          to: operatorEmail,
          subject: "URGENT: generate-standalone unhandled error",
          html: `<h1 style="color: #EF4444;">Unhandled Error in generate-standalone</h1>
            <p><strong>Error:</strong> ${escapeHtml(error instanceof Error ? error.message : String(error))}</p>
            <p style="color: #71717A;">Check Supabase Edge Function logs for full stack trace.</p>`,
          resendKey,
          fromEmail: resendFrom,
          operatorEmail,
        });
      }
    } catch (innerError) {
      console.error("[generate-standalone] Error handler failed:", innerError);
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
