# Flow: Score Re-engagement (Extended), Email 2 of 4

**Trigger:** Email 1 sent, no purchase
**Timing:** Day 14 after score completion
**Goal:** Charge-specific value, send the most relevant blog content based on their charge type

## Subject Line Options (3 versions for A/B testing)
1. The one thing {{CHARGE_LABEL}} defendants always miss
2. If you're facing {{CHARGE_LABEL}} charges, read this
3. What your attorney might not have told you about {{CHARGE_LABEL}} cases

## Preview Text
Every charge type has blind spots. Here's the one that matters most for yours.

## Email Body

<!, 
  Flow: Score Re-engagement (Extended)
  Position: Email 2 of 4
  Trigger: Email 1 sent, no purchase
  Delay: Day 14 after score completion
  Segment: score-page subscribers, segmented by chargeType, no purchase
  Exit condition: Purchase completed (any tier) = exit flow

  Subject line: The one thing {{CHARGE_LABEL}} defendants always miss
  Subject line B: If you're facing {{CHARGE_LABEL}} charges, read this
  Subject line C: What your attorney might not have told you about {{CHARGE_LABEL}} cases
  Preview text: Every charge type has blind spots. Here's the one that matters most for yours.

  NOTE: This email has 5 variants based on charge type. Primary variant shown is DUI.
  All variants follow the same structure: charge-specific insight + relevant blog link + CTA.
, >

<!, ====== DUI VARIANT ======,>

<h1 style="color: #F59E0B; font-size: 22px; margin: 0 0 16px;">The DUI Blind Spot Most Defendants Never See.</h1>

<p>You're facing DUI charges. You scored {{SCORE}}/100 on the Defense Milestone Score two weeks ago. Here's the one thing DUI defendants miss more than anything else.</p>

<p><strong style="color: white;">The breathalyzer reading is not the case.</strong></p>

<p>Most defendants, and honestly, a lot of attorneys, treat the breathalyzer number like a verdict. You blew .12, so you're guilty. End of story.</p>

<p>Except it's not the end. It's the beginning of a set of questions nobody is asking:</p>

<ul style="padding-left: 20px; margin: 12px 0;">
  <li style="margin-bottom: 8px;"><strong style="color: white;">When was the device last calibrated?</strong> Breathalyzers drift. Calibration records can show patterns of inaccurate readings.</li>
  <li style="margin-bottom: 8px;"><strong style="color: white;">Did the officer observe a 15-minute deprivation period?</strong> Required in most jurisdictions. If the defendant burped, vomited, or ate within 15 minutes of the test, the result can be challenged.</li>
  <li style="margin-bottom: 8px;"><strong style="color: white;">Was a blood test offered as an alternative?</strong> Blood is more accurate. If it wasn't offered, that's worth asking about.</li>
</ul>

<p>We wrote a full guide on this. No paywall. No sign-up.</p>

<a href="https://imnotanattorney.com/blog/breathalyzer-calibration-records" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 15px;">Read: Breathalyzer Calibration Records</a>

<p style="font-size: 14px; color: #A1A1AA;">Also relevant: <a href="https://imnotanattorney.com/blog/field-sobriety-test-standards" style="color: #F59E0B; text-decoration: underline;">Field Sobriety Test Standards</a> | <a href="https://imnotanattorney.com/blog/10-day-dmv-deadline" style="color: #F59E0B; text-decoration: underline;">The 10-Day DMV Deadline</a></p>

<!, ====== DRUG VARIANT (swap in for DUI section above) ======
<h1>The Drug Case Blind Spot Most Defendants Never See.</h1>
Focus on: field test vs lab test discrepancies, chain of custody gaps,
constructive vs actual possession.
Link to: /blog/field-test-vs-lab-test-drug-cases, /blog/trafficking-charges-constructive-possession
CTA: Read the guide + Case Decoder pitch
, >

<!, ====== WHITE-COLLAR VARIANT ======
<h1>The White Collar Blind Spot Most Defendants Never See.</h1>
Focus on: mens rea requirements (intent vs mistake), document preservation,
statute of limitations analysis.
Link to: /blog/complete-white-collar-defense-guide, /blog/wire-fraud-defense-questions
, >

<!, ====== OTHER-FELONY VARIANT ======
<h1>The Blind Spot Most Felony Defendants Never See.</h1>
Focus on: discovery rights, motion deadlines, attorney communication frequency.
Link to: /blog/how-criminal-cases-actually-work, /blog/10-questions-every-defendant-should-ask
, >

<!, ====== OTHER-MISDEMEANOR VARIANT ======
<h1>The Blind Spot Most Misdemeanor Defendants Never See.</h1>
Focus on: collateral consequences (background checks, professional licenses),
plea deal evaluation, what the prosecution must actually prove.
Link to: /blog/should-you-take-the-plea-deal, /blog/can-criminal-charges-be-dropped
, >

<div style="margin: 24px 0; padding: 16px; border: 1px solid #F59E0B30; border-radius: 8px; background: #F59E0B08;">
  <p style="margin: 0 0 8px; font-size: 14px; color: white; font-weight: bold;">Want questions built for YOUR exact case?</p>
  <p style="margin: 0 0 12px; font-size: 13px; color: #D4D4D8;">The blog gives you general DUI questions. The Case Decoder gives you 15 questions calibrated to your charges, your jurisdiction, and your case stage. $197. Delivered within 48 hours.</p>
  <a href="https://imnotanattorney.com/checkout?tier=case-decoder" style="color: #F59E0B; text-decoration: underline; font-size: 13px;">Get my Case Decoder &rarr;</a>
</div>

<p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; font-size: 13px;">
  <strong style="color: white;">P.S.</strong> The guides we linked above are free. Read them before your next attorney meeting. Print them if you have to. Walk in with specific questions about calibration records, field sobriety procedures, and the DMV deadline. Watch how the conversation changes when your attorney realizes you've done the reading.
</p>

## CTA Button
**Text:** Read: Breathalyzer Calibration Records (DUI variant)
**URL:** https://imnotanattorney.com/blog/breathalyzer-calibration-records (DUI variant)

## Segmentation Notes
- Variables: `{{SCORE}}`, `{{CHARGE_LABEL}}`, `{{CHARGE_TYPE}}`
- 5 variants based on charge type from quiz:
  - `dui` → Breathalyzer/field sobriety/DMV angle
  - `drug` → Field test vs lab test/chain of custody angle
  - `white-collar` → Mens rea/document preservation angle
  - `other-felony` → General defense rights/motion deadlines angle
  - `other-misdemeanor` → Collateral consequences/plea evaluation angle
- If charge type is unknown, default to `other-felony` variant
- Suppress if subscriber purchased any tier

## Performance Metrics to Track
- Open rate target: 22-30%
- Click rate target: 8-14% (content-focused email with high relevance)
- Blog page views from email: track UTM parameter
- Case Decoder conversion from secondary CTA: 2-4%
