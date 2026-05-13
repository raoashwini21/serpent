import { NextRequest } from 'next/server';
import { MASTER_SYSTEM_PROMPT } from '@/prompts/system';
import type { Brief } from '@/app/studio/types';

export const maxDuration = 60;

function buildSectionPrompt(
  sectionId: string,
  brief: Brief,
  toolName: string,
  blogType: string,
  existingSectionHtml: string,
): string {
  const h2 = brief.h2Changes.find(h => !h.isNew)?.next ?? brief.h1;
  const keyword = brief.targetKeywords[0] ?? toolName;
  const isUpdate = existingSectionHtml.length > 100;

  const base = `
Tool: ${toolName}
Blog type: ${blogType}
Primary keyword: ${keyword}
Confirmed pricing: ${brief.confirmedPricing}
Confirmed features: ${brief.confirmedFeatures.join(', ')}
Top pain points: ${brief.topPainPoints.join(', ')}
SalesRobot angle: ${brief.salesRobotAngle}
${isUpdate ? `\nEXISTING SECTION HTML (update this, preserve structure, apply fixes):\n${existingSectionHtml}` : ''}

Write clean HTML only. No markdown. No <html>/<body>/<style> wrappers.
Max 30 words per <p> tag. Never use em dashes.`;

  const prompts: Record<string, string> = {
    tldr: `${base}
Write the TL;DR section for "${brief.h1}".
Format:
<h2>TL;DR</h2>
<p><strong>${toolName}</strong> is [one honest sentence].</p>
<p><strong>Pros:</strong> ...<br><strong>Cons:</strong> ...<br><strong>Pricing:</strong> ${brief.confirmedPricing}</p>
<p><strong>Better alternative:</strong></p>
<ul><li><strong>SalesRobot</strong> ($59-$99/month) — [why, referencing ${toolName} gap]</li></ul>
<p>This article is for you if:</p>
<p>👉 [specific pain point]</p>
<p>OR</p>
<p>👉 [different use case]</p>`,

    intro: `${base}
Write a 150-180 word intro for "${brief.h1}".
Open with the core problem. Mention ${toolName} by name. Set up why this review matters in 2025.
No H2 heading for intro. Start directly with <p>.`,

    features: `${base}
Write the features section. Use H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('feature'))?.next ?? 'What Does ' + toolName + ' Actually Do?'}"
Cover: ${brief.confirmedFeatures.join(', ')}.
Each feature as <p><strong>[Name]:</strong> [2-3 sentences]</p>.`,

    pricing: `${base}
Write the pricing section. Use H2: "${brief.h2Changes.find(h => h.next.toLowerCase().includes('pric') || h.next.toLowerCase().includes('cost'))?.next ?? 'How Much Does ' + toolName + ' Cost?'}"
Use confirmed pricing: ${brief.confirmedPricing}.
Be specific. Include free trial info if available.`,

    'pros-cons': `${base}
Write pros and cons. Use H2: "Is ${toolName} Worth It?"
List ALL pros first under <h3>What works well</h3>, then ALL cons under <h3>Watch out for</h3>.
Use ✅ for pros, ❌ for cons. Base on: pain points data and research findings.`,

    salesrobot: `${base}
Write the SalesRobot alternative section.
H2: "How Can SalesRobot Help?"
Gap to address: ${brief.salesRobotAngle}
Pick 4 relevant features from: AI Appointment Setter, Video/Voice messages, AI Variables, Safe Mode, Drip campaigns, Multi-account, Whitelabel, A/B testing.
Include pricing: Starter $59/mo, Advanced $79/mo, Professional $99/mo.
End with H3 "SalesRobot vs ${toolName}: Which is Better?" — 3-4 honest paragraphs.`,

    faq: `${base}
Write FAQ section. H2: "Frequently Asked Questions"
Use these questions (from PAA/GSC research): ${brief.h2Changes.filter(h => h.reason.includes('PAA') || h.reason.includes('question')).map(h => h.next).join(', ')}
If none, use top pain points as question topics: ${brief.topPainPoints.join(', ')}.
Format each as <h3>[Question]</h3><p>[Answer, max 60 words]</p>.
4-6 questions only.`,

    conclusion: `${base}
Write conclusion. H2: "Conclusion"
Structure:
1. What ${toolName} is genuinely good at (honest, 1-2 sentences)
2. Who should use ${toolName}
3. Who should use SalesRobot instead
4. Fixed closing: <p>SalesRobot is cloud-based, keeps your LinkedIn account safe with mobile API emulation, and gets you running in minutes.</p>
5. CTA: <p>You can try our <a href="https://app.salesrobot.co/register">14-day free trial</a>. No credit card required.</p>
150-200 words total.`,
  };

  return prompts[sectionId] ?? `${base}\nWrite the "${sectionId}" section for "${brief.h1}". Use an appropriate H2. 200-300 words.`;
}

export async function POST(req: NextRequest) {
  const { sectionId, brief, toolName, blogType, existingSectionHtml = '' } = await req.json();

  const prompt = buildSectionPrompt(sectionId, brief, toolName, blogType, existingSectionHtml);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
