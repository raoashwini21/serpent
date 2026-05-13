export const BLOG_TYPES = [
  {
    id: 'tool-review',
    label: '🔍 Tool Review',
    description: 'In-depth review of a specific tool (e.g. "PhantomBuster Review")',
    funnelStage: 'BOFU' as const,
    sections: ['tldr', 'intro', 'what-is', 'features', 'pricing', 'pros-cons', 'salesrobot', 'faq', 'conclusion'],
    infographicTypes: { features: 'features', 'pros-cons': 'pros_cons', pricing: 'pricing', salesrobot: 'none' },
    searchIntent: 'investigational',
  },
  {
    id: 'tool-comparison',
    label: '⚖️ Tool Comparison (X vs Y)',
    description: 'Compare two specific tools head-to-head (e.g. "Dripify vs HeyReach")',
    funnelStage: 'BOFU' as const,
    sections: ['tldr', 'intro', 'overview', 'comparison', 'salesrobot', 'faq', 'conclusion'],
    infographicTypes: { comparison: 'comparison', salesrobot: 'none' },
    searchIntent: 'investigational',
  },
  {
    id: 'alternatives',
    label: '📋 Alternatives List',
    description: 'Best alternatives to a tool (e.g. "Top 5 PhantomBuster Alternatives")',
    funnelStage: 'MOFU' as const,
    sections: ['tldr', 'intro', 'why-switch', 'alternatives-list', 'salesrobot', 'faq', 'conclusion'],
    infographicTypes: { 'alternatives-list': 'comparison', salesrobot: 'pricing' },
    searchIntent: 'investigational',
  },
  {
    id: 'how-to-guide',
    label: '📖 How-To Guide',
    description: 'Step-by-step guide on a topic (e.g. "How to Automate LinkedIn Outreach")',
    funnelStage: 'TOFU' as const,
    sections: ['tldr', 'intro', 'what-is', 'why-it-matters', 'how-to-steps', 'salesrobot', 'faq', 'conclusion'],
    infographicTypes: { 'how-to-steps': 'none', salesrobot: 'none' },
    searchIntent: 'informational',
  },
  {
    id: 'listicle',
    label: '🏆 Best Tools List',
    description: 'Ranked list of tools for a category (e.g. "7 Best LinkedIn Automation Tools")',
    funnelStage: 'TOFU' as const,
    sections: ['tldr', 'intro', 'what-to-look-for', 'tools-list', 'salesrobot', 'faq', 'conclusion'],
    infographicTypes: { 'tools-list': 'comparison', salesrobot: 'pricing' },
    searchIntent: 'informational',
  },
  {
    id: 'strategy-guide',
    label: '💡 Strategy / Tips Article',
    description: 'Tactical advice article (e.g. "10 LinkedIn Outreach Tips That Actually Work")',
    funnelStage: 'TOFU' as const,
    sections: ['tldr', 'intro', 'why-it-matters', 'tips-list', 'salesrobot', 'faq', 'conclusion'],
    infographicTypes: { 'tips-list': 'stats', salesrobot: 'none' },
    searchIntent: 'informational',
  },
] as const;

export type BlogTypeId = typeof BLOG_TYPES[number]['id'];
export type BlogType = typeof BLOG_TYPES[number];

export function getBlogType(id: string): BlogType {
  return (BLOG_TYPES.find((b) => b.id === id) ?? BLOG_TYPES[0]) as BlogType;
}
