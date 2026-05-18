import { NextRequest, NextResponse } from 'next/server';
import type { ResearchData, GscRow } from '@/app/studio/types';

export const maxDuration = 60;

function buildGscSummary(rows: GscRow[]): string {
  if (!rows.length) return 'No GSC data.';
  return rows
    .filter(r => r.position >= 5 && r.position <= 25 && r.impressions >= 100)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8)
    .map(r => `"${r.query}" pos ${r.position.toFixed(1)}, ${r.impressions} impressions`)
    .join('\n');
}

async function claudeCall(prompt: string, system: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.content.filter((b: {type:string}) => b.type === 'text').map((b: {text:string}) => b.text).join('');
}

function extractJSON(raw: string): unknown {
  const trimmed = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const start = Math.min(trimmed.indexOf('{') === -1 ? Infinity : trimmed.indexOf('{'), trimmed.indexOf('[') === -1 ? Infinity : trimmed.indexOf('['));
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start !== Infinity && end !== -1) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('No JSON found');
}

export async function POST(req: NextRequest) {
  const { toolName, blogType, blogTitle, research, gscRows, hasGsc, existingH2s }:
    { toolName: string; blogType: string; blogTitle: string; research: ResearchData; gscRows: GscRow[]; hasGsc: boolean; existingH2s: string[] }
    = await req.json();

  const system = 'You are a data extraction API. Return only valid JSON. No prose. No explanation.';

  // ── Call 1: Extract confirmed facts from research ──────────────────────
  const factsRaw = await claudeCall(`
Extract confirmed facts about "${toolName}" from this research data.

Pricing data: ${JSON.stringify(research.pricing ?? [])}
Feature data: ${JSON.stringify(research.features ?? [])}
Review signals: ${JSON.stringify([...(research.reviewSignals ?? []), ...(research.redditSignals ?? []), ...(research.youtubeSignals ?? [])])}
Ratings: ${JSON.stringify(research.ratings ?? {})}

Return ONLY:
{
  "confirmedPricing": "plan names and prices as a short string e.g. Free, Basic $27/mo, Pro $49/mo",
  "confirmedFeatures": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "topPainPoints": ["pain point 1", "pain point 2", "pain point 3"],
  "salesRobotAngle": "one sentence — what specific gap does SalesRobot fill that ${toolName} doesn't",
  "ratings": "e.g. G2: 4.2/5 or Not available"
}
Base everything strictly on the research data provided. Valid JSON only.`, system, 600);

  let facts: Record<string, unknown>;
  try {
    facts = extractJSON(factsRaw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Facts extraction failed', raw: factsRaw }, { status: 500 });
  }

  // ── Call 2: Generate structure (H1, H2s, keywords, FAQ) ───────────────
  // Only use PAA questions that are actually about the tool, not generic phrases
  const paaQuestions = (research.paaQuestions ?? [])
    .filter(q => q.includes('?') && q.toLowerCase().includes(toolName.toLowerCase()))
    .slice(0, 5).join('\n');
  const serpH2s = (research.serpH2s ?? []).filter(h => /^(what|how|is|does|can|why|which|do|should)/i.test(h.trim())).slice(0, 4).join('\n');
  const gscContext = hasGsc ? `GSC opportunities:\n${buildGscSummary(gscRows)}` : `PAA questions:\n${paaQuestions || 'none'}\nCompetitor H2s:\n${serpH2s || 'none'}`;
  const isUpdate = existingH2s.length > 0;
  const existingH2Block = isUpdate ? `Existing H2s:\n${existingH2s.map((h,i) => `${i+1}. ${h}`).join('\n')}` : 'New blog.';

  const structureRaw = await claudeCall(`
Generate the structure brief for a "${blogType}" blog about "${toolName}".
Working title: "${blogTitle}"

CONFIRMED FACTS (use these exactly):
Pricing: ${facts.confirmedPricing}
Features: ${(facts.confirmedFeatures as string[])?.join(', ')}
Pain points: ${(facts.topPainPoints as string[])?.join(', ')}
SalesRobot angle: ${facts.salesRobotAngle}

${gscContext}
${existingH2Block}

${isUpdate ? `UPDATE MODE H2 RULES:
- Only reformat existing H2s to question style if they are generic (e.g. "Features" → "What Does ${toolName} Do?")
- NEVER replace a pricing or features H2 with a PAA question
- PAA questions become NEW additional H2s, not replacements
- NEVER mark Conclusion/FAQ/How Can SalesRobot Help? as isNew:true
- isNew:true only for genuinely missing topic sections` :
`NEW BLOG H2 RULES for ${blogType}:
Review/Comparison: What Is, What Does, How Much, Is It Worth It, [PAA questions], How Can SalesRobot Help, FAQ, Conclusion
Alternatives/Listicle: Why Switch, Best Alternatives (SalesRobot #1 in list), [PAA questions], FAQ, Conclusion`}

ABSOLUTE H2 RULES:
- Never put year in H2. Every H2 starts with What/How/Is/Does/Can/Why/Which/Do/Should. Under 60 chars.
- Copy PAA questions exactly as-is.

Return ONLY:
{
  "h1": "${toolName} Review 2026: [short hook under 40 chars] — MUST start with ${toolName}",
  "metaTitle": "under 60 chars with 2026",
  "metaDescription": "140-160 chars with primary keyword",
  "h2Changes": [{"old": "existing or null", "next": "recommended H2", "reason": "why", "isNew": false}],
  "targetKeywords": ["primary", "secondary 1", "secondary 2"],
  "faqQuestions": ["question about ${toolName} only", "question 2", "question 3", "question 4"]

CRITICAL: faqQuestions must be about ${toolName} specifically. Never generate questions about generic phrases or words from the blog title.
}
Valid JSON only.`, system, 1200);

  let structure: Record<string, unknown>;
  try {
    structure = extractJSON(structureRaw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Structure generation failed', raw: structureRaw }, { status: 500 });
  }

  // Merge facts + structure into final brief
  const brief = { ...structure, ...facts };
  return NextResponse.json({ brief });
}
