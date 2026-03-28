/**
 * PATCH /api/admin/blog-pipeline/[id] — management actions on individual drafts
 *
 * Actions:
 *   retry-qa       — reset to 'draft', clear all QA fields
 *   decline        — set draft + linked content_gap to 'declined'
 *   approve-override — force to 'qa-passed' with qa_passed_at = now()
 *   edit           — update mdx_content, increment version, reset QA fields
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdmin(req);
  if (!auth.authorized) return auth.error;

  const { id } = await params;

  let body: { action: string; mdx_content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;

  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "action (string) required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch the draft first to get content_gap_id for linked updates
  const { data: draft, error: fetchError } = await supabase
    .from("blog_drafts")
    .select("id, content_gap_id, version")
    .eq("id", id)
    .single();

  if (fetchError || !draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (action === "retry-qa") {
    const { error } = await supabase
      .from("blog_drafts")
      .update({
        status: "draft",
        qa_attempts: 0,
        humanizer_score: null,
        humanizer_details: null,
        a1_result: null,
        a1_details: null,
        upl_result: null,
        upl_details: null,
        qa_passed_at: null,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, action, draft_id: id });
  }

  if (action === "decline") {
    const { error: draftError } = await supabase
      .from("blog_drafts")
      .update({ status: "declined" })
      .eq("id", id);

    if (draftError) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (draft.content_gap_id) {
      const { error: gapError } = await supabase
        .from("content_gaps")
        .update({ status: "declined" })
        .eq("id", draft.content_gap_id);

      if (gapError) {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, action, draft_id: id });
  }

  if (action === "approve-override") {
    const { error } = await supabase
      .from("blog_drafts")
      .update({
        status: "qa-passed",
        qa_passed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (draft.content_gap_id) {
      await supabase
        .from("content_gaps")
        .update({ status: "qa-passed" })
        .eq("id", draft.content_gap_id);
    }

    return NextResponse.json({ success: true, action, draft_id: id });
  }

  if (action === "edit") {
    if (!body.mdx_content || typeof body.mdx_content !== "string") {
      return NextResponse.json(
        { error: "mdx_content (string) required for edit action" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("blog_drafts")
      .update({
        mdx_content: body.mdx_content,
        version: (draft.version || 1) + 1,
        // Reset all QA fields so the edited draft re-runs QA
        status: "draft",
        qa_attempts: 0,
        humanizer_score: null,
        humanizer_details: null,
        a1_result: null,
        a1_details: null,
        upl_result: null,
        upl_details: null,
        qa_passed_at: null,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, action, draft_id: id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
