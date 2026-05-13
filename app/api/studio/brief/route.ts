import { NextRequest, NextResponse } from 'next/server';
import type { ResearchData, GscRow } from '@/app/studio/types';

export const maxDuration = 60;

function buildGscSummary(rows: GscRow[]): string {
  if (!rows.length) return 'No GSC data — using SERP signals only.';
  const opportunities = rows
    .filter(r => r.position >= 5 && r.position <= 25 && r.impressions >= 100)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);
  return opportunities
    .map(r => `"${r.query}" — pos ${r.position.toFixed(1)}, ${r.impressions} impressions, ${(r.ctr * 100).toFixed(1)}% CTR`)
    .join('\n');
}

export async function POST(req: NextRequest) {
  const {
    toolName,
    blogType,
    blogTitle,
    research,
    gscRows,
    hasGsc,
    existingH2s,
  }: {
    toolName: string;
    blogType: string;
    blogTitle: string;
    research: ResearchData;
    gscRows: GscRow[];
    hasGsc: boolean;
    existingH2s: string[];
  } = await req.json();

  const gscSummary = buildGscSummary(gscRows);

  // Pre-build H2 candidates from PAA — these are real search questions, use them directly
  const paaH2s = (research.paaQuestions ?? [])
    .filter(q => q.includes('?'))
    .slice(0, 4)
    .join('\n');

  // Filter SERP H2s to question-format only — ignore generic "Tool Features 2025" style
  const serpQuestionH2s = (research.serpH2s ?? [])
    .filter(h => /^(what|how|is|does|can|why|when|which|do)/i.test(h.trim()))
    .slice(0, 4)
    .join('\n');

  const serpContext = hasGsc
    ? `GSC keyword opportunities (ranked by impressions):\n${gscSummary}\n\nPAA questions found:\n${paaH2s || 'none'}`
    : `PAA questions (use these directly as H2s where relevant):\n${paaH2s || 'none'}\n\nCompetitor question-format H2s:\n${serpQuestionH2s || 'none'}`;

  const existingH2Block = existingH2s.length
    ? `Existing H2s in the blog:\n${existingH2s.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : 'This is a new blog — no existing H2s.';

  const prompt = `You are a senior SEO/AEO strategist for SalesRobot's blog team.

Tool being written about: ${toolName}
Blog type: ${blogType}
Working title: ${blogTitle}

RESEARCH FINDINGS:
Pricing changes: ${JSON.stringify(research.pricing)}
Feature changes: ${JSON.stringify(research.features)}
Ratings: ${JSON.stringify(research.ratings)}
Reddit signals: ${JSON.stringify(research.redditSignals ?? [])}
YouTube signals: ${JSON.stringify(research.youtubeSignals ?? [])}
G2/Capterra signals: ${JSON.stringify(research.reviewSignals ?? [])}

${serpContext}

${existingH2Block}

TASK:
1. Produce a final research brief for this blog.
2. Generate h2Changes — one entry per H2 the blog should have.
   For UPDATE mode (existingH2s provided): show old vs new with reason.
   For NEW blog mode (no existingH2s): old=null, isNew=true for all.

   REQUIRED H2s — use EXACTLY these formats, replacing [Tool] with the actual tool name:
   a. "What Is [Tool] and Who Is It For?"
   b. "What Does [Tool] Actually Do?" — OR use a PAA question about features if one exists
   c. "How Much Does [Tool] Cost?" — never add year here
   d. "Is [Tool] Worth It?" — OR use a PAA verdict question if one exists
   e. "How Can SalesRobot Help?" — always this exact text
   f. "Frequently Asked Questions" — always this exact text
   g. "Conclusion" — always this exact text

   ADDITIONAL H2s: if PAA questions are provided above, insert them before section e.
   Copy PAA questions exactly as-is — do not rewrite them.

   ABSOLUTE H2 RULES:
   - Never put a year in any H2
   - Never write "[Tool] Features", "[Tool] Pricing", "[Tool] Review" as an H2 — always question format
   - Every H2 must start with: What, How, Is, Does, Can, Why, Which, Do, Should
   - Under 60 chars each

3. Set target keywords from GSC or SERP signals.
4. Write a SalesRobot positioning angle based on the gaps found.

CURRENT YEAR: 2026. Use 2026 in the H1 title only. Never put year in H2 or H3 headings.

H1 TITLE RULES — pick the right pattern for the blog type:
- Review: "[Tool] Review 2026: Is It Worth It?" or "[Tool] Review 2026: Tested & Rated"
- Comparison: "[Tool A] vs [Tool B] 2026: Which Is Better?"
- Alternatives: "Best [Tool] Alternatives in 2026 (Tested)"
- Listicle: "[N] Best [Category] Tools in 2026"
- How-to: "How to [Goal] in 2026: Step-by-Step"
- Rules: keyword first, year always 2026, under 70 chars
- Never use: "Ultimate", "Complete", "Comprehensive", "Everything You Need"

META TITLE: under 60 chars, must include keyword and 2026.

Return ONLY this JSON:
{
  "h1": "title following rules above — keyword first, 2026, under 70 chars",
  "metaTitle": "meta title under 60 chars with 2026",
  "metaDescription": "meta description 140-160 chars with primary keyword",
  "h2Changes": [
    {
      "old": "existing H2 text or null if new",
      "next": "recommended H2",
      "reason": "one sentence — why this change, which keyword it targets",
      "isNew": false
    }
  ],
  "targetKeywords": ["primary keyword", "secondary 1", "secondary 2"],
  "salesRobotAngle": "one sentence — what gap in ${toolName} does SalesRobot fill based on the research",
  "confirmedPricing": "e.g. Starter $59/mo, Pro $99/mo — confirmed from research",
  "confirmedFeatures": ["feature 1", "feature 2", "feature 3"],
  "topPainPoints": ["pain point 1", "pain point 2", "pain point 3"],
  "faqQuestions": ["actual PAA or search question 1", "question 2", "question 3", "question 4", "question 5"]
}

faqQuestions rules:
- Use REAL questions from PAA data and SERP signals provided above
- Format as natural questions people actually search: "How much does X cost?", "Is X worth it?", "Does X have a free trial?"
- Include comparison questions if found: "Is X better than Y?"
- 4-6 questions maximum
- If no PAA data available, derive from top pain points as genuine questions

Return only valid JSON. No markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const data = await res.json();
  const text = data.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');

  try {
    const trimmed = text.replace(/```json|```/g, '').trim();
    let jsonStr = trimmed;
    // Extract JSON block if Claude added prose around it
    const start = Math.min(
      trimmed.indexOf('{') === -1 ? Infinity : trimmed.indexOf('{'),
      trimmed.indexOf('[') === -1 ? Infinity : trimmed.indexOf('['),
    );
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start !== Infinity && end !== -1) jsonStr = trimmed.slice(start, end + 1);
    const brief = JSON.parse(jsonStr);
    return NextResponse.json({ brief });
  } catch {
    return NextResponse.json({ error: 'Failed to parse brief JSON', raw: text }, { status: 500 });
  }
}
