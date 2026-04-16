# Flow: Win-Back (60-Day Cold), Email 4 of 5

**Trigger:** Email 3 sent, subscriber still not re-engaged
**Timing:** Day 14 (14 days after Email 1)
**Goal:** Direct ask, "Do you want to keep hearing from us?" with clear re-engagement or unsubscribe path

## Subject Line Options (3 versions for A/B testing)
1. Do you want us to stop emailing you?
2. Quick question, should we keep going?
3. We need to hear from you (one click)

## Preview Text
One click to stay. One click to go. No hard feelings either way.

## Email Body

<!, 
  Flow: Win-Back (60-Day Cold Subscribers)
  Position: Email 4 of 5
  Trigger: Email 3 sent, subscriber still not re-engaged
  Delay: Day 14 (14 days after Email 1)
  Segment: 60-day cold subscribers who didn't open Emails 1-3
  Exit condition: Opens this email or clicks re-engage = re-engaged, exit flow
  Note: If no open/click, proceed to Email 5 (breakup)

  Subject line: Do you want us to stop emailing you?
  Subject line B: Quick question, should we keep going?
  Subject line C: We need to hear from you (one click)
  Preview text: One click to stay. One click to go. No hard feelings either way.
, >

<h1 style="color: #F59E0B; font-size: 22px; margin: 0 0 16px;">Honest Question.</h1>

<p>We've sent you a few emails over the past two weeks. You haven't opened any of them.</p>

<p>That's fine. But we don't want to be noise in your inbox. We have one rule about email: if it's not useful, we don't send it.</p>

<p>So here's the deal, <strong style="color: white;">tell us what you want</strong>:</p>

<div style="margin: 24px 0;">
  <a href="https://imnotanattorney.com/api/resubscribe?email={{EMAIL_BASE64}}" style="display: inline-block; margin: 0 0 12px; padding: 14px 28px; background: #F59E0B; color: black; font-weight: bold; text-decoration: none; border-radius: 8px; font-size: 15px;">Keep Sending, My Case Is Still Active</a>
</div>

<p style="font-size: 14px; color: #A1A1AA;">If you click the button above, you'll stay on our list and keep getting free guides, case research tips, and the questions that hold attorneys accountable.</p>

<div style="margin: 24px 0; padding: 16px; border: 1px solid #27272A; border-radius: 8px; background: #1C1917;">
  <p style="margin: 0 0 8px; font-size: 14px; color: white;">If you DON'T click:</p>
  <p style="margin: 0; font-size: 13px; color: #D4D4D8;">We'll send one more email in a week. If you don't open that one either, we'll remove you from our list permanently. No guilt trip. No "last chance" games. Just a clean exit.</p>
</div>

<p>Either way, if your case is resolved, we're glad. If it's still going and you just don't want emails, that's your call. But if you're going quiet because you've given up hope that anything will change...</p>

<p><strong style="color: white;">That's the one we can help with.</strong></p>

<p style="margin-top: 24px; padding: 16px; border-left: 3px solid #F59E0B; background: #1C1917; font-size: 13px;">
  <strong style="color: white;">P.S.</strong> Even if you unsubscribe, the free resources on our site aren't going anywhere. <a href="https://imnotanattorney.com/blog/10-questions-every-defendant-should-ask" style="color: #F59E0B; text-decoration: underline;">10 Questions Every Defendant Should Ask</a>, <a href="https://imnotanattorney.com/blog/how-to-read-your-discovery" style="color: #F59E0B; text-decoration: underline;">How to Read Your Discovery</a>, <a href="https://imnotanattorney.com/score" style="color: #F59E0B; text-decoration: underline;">Defense Milestone Score</a>, all free, no login, no email required. Bookmark them.
</p>

## CTA Button
**Text:** Keep Sending, My Case Is Still Active
**URL:** https://imnotanattorney.com/api/resubscribe?email={{EMAIL_BASE64}}

## Segmentation Notes
- Variables: `{{EMAIL_BASE64}}`, subscriber's email, base64 encoded for the resubscribe endpoint
- If subscriber clicks "Keep Sending," mark as re-engaged and exit the win-back flow
- If no open or click within 7 days, proceed to Email 5 (breakup)
- The unsubscribe link in the CAN-SPAM footer (added by sendEmail()) serves as the "stop" option

## Performance Metrics to Track
- Open rate target: 6-12% (deeply cold, but "stop emailing?" subject lines tend to outperform)
- Re-engagement click rate: 3-5%
- Unsubscribe rate: 5-10% (expected and healthy, cleaning the list)
