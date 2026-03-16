# Flow: Score Re-engagement (Extended) — Email 3 of 4

**Trigger:** Email 2 sent, no purchase
**Timing:** Day 21 after score completion
**Goal:** Case study / scenario — show what happens when a defendant in a similar position asks the right questions (anonymized, informational)

## Subject Line Options (3 versions for A/B testing)
1. A defendant with a similar score asked 5 questions. Here's what happened.
2. Same score. Different outcome. The only difference was the questions.
3. What happens when you stop hoping and start asking

## Preview Text
Two defendants. Same charges. Same score. Only one asked the questions that mattered.

## Email Body

<!--
  Flow: Score Re-engagement (Extended)
  Position: Email 3 of 4
  Trigger: Email 2 sent, no purchase
  Delay: Day 21 after score completion
  Segment: score-page subscribers, no purchase, completed Emails 1-2 without converting
  Exit condition: Purchase completed (any tier) = exit flow

  Subject line: A defendant with a similar score asked 5 questions. Here's what happened.
  Subject line B: Same score. Different outcome. The only difference was the questions.
  Subject line C: What happens when you stop hoping and start asking
  Preview text: Two defendants. Same charges. Same score. Only one asked the questions that mattered.
-->

<h1 style="color: #F59E0B; font-size: 22px; margin: 0 0 16px;">Same Charges. Same Score. Different Outcomes.</h1>

<p>Your Defense Milestone Score was {{SCORE}}/100 three weeks ago. Here's a scenario that might sound familiar.</p>

<div style="margin: 20px 0; padding: 20px; border: 1px solid #27272A; border-radius: 8px; background: #1C1917;">
  <p style="margin: 0 0 4px; font-size: 13px; color: #EF4444; font-weight: bold;">DEFENDANT A</p>
  <p style="margin: 0 0 12px; font-size: 14px; color: #D4D4D8;">Trusted the process. Didn't ask questions. Assumed the attorney was handling everything. Showed up to meetings without preparation. Accepted the first plea offer because "my lawyer said it was good."</p>

  <p style="margin: 0 0 4px; font-size: 13px; color: #22C55E; font-weight: bold;">DEFENDANT B</p>
  <p style="margin: 0; font-size: 14px; color: #D4D4D8;">Same charges. Same case stage. But Defendant B walked into the attorney meeting with 5 specific questions. Asked about motions that hadn't been filed. Asked about discovery discrepancies. Asked about the prosecution's burden of proof for each element of the charge.</p>
</div>

<p>What happened?</p>

<p><strong style="color: white;">Defendant B's attorney filed two motions that week.</strong> Not because the attorney was bad before — but because someone was paying attention. Someone was asking the questions that required real answers, not "we're working on it."</p>

<p>This isn't a fairy tale. This is how criminal defense actually works. Attorneys are overloaded. They're juggling dozens of cases. The clients who ask informed questions get more attention. Not because the system is fair — because that's reality.</p>

<p><strong style="color: white;">The only difference between Defendant A and Defendant B was the questions.</strong></p>

<p>Here are two you can use right now:</p>

<div style="margin: 16px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
  <p style="margin: 0; font-size: 14px; font-style: italic; color: white;">"What is the prosecution required to prove for each element of my charges, and how strong is their evidence on each element?"</p>
</div>

<div style="margin: 16px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
  <p style="margin: 0; font-size: 14px; font-style: italic; color: white;">"If we went to trial today, what would be your biggest concern about our defense?"</p>
</div>

<p>Those are free. Ask them at your next meeting.</p>

<p>But if you want 15 questions — built from your charges, your jurisdiction, your case stage — with follow-up probes, red flag responses, and email templates you can send today...</p>

<a href="https://imnotanattorney.com/checkout?tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 15px;">Get My Case Decoder — $197</a>

<p style="font-size: 13px; color: #A1A1AA;">48-hour delivery. Money-back guarantee. Full credit toward higher tiers within 12 months.</p>

<p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; font-size: 13px;">
  <strong style="color: white;">P.S.</strong> We've given you 7 free questions across these emails. If you've used even one of them, you already know what it feels like to walk into a meeting prepared. The Case Decoder gives you 15 more — calibrated, sourced, and formatted with email templates so you don't have to figure out how to phrase them. <a href="https://imnotanattorney.com/sample" style="color: #F59E0B; text-decoration: underline;">See what a real report looks like</a>.
</p>

## CTA Button
**Text:** Get My Case Decoder — $197
**URL:** https://imnotanattorney.com/checkout?tier=case-decoder

## Segmentation Notes
- Variables: `{{SCORE}}`, `{{CHARGE_LABEL}}`
- Suppress if subscriber purchased any tier since Email 2
- This email uses a Defendant A / Defendant B comparison format — anonymized, informational, no specific case details
- UPL-safe: describes what questions do (change the dynamic of attorney meetings), not what outcomes they cause

## Performance Metrics to Track
- Open rate target: 20-28%
- Click rate target: 5-8%
- Case Decoder conversion rate: 4-6%
