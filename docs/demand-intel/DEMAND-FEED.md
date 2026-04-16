# Demand Intelligence Feed, 2026-04-03

**Data source:** Supabase demand tables (demand_scores, content_gaps, emerging_topics, discovered_subreddits)
**Window:** Latest 30-day scoring period ending 2026-04-03

---

## Top Gap

**Theft**, gap_score: 10.00 | demand: 7.71 | competition: 7.90 | quadrant: GOLD_MINE

- 21 posts in 30d, rising +163% vs prior period
- Zero blog coverage. Zero content_gaps addressed.
- Highest avg_score per post (236.76) of any charge type, people engage deeply with theft content.

**Why Theft over DUI:** DUI has higher volume (457 posts) but Theft has a higher per-post engagement ceiling and identical gap_score. DUI content is already queued (status: "queued" / "in-progress"). Theft has zero pipeline activity.

---

## Gold Mine Topics (demand >= 6, competition >= 6)

| Charge Type | Demand | Competition | Opportunity | Posts (30d) | Trend |
|---|---|---|---|---|---|
| **DUI / DWI** | 7.37 | 7.67 | 7.52 | 457 | +731% rising |
| **Theft** | 7.71 | 7.90 | 7.80 | 21 | +163% rising |
| **Domestic Violence** | 6.08 |, |, | 64 | +482% rising |

DUI is the volume king. Theft is the engagement king. Domestic Violence just crossed the 6.0 demand threshold today, watch this one.

**Blog coverage for all Gold Mine topics: zero.** Every Gold Mine topic has `has_blog_post: false`.

---

## Emerging Topics

From `emerging_topics` table (detected via clustering, last 7 days):

| Topic | Posts | Avg Engagement | Avg Urgency | Representative Post |
|---|---|---|---|---|
| **"right now"** (housing urgency) | 6 | 153.5 | 1.83 | "How late can I pay my rent in CA" |
| **"story short"** (trespass/eviction) | 4 | 171.0 | 1.75 | "Nfh showed up on property after being evicted" |
| **"full time"** (custody) | 3 | 576.7 | 0.00 | "How do I file for custody of my sister?" |
| **"figure out"** (online threats) | 9 | 27.8 | 0.67 | "Someone created a tiktok account telling people to rape me" |
| **"speeding ticket"** | 3 | 2.3 | 0.67 | "PA speeding ticket advice" |
| **"health issues"** (ADA/medical) | 4 | 1.75 | 0.50 | "Is a Medical/ADA Claim possible?" |

**Signal worth tracking:** "full time" (custody) has 576.7 avg engagement, off the charts. Not criminal defense, but indicates demand for family court empowerment content. "right now" + "story short" both index high urgency (>1.5), people in active crisis.

---

## Declining Topics

| Charge Type | Demand | Trend (30d) | Notes |
|---|---|---|---|
| **White Collar / Fraud** | 5.30 | -28.6% falling | Sustained decline across 3 consecutive scoring windows |
| **Drug Trafficking** | 2.61 | -50.0% falling | Single data point (Apr 1); recovered to 4.84 by Apr 3, likely anomaly |

White Collar is the only confirmed declining category.

---

## Discovered Subreddits Pending Review

**None.** The `discovered_subreddits` table is empty. The demand scoring pipeline discovers topics but is not yet identifying new subreddits to monitor.

---

## Key Observations

1. **Zero blog coverage across all Gold Mine topics.** DUI has one content_gap row with status "queued" and one "in-progress", but `has_blog_post` is still false everywhere. The pipeline is moving but hasn't shipped.

2. **DUI demand is accelerating.** 7d: +197% (182 posts). 30d: +731% (457 posts). 90d: +5,130% (523 posts). Structural growth in Reddit legal discussion volume.

3. **Theft is the silent opportunity.** Fewer posts but higher per-post engagement (avg_score 237 vs DUI's 77). GOLD_MINE quadrant. Zero pipeline activity.

4. **Domestic Violence just crossed the Gold Mine threshold.** demand_score hit 6.08 on 2026-04-03. 64 posts in 30d, rising +482%. If it sustains above 6.0 for another window, it's the third confirmed Gold Mine.

5. **Pain point dimensions show zero demand signal.** All pain_point slugs ("attorney-not-returning-calls", "should-you-take-the-plea-deal", etc.) have demand_score: 0.00 and post_count: 0. Either the signal fetcher isn't tagging these, or Reddit discussions don't cluster around our pain point taxonomy.
