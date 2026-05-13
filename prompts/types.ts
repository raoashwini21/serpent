// Shared types for prompt builder functions

export interface SectionBrief {
  id: string;
  heading: string;
  headingTag: string;
  targetKeywords: string[];
  instructions?: string;
}

export interface PricingPlan {
  name: string;
  price: string;
  features: string[];
}

export interface FeatureItem {
  name: string;
  description?: string;
  rating?: number;
}

export interface ResearchBrief {
  productName: string;
  pros: string[];
  cons: string[];
  features: FeatureItem[];
  pricing: { plans: PricingPlan[]; freeTrial: boolean };
  g2Rating?: string;
  capterraRating?: string;
  targetAudience: string;
  keyDifferentiators: string[];
}

export interface KeywordData {
  primaryKeyword: string;
  secondaryKeywords: string[];
}

export interface ContentBrief {
  blogTitle: string;
  h1: string;
  contentType: string;
  sections: SectionBrief[];
}
