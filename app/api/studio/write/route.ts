import { NextRequest, NextResponse } from 'next/server';
import { MASTER_SYSTEM_PROMPT } from '@/prompts/system';
import type { Brief } from '@/app/studio/types';

export const maxDuration = 60;

// ── Shared context builder ─────────────────────────────────────────────────
function ctx(brief: Brief, toolName: string, note?: string): string {
  const keyword = brief.targetKeywords[0] ?? toolName;
  const features = brief.confirmedFeatures?.slice(0, 5).join(', ') || 'not available';
  const painPoints = brief.topPainPoints?.slice(0, 3).join(' | ') || 'not available';
  return `Tool: ${toolName} | Keyword: ${keyword}
Pricing: ${brief.confirmedPricing || 'check their site'}
Features: ${features}
Pain points: ${painPoints}
SalesRobot angle: ${brief.salesRobotAngle}
${note ? `Writer note: ${note}` : ''}
Output: clean HTML only. No markdown. No wrappers. Max 30 words per <p>. No em dashes.`;
}

function h2For(brief: Brief, keywords: string[], fallback: string): string {
  return brief.h2Changes?.find(h =>
    keywords.some(k => h.next.toLowerCase().includes(k))
  )?.next ?? fallback;
}

// ── Section prompt builders — one function each ───────────────────────────

function promptTldr(brief: Brief, toolName: string, note?: string): string {
  return `${ctx(brief, toolName, note)}

Write the TL;DR section. 100-120 words. Exact format:
<h2>TL;DR</h2>
<p><strong>${toolName}</strong> is [one honest sentence].</p>
<p><strong>Pros:</strong> ${brief.confirmedFeatures?.slice(0,3).join(', ') || '[3 pros]'}<br><strong>Cons:</strong> ${brief.topPainPoints?.slice(0,3).join(', ') || '[3 cons]'}<br><strong>Pricing:</strong> ${brief.confirmedPricing}</p>
<p><strong>Better alternative:</strong></p>
<ul><li><strong>SalesRobot</strong> ($59-$99/month) — ${brief.salesRobotAngle}</li></ul>
<p>This article is for you if:</p>
<p>👉 ${brief.topPainPoints?.[0] ?? '[specific pain point]'}</p>
<p>OR</p>
<p>👉 ${brief.topPainPoints?.[1] ?? '[different use case]'}</p>`;
}

function promptIntro(brief: Brief, toolName: string, note?: string): string {
  return `${ctx(brief, toolName, note)}

Write the intro. 150-180 words. No H2. Start with <p>.
Open with the problem. Mention ${toolName} in paragraph 1.
Say what this review covers. Do not list features or pros/cons.`;
}

function promptWhatIs(brief: Brief, toolName: string, note?: string): string {
  const h2 = brief.h2Changes?.find(h =>
    /what is|who is/i.test(h.next)
  )?.next ?? `What Is ${toolName} and Who Is It For?`;
  return `${ctx(brief, toolName, note)}

Write the "What is it?" section. 150-200 words.
H2: "${h2}"
Paragraph 1: What ${toolName} is, who it's for, its core promise. Reference: ${brief.confirmedFeatures?.slice(0,2).join(', ')}.
Paragraph 2: What ${toolName} does NOT do. Reference: ${brief.topPainPoints?.slice(0,1).join(', ')}.
Do not list all features — that's the next section.`;
}

function promptFeatures(brief: Brief, toolName: string, note?: string): string {
  const h2 = h2For(brief, ['feature', 'capabilit', 'what does', 'how does', 'work'], `What Does ${toolName} Actually Do?`);
  const featureList = brief.confirmedFeatures?.length
    ? `Cover ONLY these confirmed features: ${brief.confirmedFeatures.slice(0, 5).join(', ')}.`
    : `No feature list from research. Write about core functionality based on keyword: ${brief.targetKeywords?.[0] ?? toolName}.`;
  return `${ctx(brief, toolName, note)}

Write the features section. 250-300 words. THIS SECTION IS REQUIRED.
H2: "${h2}"
${featureList}
Format each feature as:
<p><strong>[Feature Name]:</strong> [2 sentences — what it does and why it matters]</p>
No sub-headings per feature. No pricing in this section.`;
}

function promptPricing(brief: Brief, toolName: string, note?: string): string {
  const h2 = h2For(brief, ['pric', 'cost', 'much'], `How Much Does ${toolName} Cost?`);
  return `${ctx(brief, toolName, note)}

Write the pricing section. 150-180 words.
H2: "${h2}"
Use this confirmed pricing: ${brief.confirmedPricing}
Cover each plan: name, price, what's included (2-3 things).
Note annual discount and free trial if available.
End with one honest sentence on value. No SalesRobot mention here.`;
}

function promptProsCons(brief: Brief, toolName: string, note?: string): string {
  // Never use 'what is' style H2 for pros-cons — hardcode the verdict question
  const h2 = brief.h2Changes?.find(h =>
    /worth|pros|cons|honest|accurate|good|should|right/i.test(h.next) &&
    !/what is|who is|how does/i.test(h.next)
  )?.next ?? `Is ${toolName} Worth It?`;
  return `${ctx(brief, toolName, note)}

Write the pros and cons section. 200-250 words.
H2: "${h2}"

<h3>What works well</h3>
List 4-5 pros with ✅ per item as <p>. Each must relate to a confirmed feature: ${brief.confirmedFeatures?.slice(0,5).join(', ')}.

<h3>Watch out for</h3>
List 4-5 cons with ❌ per item as <p>. Each must relate to a known pain point: ${brief.topPainPoints?.join(', ')}.

No intro paragraph. No conclusion. Only the two H3 groups.`;
}

function promptOverview(brief: Brief, toolName: string, note?: string): string {
  return `${ctx(brief, toolName, note)}

Write the overview section. 150-200 words.
H2: "Overview"
Neutral overview of both tools. What each is, who it's for, one key strength. Do not pick a winner yet.`;
}

function promptComparison(brief: Brief, toolName: string, note?: string): string {
  const h2 = h2For(brief, ['vs', 'compar', 'better'], `${toolName} vs SalesRobot: Which Is Better?`);
  return `${ctx(brief, toolName, note)}

Write the comparison section. 250-300 words.
H2: "${h2}"
Compare 4-5 categories. For each:
<h3>[Category]</h3>
<p><strong>${toolName}:</strong> [one sentence]</p>
<p><strong>SalesRobot:</strong> [one sentence]</p>
Name the winner per category honestly.`;
}

function promptWhySwitch(brief: Brief, toolName: string, note?: string): string {
  const h2 = h2For(brief, ['switch', 'alternative', 'why'], `Why Look for a ${toolName} Alternative?`);
  return `${ctx(brief, toolName, note)}

Write the "why switch" section. 150-200 words.
H2: "${h2}"
3-4 specific honest reasons based on: ${brief.topPainPoints?.join(', ')}.`;
}

function promptAlternativesList(brief: Brief, toolName: string, note?: string): string {
  return `${ctx(brief, toolName, note)}

Write the alternatives list. 300-350 words.
H2: "Best ${toolName} Alternatives"
List 4-5 tools. SalesRobot is #1. For each:
<h3>[N]. [Tool Name]</h3>
<p>[What it is — one sentence]</p>
<p><strong>Best for:</strong> [use case] | <strong>Pricing:</strong> [price]</p>`;
}

function promptWhyItMatters(brief: Brief, toolName: string, note?: string): string {
  const h2 = h2For(brief, ['matter', 'important', 'why'], `Why This Matters for Your Sales Team`);
  const keyword = brief.targetKeywords?.[0] ?? toolName;
  return `${ctx(brief, toolName, note)}

Write the "why it matters" section. 150-200 words.
H2: "${h2}"
Business impact of ${keyword}. Use specific outcomes. Connect to: ${brief.topPainPoints?.slice(0,2).join(', ')}.`;
}

function promptHowToSteps(brief: Brief, toolName: string, note?: string): string {
  const h2 = h2For(brief, ['how to', 'step', 'guide', 'start'], `How to Get Started with ${toolName}`);
  return `${ctx(brief, toolName, note)}

Write the how-to steps section. 250-300 words.
H2: "${h2}"
4-6 steps as:
<ol><li><strong>[Step name]</strong> — [one sentence]</li></ol>
Reference SalesRobot naturally for at least 2 steps.`;
}

function promptWhatToLookFor(brief: Brief, toolName: string, note?: string): string {
  return `${ctx(brief, toolName, note)}

Write the "what to look for" section. 150-200 words.
H2: "What to Look for in a Tool Like ${toolName}"
4-5 evaluation criteria. Each as:
<p><strong>[Criterion]:</strong> [why it matters, one sentence]</p>`;
}

function promptToolsList(brief: Brief, toolName: string, note?: string): string {
  return `${ctx(brief, toolName, note)}

Write the tools list section. 350-400 words.
H2: "Best Tools"
5-7 tools. SalesRobot is #1. Each:
<h3>[N]. [Name]</h3>
<p>[What it does — one sentence]</p>
<p><strong>Best for:</strong> [use case] | <strong>Pricing:</strong> [price]</p>`;
}

function promptTipsList(brief: Brief, toolName: string, note?: string): string {
  const h2 = h2For(brief, ['tip', 'strateg', 'tactic'], `Tips That Actually Work`);
  return `${ctx(brief, toolName, note)}

Write the tips section. 250-300 words.
H2: "${h2}"
5-7 tips. Each:
<h3>[N]. [Tip headline]</h3>
<p>[2-3 sentences of practical advice]</p>`;
}

function promptSalesRobot(brief: Brief, toolName: string, note?: string): string {
  return `${ctx(brief, toolName, note)}

Write the SalesRobot section. 250-300 words.
H2: "How Can SalesRobot Help?"
Opening: 2 sentences on this specific gap: ${brief.salesRobotAngle}

Pick 4 from this list most relevant to the gap:
AI Appointment Setter, Video/Voice messages, AI Variables, Safe Mode, Drip campaigns, Multi-account management, Whitelabel, A/B testing.
Each as: <p><strong>[Feature]:</strong> [2 sentences — what it does, why it matters here]</p>

Then add exactly:
<h3>How Much Does SalesRobot Cost?</h3>
<p>SalesRobot has three plans: <strong>Starter</strong> at <strong>$59/month</strong>, <strong>Advanced</strong> at <strong>$79/month</strong>, and <strong>Professional</strong> at <strong>$99/month</strong>. Annual billing saves 35%.</p>
<p>Try our <a href="https://app.salesrobot.co/register">14-day free trial</a>. No credit card required.</p>
<h3>SalesRobot vs ${toolName}: Which is Better?</h3>
3 short paragraphs: what ${toolName} does well, what SalesRobot does better, clear recommendation per audience.`;
}

function promptFaq(brief: Brief, toolName: string, note?: string): string {
  const questions = (brief.faqQuestions?.length ?? 0) > 0
    ? brief.faqQuestions!.slice(0, 5).join('\n')
    : [
        `What is ${toolName}?`,
        `How does ${toolName} work?`,
        `How much does ${toolName} cost?`,
        `Does ${toolName} have a free trial?`,
        `Is ${toolName} worth it?`,
      ].join('\n');

  return `${ctx(brief, toolName, note)}

Write the FAQ section. 200-250 words.
H2: "Frequently Asked Questions"
Write exactly 4-5 Q&As using ONLY these questions (copy them exactly):
${questions}

Format each as:
<h3>[Question exactly as written above]</h3>
<p>[Direct answer, 40-60 words]</p>

No intro text before first H3. No text after last answer.`;
}

function promptConclusion(brief: Brief, toolName: string, note?: string): string {
  return `${ctx(brief, toolName, note)}

Write the conclusion. 150-180 words.
H2: "Conclusion"
4 paragraphs only:
1. What ${toolName} genuinely does well — honest and specific.
2. Who should use ${toolName} — exact team type and use case.
3. Who should use SalesRobot — reference: ${brief.salesRobotAngle}.
4. Fixed closing (copy exactly):
<p>SalesRobot is cloud-based, keeps your LinkedIn account safe with mobile API emulation, and gets you running in minutes.</p>
<p>You can try our <a href="https://app.salesrobot.co/register">14-day free trial</a>. No credit card required.</p>
Do not summarise the whole blog. Just the verdict.`;
}

// ── Prompt router ─────────────────────────────────────────────────────────
function getPrompt(
  sectionId: string,
  brief: Brief,
  toolName: string,
  blogType: string,
  note?: string,
): string {
  const map: Record<string, (b: Brief, t: string, n?: string) => string> = {
    tldr:               promptTldr,
    intro:              promptIntro,
    'what-is':          promptWhatIs,
    features:           promptFeatures,
    pricing:            promptPricing,
    'pros-cons':        promptProsCons,
    overview:           promptOverview,
    comparison:         promptComparison,
    'why-switch':       promptWhySwitch,
    'alternatives-list': promptAlternativesList,
    'why-it-matters':   promptWhyItMatters,
    'how-to-steps':     promptHowToSteps,
    'what-to-look-for': promptWhatToLookFor,
    'tools-list':       promptToolsList,
    'tips-list':        promptTipsList,
    salesrobot:         promptSalesRobot,
    faq:                promptFaq,
    conclusion:         promptConclusion,
  };
  const fn = map[sectionId];
  if (fn) return fn(brief, toolName, note);
  return `${ctx(brief, toolName, note)}\nWrite the "${sectionId}" section. 150-200 words. Use an appropriate H2. Write only this section.`;
}

// ── Update mode helpers ───────────────────────────────────────────────────
function applyFindReplace(html: string, pairs: { find: string; replace: string }[]): string {
  let result = html;
  for (const { find, replace } of pairs) {
    if (find && result.includes(find)) result = result.split(find).join(replace);
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

// ── POST handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { sectionId, brief, toolName, blogType, existingSectionHtml = '', _note } = await req.json();

  // UPDATE MODE — find/replace, non-streaming
  if (sectionId === 'full-update' && existingSectionHtml) {

    // Step 1 — Apply H2 changes in code, no Claude needed
    // Strip tags for matching since Webflow wraps H2 content in <strong> etc
    const h2Changes: { isNew: boolean; old: string | null; next: string }[] = brief.h2Changes ?? [];
    let htmlAfterH2s = existingSectionHtml;
    const appliedH2s: string[] = [];
    for (const h of h2Changes) {
      if (!h.isNew && h.old && h.old.trim() !== h.next.trim()) {
        // Try exact match first
        if (htmlAfterH2s.includes(h.old)) {
          htmlAfterH2s = htmlAfterH2s.split(h.old).join(h.next);
          appliedH2s.push(h.old);
        } else {
          // Try matching inside h2 tags regardless of inner formatting
          const escaped = h.old.replace(/[.*+?^${}()|[\]\]/g, '\$&');
          const tagRegex = new RegExp(`(<h[23][^>]*>)[^<]*(?:<[^>]+>[^<]*</[^>]+>[^<]*)*${escaped}[^<]*(?:<[^>]+>[^<]*</[^>]+>[^<]*)*(<\/h[23]>)`, 'gi');
          const before = htmlAfterH2s;
          htmlAfterH2s = htmlAfterH2s.replace(tagRegex, `$1${h.next}$2`);
          if (htmlAfterH2s !== before) appliedH2s.push(h.old);
        }
      }
    }

    // Step 2 — Claude fact-checks pricing/features/years only
    const updatePrompt = `You are a fact-checker reviewing a blog post for outdated information.

CONFIRMED CURRENT FACTS:
- Pricing: ${brief.confirmedPricing}
- Features: ${(brief.confirmedFeatures ?? []).slice(0, 6).join(', ')}
- Pain points: ${(brief.topPainPoints ?? []).slice(0, 3).join(', ')}
${_note ? `Editor note: ${_note}` : ''}

Find outdated text and return ONLY a JSON array of find/replace pairs.
Focus on: wrong pricing numbers, wrong year (2024/2025 to 2026), removed features.
Do NOT touch H2 headings.

Return ONLY: [{ "find": "exact text", "replace": "corrected text" }]
Maximum 8 pairs. Return [] if nothing needs changing. Valid JSON only.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        stream: false,
        system: 'You are a fact-checker. Return only valid JSON arrays. No prose.',
        messages: [{ role: 'user', content: updatePrompt }],
      }),
    });

    if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 });

    const data = await res.json();
    const raw = data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
    const pairs = extractJSONArray(raw);
    let updatedHtml = pairs.length > 0 ? applyFindReplace(htmlAfterH2s, pairs) : htmlAfterH2s;

    // Always fix year references in code — reliable, no Claude needed
    updatedHtml = updatedHtml.replace(/in 2024/g, 'in 2026');
    updatedHtml = updatedHtml.replace(/in 2025/g, 'in 2026');
    updatedHtml = updatedHtml.replace(/for 2024/g, 'for 2026');
    updatedHtml = updatedHtml.replace(/for 2025/g, 'for 2026');
    updatedHtml = updatedHtml.replace(/\[2024\]/g, '[2026]');
    updatedHtml = updatedHtml.replace(/\[2025\]/g, '[2026]');
    updatedHtml = updatedHtml.replace(/Updated 2024/g, 'Updated 2026');
    updatedHtml = updatedHtml.replace(/Updated 2025/g, 'Updated 2026');

    // Step 3 — Write and insert new sections
    const newH2s = (brief.h2Changes ?? []).filter(
      (h: { isNew: boolean; next: string }) => h.isNew
    );

    for (const h of newH2s) {
      // Skip structural sections
      const skip = ['Conclusion', 'Frequently Asked Questions', 'FAQ', 'How Can SalesRobot Help?'];
      if (skip.some(s => h.next.toLowerCase().includes(s.toLowerCase()))) continue;
      // Skip if this heading already exists in the blog (avoid duplicates)
      const headingExists = updatedHtml.toLowerCase().includes(h.next.toLowerCase());
      if (headingExists) continue;

      // Write a focused new section for this H2
      const sectionPrompt = `${ctx(brief, toolName)}

Write a new section for this blog. 150-250 words.
YOUR FIRST LINE MUST BE EXACTLY: <h2>${h.next}</h2>
Write only this section. Make it relevant to the blog topic.
Clean HTML only.`;

      const sRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          stream: false,
          system: MASTER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: sectionPrompt }],
        }),
      });

      if (sRes.ok) {
        const sData = await sRes.json();
        const newSectionHtml = sData.content
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { text: string }) => b.text)
          .join('');

        if (newSectionHtml.trim()) {
          // Insert before conclusion or FAQ — find last h2 that looks like conclusion/faq
          const insertBefore = /<h2[^>]*>\s*(?:Conclusion|Frequently Asked Questions|FAQ)\s*<\/h2>/i;
          if (insertBefore.test(updatedHtml)) {
            updatedHtml = updatedHtml.replace(insertBefore, (match) => `
${newSectionHtml}

${match}`);
          } else {
            // Append before closing if no conclusion found
            updatedHtml = updatedHtml + `

${newSectionHtml}`;
          }
        }
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chunks: string[] = [];
        for (let i = 0; i < updatedHtml.length; i += 200) chunks.push(updatedHtml.slice(i, i + 200));
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } }) + '\n\n'));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  // NEW BLOG MODE — focused single-section prompt, streaming
  const prompt = getPrompt(sectionId, brief, toolName, blogType, _note);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      stream: true,
      system: MASTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return new Response(await res.text(), { status: 500 });

  return new Response(res.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
