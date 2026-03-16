# Flow: Win-Back (60-Day Cold) — Email 1 of 5

**Trigger:** Subscriber hasn't opened an email in 60+ days AND did not re-engage during the 30-day win-back flow (flow-2)
**Timing:** Day 0 (immediately on entering 60-day cold segment)
**Goal:** Check in — acknowledge their situation may have changed, reopen the relationship

## Subject Line Options (3 versions for A/B testing)
1. Still fighting?
2. A lot can change in 60 days
3. We don't know if your case is over — but we're still here

## Preview Text
If your case is done, we're happy for you. If it's not, this matters.

## Email Body

<!--
  Flow: Win-Back (60-Day Cold Subscribers)
  Position: Email 1 of 5
  Trigger: No email open in 60+ days, did not re-engage during 30-day win-back
  Delay: Day 0 (immediate on entering 60-day cold segment)
  Segment: All subscribers with last_opened_at > 60 days ago, unsubscribed = false
  Exit condition: Opens any email in this sequence = re-engaged, exit flow

  Subject line: Still fighting?
  Subject line B: A lot can change in 60 days
  Subject line C: We don't know if your case is over — but we're still here
  Preview text: If your case is done, we're happy for you. If it's not, this matters.
-->

<h1 style="color: #F59E0B; font-size: 22px; margin: 0 0 16px;">It's Been a While.</h1>

<p>We haven't heard from you in over two months. That's a long time in a criminal case.</p>

<p>A lot can happen in 60 days. Plea offers get made. Motions get decided. Cases get resolved. Or they drag on, and you stop checking because it's easier not to think about it.</p>

<p>We don't know which one happened to you. But we wanted to check in.</p>

<p><strong style="color: white;">If your case is resolved</strong> — genuinely, congratulations. That chapter is closed. You can unsubscribe at the bottom of this email and we'll never bother you again.</p>

<p><strong style="color: white;">If it's still going</strong> — we need to talk. Because the defendants who go quiet are the ones whose cases get the least attention. From their attorneys. From the court. From everyone.</p>

<p>Going quiet doesn't make a case go away. It just makes it easier for everyone else to stop paying attention to it.</p>

<p>We're still here. Still building questions. Still helping defendants who refuse to sit in the dark.</p>

<a href="https://imnotanattorney.com/score" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 15px;">Check My Defense Score — Free, 60 Seconds</a>

<p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; font-size: 13px;">
  <strong style="color: white;">P.S.</strong> If you know someone else going through it right now — a friend, a family member, someone in your life who's scared and confused — send them to <a href="https://imnotanattorney.com" style="color: #F59E0B; text-decoration: underline;">imnotanattorney.com</a>. The free resources alone could change their next attorney meeting. Even if you don't need us anymore, someone you know might.
</p>

## CTA Button
**Text:** Check My Defense Score — Free, 60 Seconds
**URL:** https://imnotanattorney.com/score

## Segmentation Notes
- Only send to subscribers who have been cold for 60+ days
- Do NOT send to subscribers who are currently in the 30-day win-back flow (flow-2)
- Exit flow on any open in this sequence

## Performance Metrics to Track
- Open rate target: 8-15% (deeply cold audience, lower expectations)
- Click rate target: 3-6%
- Re-engagement rate (opens subsequent emails): 10-20%
