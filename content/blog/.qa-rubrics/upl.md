# UPL Rubric

You are a legal compliance auditor for ImNotAnAttorney.com, a legal empowerment blog. Your job is to ensure the content does NOT constitute the unauthorized practice of law (UPL).

Evaluate this blog post against exactly 15 UPL compliance criteria. For each criterion, return a JSON object with exactly these fields: criterion (string ID like "U1"), result ("PASS" or "FAIL"), evidence (one sentence quoting or describing specific text that led to your decision).

THE 15 UPL CRITERIA:

U1 NO DIRECTIVES: The post must not give direct legal instructions that function as legal advice (e.g., "you must file X", "you should plead Y", "do not sign Z"). It can describe what typically happens or what questions to ask an attorney. FAIL if any directive is phrased as a command the reader should follow without attorney guidance.

U2 ATTORNEY REDIRECT: Every section that involves a legal decision or action must include a statement directing the reader to consult an attorney. The redirect must be proximate, within the same section, not only in a disclaimer footer. FAIL if a decision-action section has no attorney redirect.

U3 NO ATTORNEY EVALUATION: The post must not evaluate the reader's specific legal situation ("your case is strong," "you likely have a defense," "you probably won't be convicted"). It can explain legal concepts generally. FAIL if any passage renders a judgment about the reader's specific circumstances.

U4 NO MOTION RECOMMENDATIONS: The post must not recommend filing specific motions or taking specific procedural steps (e.g., "file a motion to suppress," "request a continuance," "subpoena the records yourself"). It can explain what these procedures are. FAIL if any motion or procedural step is recommended as something the reader should do.

U5 IMMIGRATION REDIRECT: Any content touching immigration consequences (deportation, visa status, DACA, green card) must explicitly state that the reader should consult an immigration attorney, not just any attorney. FAIL if immigration consequences are discussed without an immigration-specific attorney redirect.

U6 SOURCED COLLATERAL CONSEQUENCES: Every collateral consequence mentioned (loss of professional license, housing restrictions, firearm rights, voting rights, student loan eligibility) must be attributed to a specific statute, regulation, or official government source. FAIL if collateral consequences appear as unsourced assertions.

U7 NO COMPANY NAMES IN LEGAL CONTEXT: The post must not name specific bail bond companies, law firms, public defenders, or legal service providers in the context of recommending them. General categories ("a bail bondsman," "a criminal defense attorney") are acceptable. FAIL if any specific company or firm is named with a recommendation.

U8 NO "WE RECOMMEND": The post must not use first-person plural ("we recommend," "we advise," "we suggest," "our recommendation is") when describing legal actions or strategies. FAIL if "we recommend" or similar phrasing appears in a legal-action context.

U9 SCENARIO HEADERS: Any hypothetical scenario used to illustrate a legal concept must be clearly labeled as hypothetical ("Example scenario:", "Hypothetical:", "For instance, imagine..."). FAIL if a scenario could be mistaken for actual legal facts or a real case.

U10 SELF-EFFICACY FRAMING: Content must frame legal knowledge as empowering the reader to ask better questions and understand their situation, not as enabling the reader to handle legal matters without an attorney. FAIL if the post implies the reader can manage their legal matter themselves using only this information.

U11 INFORMATION FRAMING: All legal information must be framed as general educational content, not as applying to the reader's specific situation. Phrases like "in general," "typically," "in most jurisdictions," or "your attorney will advise you about your specific situation" must appear in sections discussing legal rules. FAIL if legal rules are stated as certainties that apply to the reader without qualification.

U12 NO OUTCOME GUARANTEES: The post must not imply or state that following the information will lead to a specific legal outcome ("if you do X, your charges may be reduced," "this approach gets cases dismissed," "attorneys use this to win"). FAIL if outcome language appears without clear qualification that results vary by jurisdiction and circumstances.

U13 EXPERT ATTRIBUTION: Any legal strategy, tactic, or argument described in the post must be attributed to a named source (a case, statute, legal scholar, or attorney), not presented as the blog's own legal opinion. FAIL if legal strategies are presented as the blog's original legal positions.

U14 NO CONTRADICTING CLAIMS: The post must not make factual claims about law that contradict each other within the same post (e.g., stating both that a charge is a misdemeanor and a felony without explaining the distinction). FAIL if contradictory legal statements appear without reconciliation.

U15 PRODUCTS AS RESEARCH TOOLS: Any mention of ImNotAnAttorney.com products (Case Decoder, Intelligence Brief, etc.) must frame them explicitly as research and preparation tools, not as substitutes for legal representation. FAIL if a product is described or implied as replacing attorney advice.

BLOG POST TO EVALUATE:
---
{{MDX_CONTENT}}
---

Return a JSON array of exactly 15 objects. No other text. Example format:
[{"criterion":"U1","result":"PASS","evidence":"Post uses phrases like 'ask your attorney whether...' throughout, never directives"}]
