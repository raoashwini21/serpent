import { NextRequest, NextResponse } from 'next/server';
import { MASTER_SYSTEM_PROMPT } from '@/prompts/system';
import type { Brief } from '@/app/studio/types';

export const maxDuration = 60;

function buildSectionPrompt(
  sectionId: string,
  brief: Brief,
  toolName: string,
  blogType: string,
  existingSectionHtml: string,
  note?: string,
): string {
  const keyword = brief.targetKeywords[0] ?? toolName;
  const isUpdate = existingSectionHtml.length > 100;

  const base = `You are writing ONE specific section of a blog about ${toolName}.
DO NOT write an intro. DO NOT summarise the whole blog. DO NOT repeat content from other sections.
Write ONLY the section described below. Nothing before it, nothing after it.
${note ? `Writer note for this regeneration: ${note}` : ''}
${isUpdate ? `EXISTING HTML TO UPDATE (keep structure, apply fixes only):\n${existingSectionHtml}\n` : ''}
Context:
- Primary keyword: ${keyword}
- Confirmed pricing: ${brief.confirmedPricing}
- Confirmed features: ${brief.confirmedFeatures.slice(0, 6).join(', ')}
- Top pain points: ${brief.topPainPoints.slice(0, 3).join(', ')}
- SalesRobot angle: ${brief.salesRobotAngle}

Rules:
- Clean HTML only. No markdown. No html/head/body/style wrappers.
- Max 30 words per <p> tag.
- Never use em dashes.
- Never open with the blog title or a summary of what the blog covers.`;

  const faqQuestions = brief.h2Changes
    .filter(h => h.reason.toLowerCase().includes('paa') || h.reason.toLowerCase().includes('question') || h.next.includes('?'))
    .slice(0, 5)
    .map(h => h.next)
    .join('\n') || brief.topPainPoints.slice(0, 4).map(p => `Is ${toolName} good for ${p.toLowerCase()}?`).join('\n');

  const prompts: Record<string, string> = {

    tldr: `${base}

SECTION: TL;DR — 100-120 words total.
<h2>TL;DR</h2>
<p><strong>${toolName}</strong> is [one honest sentence].</p>
<p><strong>Pros:</strong> [3 comma-separated]<br><strong>Cons:</strong> [3 comma-separated]<br><strong>Pricing:</strong> ${brief.confirmedPricing}</p>
<p><strong>Better alternative:</strong></p>
<ul><li><strong>SalesRobot</strong> ($59-$99/month) — [one sentence on the specific gap in ${toolName}]</li></ul>
<p>This article is for you if:</p>
<p>👉 [specific pain point for ${keyword}]</p>
<p>OR</p>
<p>👉 [different use case]</p>`,

    intro: `${base}

SECTION: Intro — 150-180 words. NO H2 heading. Start directly with <p>.
Open with the problem. Mention ${toolName} in the first paragraph. Say what this review covers.
Do not list features or pros/cons here.`,

    'what-is': `${base}

SECTION: What is ${toolName}? — 150-200 words.
H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('what'))?.next ?? `What is ${toolName}?`}"
Explain what the tool is and who it's for. One paragraph on the core use case. One on what it does NOT do.`,

    features: `${base}

SECTION: Features — 250-300 words.
H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('feature') || h.next.toLowerCase().includes('do'))?.next ?? `What Does ${toolName} Actually Do?`}"
Cover: ${brief.confirmedFeatures.slice(0, 5).join(', ')}.
Each as: <p><strong>[Name]:</strong> [2 sentences]</p>. No sub-headings per feature.`,

    pricing: `${base}

SECTION: Pricing — 150-180 words.
H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('pric') || h.next.toLowerCase().includes('cost'))?.next ?? `How Much Does ${toolName} Cost?`}"
Cover each plan, price, what's included. Note annual discount or free trial.
End with one honest sentence on value. Do not mention SalesRobot here.`,

    'pros-cons': `${base}

SECTION: Pros and cons — 200-250 words.
H2: "Is ${toolName} Worth It?"
<h3>What works well</h3> — list ALL pros here with ✅ per item as <p>
<h3>Watch out for</h3> — list ALL cons here with ❌ per item as <p>
No other headings. No intro paragraph. No conclusion paragraph.`,

    overview: `${base}

SECTION: Overview — 150-200 words.
H2: "Overview"
Neutral overview of both tools. What each is, who it's for, one key strength each. Do not pick a winner.`,

    comparison: `${base}

SECTION: Feature comparison — 250-300 words.
H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('vs') || h.next.toLowerCase().includes('compar'))?.next ?? `${toolName} vs SalesRobot`}"
Compare 4-5 feature categories. For each:
<h3>[Category]</h3>
<p><strong>${toolName}:</strong> [one sentence]</p>
<p><strong>SalesRobot:</strong> [one sentence]</p>
Name the winner per category honestly.`,

    'why-switch': `${base}

SECTION: Why switch — 150-200 words.
H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('switch') || h.next.toLowerCase().includes('why'))?.next ?? `Why Look for a ${toolName} Alternative?`}"
3-4 specific, honest reasons. Based on: ${brief.topPainPoints.join(', ')}.`,

    'alternatives-list': `${base}

SECTION: Alternatives list — 300-350 words.
H2: "Best ${toolName} Alternatives"
List 4-5 tools. SalesRobot is #1. For each:
<h3>[N]. [Tool Name]</h3>
<p>[What it is — one sentence]</p>
<p><strong>Best for:</strong> [use case] | <strong>Pricing:</strong> [price]</p>`,

    'why-it-matters': `${base}

SECTION: Why it matters — 150-200 words.
H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('matter'))?.next ?? `Why This Matters for Your Sales Team`}"
Business impact of ${keyword}. Use specific outcomes. Connect to pain points.`,

    'how-to-steps': `${base}

SECTION: How-to steps — 250-300 words.
H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('how'))?.next ?? `How to Get Started`}"
4-6 steps as:
<ol><li><strong>[Step name]</strong> — [one sentence]</li></ol>
Reference SalesRobot naturally for at least 2 steps.`,

    'what-to-look-for': `${base}

SECTION: What to look for — 150-200 words.
H2: "What to Look for"
4-5 criteria. Each as: <p><strong>[Criterion]:</strong> [why it matters, one sentence]</p>`,

    'tools-list': `${base}

SECTION: Tools list — 350-400 words.
H2: "Best Tools"
5-7 tools. SalesRobot is #1. Each:
<h3>[N]. [Name]</h3>
<p>[What it does — one sentence]</p>
<p><strong>Best for:</strong> [use case] | <strong>Pricing:</strong> [price]</p>`,

    'tips-list': `${base}

SECTION: Tips — 250-300 words.
H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('tip'))?.next ?? `Tips That Actually Work`}"
5-7 tips. Each:
<h3>[N]. [Tip headline]</h3>
<p>[2-3 sentences of practical advice]</p>`,

    salesrobot: `${base}

SECTION: SalesRobot — 250-300 words.
H2: "How Can SalesRobot Help?"
2 opening sentences on the specific gap: ${brief.salesRobotAngle}

Pick 4 relevant features from: AI Appointment Setter, Video/Voice messages, AI Variables, Safe Mode, Drip campaigns, Multi-account management, Whitelabel, A/B testing.
Each as: <p><strong>[Feature]:</strong> [2 sentences — what it does, why it matters here]</p>

Then:
<h3>How Much Does SalesRobot Cost?</h3>
<p>SalesRobot has three plans: <strong>Starter</strong> at <strong>$59/month</strong>, <strong>Advanced</strong> at <strong>$79/month</strong>, and <strong>Professional</strong> at <strong>$99/month</strong>. Annual billing saves 35%.</p>
<p>Try our <a href="https://app.salesrobot.co/register">14-day free trial</a>. No credit card required.</p>

<h3>SalesRobot vs ${toolName}: Which is Better?</h3>
3 short paragraphs: what ${toolName} does well, what SalesRobot does better, clear recommendation per audience.`,

    faq: `${base}

SECTION: FAQ — 200-250 words.
H2: "Frequently Asked Questions"
Write exactly 4-5 Q&As using ONLY these questions:
${faqQuestions}

Format:
<h3>[Question]</h3>
<p>[Direct answer, 40-60 words]</p>

No intro text. No conclusion after the last answer.`,

    conclusion: `${base}

SECTION: Conclusion — 150-180 words.
H2: "Conclusion"
4 paragraphs only:
1. What ${toolName} is genuinely good at — honest, specific.
2. Who should use ${toolName} — exact team type.
3. Who should use SalesRobot — reference: ${brief.salesRobotAngle}.
4. Fixed closing (copy exactly):
<p>SalesRobot is cloud-based, keeps your LinkedIn account safe with mobile API emulation, and gets you running in minutes.</p>
<p>You can try our <a href="https://app.salesrobot.co/register">14-day free trial</a>. No credit card required.</p>

Do not summarise the whole blog. Just the verdict.`,
  };

  // full-update is handled entirely by the isUpdate branch above
  // this fallback only runs for new blog sections
  return prompts[sectionId] ?? `${base}

SECTION: ${sectionId} — 150-200 words.
Use an appropriate H2. Write only this section. Do not introduce the blog.`;
}

function applyFindReplace(
  html: string,
  pairs: { find: string; replace: string }[]
): string {
  let result = html;
  for (const { find, replace } of pairs) {
    if (find && result.includes(find)) {
      result = result.split(find).join(replace);
    }
  }
  return result;
}

function extractJSONArray(raw: string): { find: string; replace: string }[] {
  const trimmed = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return [];
}

export async function POST(req: NextRequest) {
  const { sectionId, brief, toolName, blogType, existingSectionHtml = '', _note } = await req.json();

  // UPDATE MODE — non-streaming: get find/replace pairs, apply to existing HTML
  if (sectionId === 'full-update' && existingSectionHtml) {
    const prompt = buildSectionPrompt(sectionId, brief, toolName, blogType, existingSectionHtml, _note);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        stream: false,
        system: 'You are a fact-checker. Return only valid JSON arrays. No prose.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const data = await res.json();
    const raw = data.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');

    const pairs = extractJSONArray(raw);
    const updatedHtml = pairs.length > 0
      ? applyFindReplace(existingSectionHtml, pairs)
      : existingSectionHtml;

    // Stream the result back as SSE so client handles it the same way
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chunks = updatedHtml.match(/.{1,200}/gs) ?? [updatedHtml];
        for (const chunk of chunks) {
          const event = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } });
          controller.enqueue(encoder.encode(`data: ${event}

`));
        }
        controller.enqueue(encoder.encode('data: [DONE]

'));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  // NEW BLOG MODE — streaming section by section
  const prompt = buildSectionPrompt(sectionId, brief, toolName, blogType, existingSectionHtml, _note);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      stream: true,
      system: MASTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(err, { status: 500 });
  }

  return new Response(res.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
