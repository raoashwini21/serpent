import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

async function claudeSearch(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'interleaved-thinking-2025-05-14',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await res.json();
  return data.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n');
}

function extractJSON(raw: string): unknown {
  // Try direct parse first
  const trimmed = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  // Find first { or [ and last } or ]
  const start = Math.min(
    trimmed.indexOf('{') === -1 ? Infinity : trimmed.indexOf('{'),
    trimmed.indexOf('[') === -1 ? Infinity : trimmed.indexOf('['),
  );
  const endBrace = trimmed.lastIndexOf('}');
  const endBracket = trimmed.lastIndexOf(']');
  const end = Math.max(endBrace, endBracket);
  if (start === Infinity || end === -1) throw new Error('No JSON found in response');
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  const { toolName, blogType, phase } = await req.json();

  if (!toolName || !phase) {
    return NextResponse.json({ error: 'toolName and phase required' }, { status: 400 });
  }

  const system = `You are a data extraction API. You ONLY output raw JSON. 
No prose. No explanation. No "Based on". No preamble. No postamble.
Your entire response must be a single valid JSON object or array, nothing else.
If you cannot find data, return empty arrays. Never return text outside the JSON.`;

  try {
    if (phase === 1) {
      const raw = await claudeSearch(system, `
Research "${toolName}" right now using web search. Search these in order:
1. "${toolName} pricing 2025" — get current plan names and prices
2. "${toolName} features" or their official features page
3. "${toolName} site:g2.com" — get G2 rating and top 3 pros/cons from reviews
4. "${toolName} site:capterra.com" — get Capterra rating and top pros/cons

Return ONLY this JSON shape:
{
  "pricing": [
    { "type": "changed"|"added"|"removed", "text": "description of change or fact" }
  ],
  "features": [
    { "type": "added"|"removed"|"signal", "text": "feature name and status" }
  ],
  "ratings": {
    "g2": "4.2/5 (312 reviews)" or null,
    "capterra": "4.1/5 (88 reviews)" or null
  }
}
Return only valid JSON. No explanation.`);

      const json = extractJSON(raw);
      return NextResponse.json({ phase: 1, data: json });
    }

    if (phase === 2) {
      const raw = await claudeSearch(system, `
Search for what is currently ranking on page 1 of Google for "${toolName}" related queries.
Also find People Also Ask questions for "${toolName} review" and "${toolName} alternative".

Search:
1. "${toolName} review 2025" — note top 3 ranking page H2 structures
2. "${toolName} alternative" — note PAA questions shown
3. "${toolName} ${blogType}" — note what headings competitors use

Return ONLY this JSON shape:
{
  "serpH2s": ["H2 from competitor 1", "H2 from competitor 2", ...],
  "paaQuestions": ["PAA question 1", "PAA question 2", ...]
}
Max 8 serpH2s, max 6 paaQuestions. Return only valid JSON.`);

      const json = extractJSON(raw);
      return NextResponse.json({ phase: 2, data: json });
    }

    if (phase === 3) {
      const raw = await claudeSearch(system, `
Find real user opinions about "${toolName}" on Reddit and review sites.

Search:
1. "${toolName} site:reddit.com problems OR complaints OR alternatives"
2. "${toolName} site:reddit.com review 2024 OR 2025"

Extract honest signals — what do real users complain about, what do they praise?

Return ONLY this JSON shape:
{
  "redditSignals": [
    { "type": "signal"|"added"|"removed", "text": "pain point or praise in plain language, cite thread count if multiple" }
  ]
}
Max 6 signals. Prioritise complaints and switching reasons. Return only valid JSON.`);

      const json = extractJSON(raw);
      return NextResponse.json({ phase: 3, data: json });
    }

    return NextResponse.json({ error: 'invalid phase' }, { status: 400 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Research failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
