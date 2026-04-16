# Flow: Score Quiz Abandonment, Email 1 of 3

**Trigger:** User started the Defense Milestone Score quiz at /score but didn't complete it, OR completed it but didn't provide email / didn't purchase. Email captured via partial form submission or prior subscriber record.
**Timing:** 2 hours after abandonment
**Goal:** Reopen the curiosity loop, pull them back to finish the quiz

## Subject Line Options (3 versions for A/B testing)
1. You left something unfinished
2. Your defense score is waiting
3. 60 seconds away from knowing where you stand

## Preview Text
7 questions. No email required. But you already knew that, you were almost done.

## Email Body

<!, 
  Flow: Score Quiz Abandonment
  Position: Email 1 of 3
  Trigger: Started /score quiz but did not complete or did not purchase
  Delay: 2 hours after abandonment
  Segment: Subscribers who visited /score, did not complete quiz or did not purchase
  Exit condition: Completes quiz + purchases any tier = exit flow

  Subject line: You left something unfinished
  Subject line B: Your defense score is waiting
  Subject line C: 60 seconds away from knowing where you stand
  Preview text: 7 questions. No email required. But you already knew that, you were almost done.
, >

<h1 style="color: #F59E0B; font-size: 22px; margin: 0 0 16px;">You Were Almost There.</h1>

<p>You started the Defense Milestone Score. You didn't finish.</p>

<p>Maybe your phone rang. Maybe you weren't sure how to answer one of the questions. Maybe you just weren't ready to see the number.</p>

<p>Here's what I can tell you: <strong style="color: white;">not knowing doesn't make the problem go away.</strong></p>

<p>The Defense Milestone Score takes 60 seconds. It tells you, on a 0 to 100 scale, whether your attorney is hitting the benchmarks that matter. No email required. No sign-up. No strings.</p>

<p>It won't tell you what to do. That's not what we do. But it will tell you <strong style="color: white;">where to look</strong>, and sometimes that's the difference between a case that gets attention and one that drifts.</p>

<a href="https://imnotanattorney.com/score" style="display: inline-block; margin: 24px 0; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 15px;">Finish My Score, 60 Seconds</a>

<p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; font-size: 13px;">
  <strong style="color: white;">P.S.</strong> Over 400 defendants have taken the score this month. The average score is 38/100. That's not a comfortable number. But the defendants who see it, they start asking different questions. <a href="https://imnotanattorney.com/score" style="color: #F59E0B; text-decoration: underline;">See where you stand</a>.
</p>

## CTA Button
**Text:** Finish My Score, 60 Seconds
**URL:** https://imnotanattorney.com/score

## Segmentation Notes
- Send to all subscribers who visited /score and either did not complete or completed but did not purchase
- Suppress if subscriber has already purchased any tier
- If subscriber completed the quiz but didn't purchase, they receive the Score Re-engagement flow instead (no overlap)

## Performance Metrics to Track
- Open rate target: 35-45% (high-intent audience, recent activity)
- Click rate target: 12-18%
- Quiz completion rate from email: 25%+
