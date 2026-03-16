# Flow: Score Re-engagement (Extended) — Email 1 of 4

**Trigger:** Completed the Defense Milestone Score quiz, provided email, did not purchase any product within 7 days. This flow starts AFTER the existing score-quiz-reengagement flow (flow-3) ends at day 7.
**Timing:** Day 7 after score completion (continues immediately from flow-3)
**Goal:** Re-contextualize their score — make it tangible and action-oriented

## Subject Line Options (3 versions for A/B testing)
1. Your defense score was {{SCORE}}. Here's what changed since then.
2. 7 days since your score. Has anything changed?
3. Your attorney had 7 days. What happened?

## Preview Text
Your score was {{SCORE}}/100. The question is whether it would be different today.

## Email Body

<!--
  Flow: Score Re-engagement (Extended)
  Position: Email 1 of 4
  Trigger: Completed /score quiz + provided email + no purchase within 7 days (after flow-3 ends)
  Delay: Day 7 after score completion
  Segment: score-page subscribers, no purchase, completed flow-3 without converting
  Exit condition: Purchase completed (any tier) = exit flow

  Subject line: Your defense score was {{SCORE}}. Here's what changed since then.
  Subject line B: 7 days since your score. Has anything changed?
  Subject line C: Your attorney had 7 days. What happened?
  Preview text: Your score was {{SCORE}}/100. The question is whether it would be different today.
-->

<h1 style="color: #F59E0B; font-size: 22px; margin: 0 0 16px;">It's Been 7 Days Since You Scored {{SCORE}}/100.</h1>

<p>A week ago, you took the Defense Milestone Score. You saw the number. You read the observations.</p>

<p>Here's the question that matters now: <strong style="color: white;">has anything changed?</strong></p>

<p>Has your attorney called you? Have any motions been filed? Have you seen discovery? Has anyone explained what the prosecution's strategy is?</p>

<p>If the answer to any of those is yes — good. Progress is progress.</p>

<p>If the answer is no — your score wouldn't be any different today than it was 7 days ago. And next week, it'll still be the same. Scores don't change on their own. They change when someone starts asking the right questions.</p>

<p><strong style="color: white;">Here's what defendants with a score like yours are asking right now:</strong></p>

<div style="margin: 16px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
  <p style="margin: 0 0 4px; font-size: 13px; color: #F59E0B; font-weight: bold;">QUESTION 1 — DISCOVERY STATUS</p>
  <p style="margin: 0; font-size: 14px; font-style: italic; color: white;">"Have you received all discovery from the prosecution? Is there anything outstanding that you're still waiting on?"</p>
</div>

<div style="margin: 16px 0; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917;">
  <p style="margin: 0 0 4px; font-size: 13px; color: #F59E0B; font-weight: bold;">QUESTION 2 — MOTION STRATEGY</p>
  <p style="margin: 0; font-size: 14px; font-style: italic; color: white;">"What motions are you considering, and what are the deadlines for filing them?"</p>
</div>

<p>Those two are on us. Free. Send them to your attorney today — email or phone.</p>

<p>If you want the full set — 15 questions calibrated to your specific charges, jurisdiction, and case stage — that's the Case Decoder.</p>

<a href="https://imnotanattorney.com/checkout?tier=case-decoder" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 15px;">Get 15 Questions for My Case — $197</a>

<p style="font-size: 13px; color: #A1A1AA;">Delivered within 48 hours. 100% money-back guarantee. Full credit toward higher tiers.</p>

<p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; font-size: 13px;">
  <strong style="color: white;">P.S.</strong> Your score was {{SCORE}}/100. If that number bothered you a week ago, it should still bother you today. Not because the number is everything — but because it's telling you something your attorney hasn't told you yet.
</p>

## CTA Button
**Text:** Get 15 Questions for My Case — $197
**URL:** https://imnotanattorney.com/checkout?tier=case-decoder

## Segmentation Notes
- Variables: `{{SCORE}}` — numeric 0-100 from quiz result
- Only send to subscribers who completed flow-3 without purchasing
- Suppress if subscriber purchased any tier since completing the quiz
- Leads with 2 free questions (genuine value) before the Case Decoder CTA

## Performance Metrics to Track
- Open rate target: 25-35%
- Click rate target: 6-10%
- Case Decoder conversion rate: 3-5%
