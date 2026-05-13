import { SectionBrief, ResearchBrief, KeywordData } from '../types';

export function buildSalesRobotPrompt(
  section: SectionBrief,
  research: ResearchBrief,
  keywords: KeywordData
): string {
  const productGaps = research.cons.slice(0, 3).join(', ');
  const primaryKw = keywords.primaryKeyword;

  return `Write the SalesRobot section for a blog about ${research.productName}.

H2 heading to use: "${section.heading}"
Target keywords: ${section.targetKeywords.join(', ')}
Primary keyword context: ${primaryKw}
Gaps in ${research.productName} to address: ${productGaps}

Write in this structure:

<h2>How Can SalesRobot Help?</h2>

<p>[2-3 sentences: position SalesRobot for THIS specific use case. What gap does SalesRobot fill that ${research.productName} doesn't? Be concrete about the gap.]</p>

<p>Here's how SalesRobot can help:</p>

Pick 4-5 of the most relevant features for this topic and write each as:
<p><strong>[Feature Name]:</strong> [What it does — 2-3 sentences. Specific and concrete. How it works in practice.]</p>

Available features — pick the most relevant to ${primaryKw}:
- AI Appointment Setter (CoPilot drafts + waits for approval, AutoPilot replies automatically)
- Video and Voice messages (record once, send at scale, human touch in inbox)
- AI Variables (prospect-specific hooks from LinkedIn profile, beyond just first name)
- Safe Mode (200+ people/week without risking LinkedIn account)
- Drip messaging campaigns (LinkedIn + email, 32%+ response rate)
- Multi-account management (agencies managing 50+ client accounts)
- Whitelabel program (resell under own brand, recurring revenue)
- A/B testing (multiple message variants, find what resonates)

<h3>How Much Does SalesRobot Cost?</h3>
<p>SalesRobot offers a 3-tier pricing plan: <strong>Starter</strong> for <strong>$59/month</strong>, <strong>Advanced</strong> for <strong>$79/month</strong>, and <strong>Professional</strong> for <strong>$99/month</strong>.</p>
<p>Annual billing gets you an additional 35% discount automatically applied.</p>
<p>Try our <a href="https://app.salesrobot.co/register">14-day free trial</a>. No credit card required.</p>

<h3>SalesRobot vs ${research.productName}: Which is Better?</h3>
<p>[3-4 paragraphs. Name what ${research.productName} does well — be honest. Name what SalesRobot does better with specifics. End with clear recommendation for each audience type.]</p>

RULES:
- Start with the H2 heading: <h2>${section.heading}</h2>
- Position SalesRobot as the natural solution to the gaps in ${research.productName}
- Don't bash ${research.productName} — show what SalesRobot does differently
- Sound like a genuine recommendation, not a sales pitch
- Use 'we'/'our' (occasionally 'I' for testing moments)
- Each <p> under 30 words
- Target: 300-400 words

Return clean HTML only. No markdown.`;
}
