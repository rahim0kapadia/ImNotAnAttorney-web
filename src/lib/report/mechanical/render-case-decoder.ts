/**
 * Mechanical skeleton for Case Decoder reports.
 *
 * Renders the fixed structural scaffolding of a CD report: intake
 * summary, charge breakdown stubs, 15-question framework header,
 * attorney-email-template shell, 7-day action plan skeleton.
 * Voice-critical sections (e.g. "what this means for you", the
 * calibrated question prose) are emitted as `{{SLOT:name}}` tokens
 * that the hybrid orchestrator fills via Haiku calls.
 *
 * The mechanical path itself (flipped via tier_generation_config) is
 * rarely the right choice for CD (~60-65% of CD content is generative,
 * above the 15% pure-mechanical cap) — kept here because it backs the
 * hybrid renderer and can still be flipped per-tier for tiers where
 * mechanical alone suffices (e.g. playbooks, Tier 9 instant SKUs).
 */
import {
  CaseDecoderIntake,
  escapeHtml,
  slotMarker,
} from "./common";

export type MechanicalResult = {
  html: string;
  slotsEmitted: string[];
};

const SLOTS = [
  "plain_english_charge_explanation",
  "what_this_means_for_you",
  "top_three_defense_angles",
  "prosecution_burden_summary",
  "question_framework_preamble",
  "attorney_email_body",
  "seven_day_plan_voice",
] as const;

export function renderCaseDecoderMechanical(
  intake: CaseDecoderIntake,
): MechanicalResult {
  const firstName = escapeHtml(intake.first_name) || "friend";
  const charge = escapeHtml(intake.charge_type) || "your charge";
  const state = escapeHtml(intake.state) || "your state";
  const jurisdiction = escapeHtml(intake.jurisdiction_level) || "your court";
  const arrestDate = escapeHtml(intake.arrest_date) || "unspecified";
  const courtDate = escapeHtml(intake.court_date) || "not yet set";
  const plea = escapeHtml(intake.plea_offered) || "none on the table";
  const coDefendants = escapeHtml(intake.co_defendants) || "none";
  const situation = escapeHtml(intake.situation) || "";
  const specificQuestion = escapeHtml(intake.specific_question) || "";

  const html = `<article class="report cd-report">
  <header>
    <h1>Case Decoder — ${firstName}</h1>
    <p class="intake-summary">${charge} in ${state} (${jurisdiction}). Arrest: ${arrestDate}. Court: ${courtDate}. Plea: ${plea}. Co-defendants: ${coDefendants}.</p>
  </header>

  <section id="plain-english-explanation">
    <h2>What the prosecution must prove</h2>
    ${slotMarker("plain_english_charge_explanation")}
  </section>

  <section id="what-this-means">
    <h2>What this means for you</h2>
    ${slotMarker("what_this_means_for_you")}
  </section>

  <section id="defense-angles">
    <h2>Three angles worth exploring</h2>
    ${slotMarker("top_three_defense_angles")}
  </section>

  <section id="prosecution-burden">
    <h2>The prosecution's burden, in plain English</h2>
    ${slotMarker("prosecution_burden_summary")}
  </section>

  <section id="questions">
    <h2>15 calibrated questions to bring to your attorney</h2>
    <p class="question-preamble">${slotMarker("question_framework_preamble")}</p>
    <ol class="question-list">
      <li>What is your theory of defense?</li>
      <li>Which elements of the charge do you think the prosecution will struggle with?</li>
      <li>What is the single strongest piece of evidence against me?</li>
      <li>What is the single weakest piece of evidence against me?</li>
      <li>What motions are you planning to file?</li>
      <li>On what grounds would you move to suppress the stop/search/statement?</li>
      <li>Have you reviewed my co-defendants' statements and what they say about my role?</li>
      <li>What is a realistic best-case outcome at trial?</li>
      <li>What is a realistic worst-case outcome at trial?</li>
      <li>If we take a plea, what collateral consequences should I expect (immigration, licensing, firearms, housing)?</li>
      <li>Who is the prosecutor assigned, and what patterns have you seen from them?</li>
      <li>Who is the judge, and what patterns have you seen from them?</li>
      <li>What is the deadline for the plea currently offered?</li>
      <li>If we reject the plea, what are the prosecution's next most likely moves?</li>
      <li>What can I do this week that would strengthen our position?</li>
    </ol>
  </section>

  <section id="attorney-email">
    <h2>Email template for your attorney</h2>
    <pre class="attorney-email">${slotMarker("attorney_email_body")}</pre>
  </section>

  <section id="seven-day-plan">
    <h2>Your 7-day plan</h2>
    ${slotMarker("seven_day_plan_voice")}
  </section>

  ${specificQuestion ? `<aside class="your-question"><h3>Your specific question</h3><p>${specificQuestion}</p></aside>` : ""}
  ${situation ? `<aside class="your-situation"><h3>Context you shared</h3><p>${situation}</p></aside>` : ""}
</article>`;

  return {
    html,
    slotsEmitted: [...SLOTS],
  };
}
