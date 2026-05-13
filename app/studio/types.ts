export type PhaseStatus = 'pending' | 'running' | 'done' | 'error';

export interface Finding {
  type: 'added' | 'removed' | 'changed' | 'signal';
  text: string;
}

export interface H2Change {
  old: string | null;
  next: string;
  reason: string;
  isNew: boolean;
}

export interface ResearchData {
  toolName: string;
  pricing: Finding[];
  features: Finding[];
  ratings: { g2?: string; capterra?: string };
  redditSignals: Finding[];
  youtubeSignals: Finding[];
  reviewSignals: Finding[];
  serpH2s: string[];
  paaQuestions: string[];
}

export interface GscRow {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export interface Brief {
  h1: string;
  metaTitle: string;
  metaDescription: string;
  h2Changes: H2Change[];
  targetKeywords: string[];
  salesRobotAngle: string;
  confirmedPricing: string;
  confirmedFeatures: string[];
  topPainPoints: string[];
}

export interface SectionDraft {
  id: string;
  label: string;
  status: 'pending' | 'flagged' | 'writing' | 'done' | 'skipped';
  flagReason?: string;
  html: string;
}

export interface StudioSession {
  id: string;
  mode: 'new' | 'update';
  blogTitle: string;
  blogType: string;
  existingSlug?: string;
  existingHtml?: string;

  phase1Status: PhaseStatus;
  phase2Status: PhaseStatus;
  phase3Status: PhaseStatus;
  phase4Status: PhaseStatus;
  phase5Status: PhaseStatus;

  research: ResearchData | null;
  gscRows: GscRow[];
  hasGsc: boolean;
  brief: Brief | null;
  briefApproved: boolean;

  sections: SectionDraft[];
  activeSectionId: string | null;
}

export const SECTION_LABELS: Record<string, string> = {
  tldr: 'TL;DR',
  intro: 'Intro',
  'what-is': 'What is it?',
  features: 'Features',
  pricing: 'Pricing',
  'pros-cons': 'Pros & cons',
  overview: 'Overview',
  comparison: 'Comparison',
  'why-switch': 'Why switch?',
  'alternatives-list': 'Alternatives list',
  'why-it-matters': 'Why it matters',
  'how-to-steps': 'How-to steps',
  'what-to-look-for': 'What to look for',
  'tools-list': 'Tools list',
  'tips-list': 'Tips list',
  salesrobot: 'SalesRobot section',
  faq: 'FAQ',
  conclusion: 'Conclusion',
};
