# Flow: Win-Back (60-Day Cold), Email 5 of 5

**Trigger:** Email 4 sent, subscriber still not re-engaged (no open, no click)
**Timing:** Day 21 (21 days after Email 1)
**Goal:** Breakup email, last email before suppression. Clear re-opt-in mechanism. If no action, mark inactive.

## Subject Line Options (3 versions for A/B testing)
1. Goodbye (unless you say otherwise)
2. Removing you from our list
3. This is the last one

## Preview Text
One click keeps you on the list. No click and we're done. No hard feelings.

## Email Body

<!, 
  Flow: Win-Back (60-Day Cold Subscribers)
  Position: Email 5 of 5
  Trigger: Email 4 sent, no open/click/re-engagement
  Delay: Day 21 (21 days after Email 1)
  Segment: 60-day cold subscribers who didn't engage with Emails 1-4
  Action on non-open: After 48 hours with no open, mark subscriber as inactive/suppressed

  Subject line: Goodbye (unless you say otherwise)
  Subject line B: Removing you from our list
  Subject line C: This is the last one
  Preview text: One click keeps you on the list. No click and we're done. No hard feelings.
, >

<h1 style="color: #F59E0B; font-size: 22px; margin: 0 0 16px;">This Is Goodbye.</h1>

<p>We've sent five emails over the past three weeks. You haven't opened one.</p>

<p>We hear you.</p>

<p>In 48 hours, we're removing your email from our active list. You won't hear from us again.</p>

<p><strong style="color: white;">If that's what you want</strong>, you don't need to do anything. Just close this email. Done.</p>

<p><strong style="color: white;">If you want to stay</strong>, one click:</p>

<a href="https://imnotanattorney.com/api/resubscribe?email={{EMAIL_BASE64}}" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 15px;">Wait, Keep Me on the List</a>

<p>No matter what happens with this email, here's what doesn't change:</p>

<div style="margin: 20px 0; padding: 16px; border: 1px solid #27272A; border-radius: 8px; background: #1C1917;">
  <p style="margin: 0 0 8px; font-size: 14px; color: white; font-weight: bold;">Always free. Always available. No login required.</p>
  <ul style="padding-left: 20px; margin: 8px 0 0; font-size: 13px; color: #D4D4D8;">
    <li style="margin-bottom: 6px;"><a href="https://imnotanattorney.com/score" style="color: #F59E0B; text-decoration: underline;">Defense Milestone Score</a>, 60-second defense checkup</li>
    <li style="margin-bottom: 6px;"><a href="https://imnotanattorney.com/resources" style="color: #F59E0B; text-decoration: underline;">Free Guides</a>, discovery rights, motion checklists, attorney red flags</li>
    <li style="margin-bottom: 6px;"><a href="https://imnotanattorney.com/blog" style="color: #F59E0B; text-decoration: underline;">Blog</a>, 35 articles on criminal defense, attorney accountability, case strategy</li>
  </ul>
</div>

<p>Bookmark those. Share them. Whether you're on our email list or not, those resources exist because every defendant deserves to understand what's happening with their case.</p>

<p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; font-size: 13px;">
  <strong style="color: white;">P.S.</strong> If someone you know is going through the system right now, scared, confused, feeling like nobody is on their side, send them to <a href="https://imnotanattorney.com" style="color: #F59E0B; text-decoration: underline;">imnotanattorney.com</a>. We built this for them. Even if you never open another email from us, passing this along to the right person could change someone's entire experience with the criminal justice system. That's not nothing.
</p>

## CTA Button
**Text:** Wait, Keep Me on the List
**URL:** https://imnotanattorney.com/api/resubscribe?email={{EMAIL_BASE64}}

## Segmentation Notes
- Variables: `{{EMAIL_BASE64}}`, subscriber's email, base64 encoded
- Final email in the 60-day win-back flow
- If subscriber does NOT open or click within 48 hours: mark as `inactive = true`, suppress from all future sends
- If subscriber clicks "Keep Me on the List": mark as re-engaged, reset engagement tracking, exit flow
- Do NOT delete the subscriber record, just suppress. They can re-subscribe later via /score or site forms.

## Performance Metrics to Track
- Open rate target: 5-10%
- Re-engagement click rate: 2-4%
- List cleanup (marked inactive): 85-95% of recipients (expected and healthy)
- This email's primary KPI is list hygiene, not conversion
