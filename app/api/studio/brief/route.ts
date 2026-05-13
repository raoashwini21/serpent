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

  const serpContext = hasGsc
    ? `GSC keyword opportunities (ranked by impressions):\n${gscSummary}`
    : `No GSC data available. Use SERP/PAA signals instead:
SERP H2s from competitors: ${research.serpH2s.join(', ')}
PAA questions: ${research.paaQuestions.join(', ')}`;

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
2. For each H2: show what it currently is (or null if new) and what it should become, with a short reason.
   - Rewrite H2s to match high-impression GSC queries exactly where possible
   - Use question format for AEO/featured snippet eligibility
   - Add new H2s for PAA questions that have no current coverage
   - Flag H2s that match no keyword signal as "low priority"
3. Set target keywords from GSC opportunities or SERP signals.
4. Write a SalesRobot positioning angle based on the gaps found.

CURRENT YEAR: 2025. Always use 2025 in titles. Never use 2024 or any other year.

H1 TITLE RULES — pick the right pattern for the blog type:
- Review: "[Tool] Review 2025: Is It Worth It?" or "[Tool] Review 2025: Tested & Rated"
- Comparison: "[Tool A] vs [Tool B] 2025: Which Is Better?"
- Alternatives: "Best [Tool] Alternatives in 2025 (Tested)"
- Listicle: "[N] Best [Category] Tools in 2025"
- How-to: "How to [Goal] in 2025: Step-by-Step"
- Rules: keyword first, year always 2025, under 70 chars
- Never use: "Ultimate", "Complete", "Comprehensive", "Everything You Need"

META TITLE: under 60 chars, must include keyword and 2025.

Return ONLY this JSON:
{
  "h1": "title following rules above — keyword first, 2025, under 70 chars",
  "metaTitle": "meta title under 60 chars with 2025",
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
  "topPainPoints": ["pain point 1", "pain point 2", "pain point 3"]
}

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
