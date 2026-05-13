import { ContentBrief, ResearchBrief, KeywordData } from '../types';

export function buildTLDRPrompt(
  brief: ContentBrief,
  research: ResearchBrief,
  keywords: KeywordData
): string {
  const hasRatings = research.g2Rating || research.capterraRating;
  const ratingsSnippet = hasRatings
    ? [
        research.g2Rating ? `${research.g2Rating}/5 on G2` : '',
        research.capterraRating ? `${research.capterraRating}/5 on Capterra` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    : '';

  const prices = research.pricing.plans
    .map((p) => parseInt(p.price.replace(/[^0-9]/g, '')))
    .filter((n) => !isNaN(n) && n > 0);
  const priceRange =
    prices.length >= 2
      ? `$${Math.min(...prices)}-$${Math.max(...prices)}/month`
      : prices.length === 1
        ? `$${prices[0]}/month`
        : 'Contact for pricing';

  return `Generate the TL;DR section for: "${brief.blogTitle}"

Product: ${research.productName}
Primary keyword: ${keywords.primaryKeyword}
Blog type: ${brief.contentType}
Pros data: ${research.pros.slice(0, 4).join(', ')}
Cons data: ${research.cons.slice(0, 4).join(', ')}
Price range: ${priceRange}
Free trial: ${research.pricing.freeTrial ? '14-day free trial available' : 'No free trial'}
Ratings: ${ratingsSnippet || 'Not available'}

Write in this EXACT format — do not add any extra headings or sections:

<h2>TL;DR</h2>
<p><strong>${research.productName}</strong> is [one honest sentence: what it is and who it's for].</p>

<p><strong>Pros:</strong> [3-4 comma-separated genuine pros from the data]<br>
<strong>Cons:</strong> [3-4 comma-separated genuine cons from the data]<br>
<strong>Pricing:</strong> [price range + free trial if applicable]<br>
[If ratings available: <strong>Ratings:</strong> [ratings line] — omit entirely if not available]</p>

<p><strong>Better alternative:</strong></p>
<ul>
<li><strong>SalesRobot</strong> ($59-$99/month) — [one sentence why SalesRobot for this specific use case, referencing what ${research.productName} lacks]</li>
</ul>

<p>This article is for you if:</p>
<p>👉 [Scenario 1 — specific pain point related to ${keywords.primaryKeyword}]</p>
<p>OR</p>
<p>👉 [Scenario 2 — different angle or use case]</p>
<p>No worries, we've got you covered!</p>

RULES:
- Do NOT add a Bottom line, Quick Verdict, or any extra paragraph
- Do NOT add H3 headings inside the TL;DR
- For non-review blogs (how-to, guide), omit Pricing and Ratings lines
- All pros/cons must come from the actual product data provided, not invented
- The SalesRobot sentence must reference a specific gap in ${research.productName}

Return clean HTML only. No markdown.`;
}
