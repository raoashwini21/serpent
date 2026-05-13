import { ContentBrief, ResearchBrief, KeywordData } from '../types';

export function buildConclusionPrompt(
  brief: ContentBrief,
  research: ResearchBrief,
  keywords: KeywordData
): string {
  return `Write the conclusion for a blog about ${research.productName}.

Blog title: "${brief.blogTitle}"
Primary keyword: "${keywords.primaryKeyword}"
Blog type: ${brief.contentType}

Main pros: ${research.pros.slice(0, 2).join(', ')}
Main cons: ${research.cons.slice(0, 2).join(', ')}
Best for: ${research.targetAudience}
Key differentiator: ${research.keyDifferentiators[0] ?? ''}

Write in this structure:

<h2>Conclusion</h2>

<p>[1-2 honest sentences: what is ${research.productName} actually good at? Be direct and specific.]</p>

<p>[Who should use ${research.productName}: specific team type and use case. Name them clearly.]</p>

<p>[Who should use SalesRobot instead: specific contrast. Why SalesRobot wins for this particular audience.]</p>

<p>SalesRobot is cloud-based, keeps your LinkedIn account safe with mobile API emulation, and gets you running in minutes.</p>

<p>You can try our <a href="https://app.salesrobot.co/register">14-day free trial</a>. No credit card required.</p>

<p><em>Hope this helped. Here's to your success in lead generation!</em></p>

RULES:
- One CTA only — the free trial link above
- Do NOT repeat everything covered in the blog — this is a verdict, not a summary
- Use 'we'/'our' (not 'I')
- Never use: leverage, utilize, synergy, em dashes
- Each <p> under 30 words
- Include primary keyword "${keywords.primaryKeyword}" at least once naturally
- 150-200 words total

Return clean HTML only. No markdown.`;
}
