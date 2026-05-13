import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

async function claudeSearch(userPrompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a data extraction API. Output raw JSON only.
No prose. No explanation. No preamble. No "Based on".
If you find no data, return empty arrays. Never return text outside the JSON.`,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`);
  const data = await res.json();
  return data.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n');
}

function extractJSON(raw: string): unknown {
  const trimmed = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const start = Math.min(
    trimmed.indexOf('{') === -1 ? Infinity : trimmed.indexOf('{'),
    trimmed.indexOf('[') === -1 ? Infinity : trimmed.indexOf('['),
  );
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start === Infinity || end === -1) throw new Error('No JSON found');
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function POST(req: NextRequest) {
  const { toolName, blogType, phase } = await req.json();
  if (!toolName || !phase) {
    return NextResponse.json({ error: 'toolName and phase required' }, { status: 400 });
  }

  try {

    // Phase 1a — official site: current pricing and features only
    if (phase === '1a') {
      const raw = await claudeSearch(
        `Search "${toolName} pricing 2025" and "${toolName} features".
Get current plan names, prices, and key features from their official site.
Return ONLY:
{ "pricing": [{ "type": "changed"|"added"|"removed"|"signal", "text": "fact" }],
  "features": [{ "type": "added"|"removed"|"signal", "text": "feature name and status" }] }
Max 5 pricing items, max 6 features. Valid JSON only.`
      );
      return NextResponse.json({ phase: '1a', data: extractJSON(raw) });
    }

    // Phase 1b — G2 and Capterra ratings and reviews
    if (phase === '1b') {
      const raw = await claudeSearch(
        `Search "${toolName} site:g2.com reviews" and "${toolName} site:capterra.com reviews".
Get the rating score and top 3 pros and cons from each site.
Return ONLY:
{ "ratings": { "g2": "4.2/5 (312 reviews)" or null, "capterra": "4.1/5 (88 reviews)" or null },
  "reviewSignals": [{ "type": "signal", "text": "pro or con from reviews, note source" }] }
Max 6 reviewSignals. Valid JSON only.`
      );
      return NextResponse.json({ phase: '1b', data: extractJSON(raw) });
    }

    // Phase 2 — SERP H2s and PAA questions
    if (phase === 2) {
      const raw = await claudeSearch(
        `Search "${toolName} review 2025" and "${toolName} alternative".
Note: top ranking page headings (H2s) and People Also Ask questions shown.
Return ONLY:
{ "serpH2s": ["heading 1", "heading 2", ...],
  "paaQuestions": ["question 1", "question 2", ...] }
Max 8 serpH2s, max 6 paaQuestions. Valid JSON only.`
      );
      return NextResponse.json({ phase: 2, data: extractJSON(raw) });
    }

    // Phase 3a — Reddit signals only
    if (phase === '3a') {
      const raw = await claudeSearch(
        `Search "${toolName} site:reddit.com" focusing on complaints, problems, and switching reasons.
What do real users say is wrong with it? What do they praise?
Return ONLY:
{ "redditSignals": [{ "type": "signal", "text": "pain point or praise, cite thread count if seen in multiple threads" }] }
Max 5 signals. Prioritise complaints and switching reasons. Valid JSON only.`
      );
      return NextResponse.json({ phase: '3a', data: extractJSON(raw) });
    }

    // Phase 3b — YouTube signals only
    if (phase === '3b') {
      const raw = await claudeSearch(
        `Search "${toolName} review site:youtube.com" and "${toolName} tutorial site:youtube.com".
Find video titles, key points from descriptions, view counts if visible.
If no relevant videos found, return empty array.
Return ONLY:
{ "youtubeSignals": [{ "type": "signal", "text": "key verdict or theme from the video, include channel or view count if available" }] }
Max 4 signals. If nothing found return { "youtubeSignals": [] }. Valid JSON only.`
      );
      return NextResponse.json({ phase: '3b', data: extractJSON(raw) });
    }

    return NextResponse.json({ error: 'invalid phase' }, { status: 400 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Research failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
