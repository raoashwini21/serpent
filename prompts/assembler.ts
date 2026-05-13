import { ContentBrief, KeywordData, ResearchBrief } from './types';
import { generateFAQSchema, generateArticleSchema } from './seo/schema-generator';
import { injectInternalLinks } from './links/internal-linker';
import { injectExternalLinks } from './links/external-linker';
import { generateSlug } from './seo/url-generator';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extract Q&A pairs from FAQ section HTML */
function extractFAQPairs(faqHtml: string): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = [];
  const h3Pattern = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = h3Pattern.exec(faqHtml)) !== null) {
    const question = stripHtml(match[1]).trim();
    const answerBlock = match[2];
    const pMatch = answerBlock.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const answer = pMatch ? stripHtml(pMatch[1]).trim() : stripHtml(answerBlock).slice(0, 300).trim();
    if (question && answer) {
      pairs.push({ question, answer });
    }
  }

  return pairs;
}

/** Build a table of contents from sections */
function buildTableOfContents(brief: ContentBrief): string {
  const items = brief.sections
    .filter((s) => s.headingTag === 'h2' && s.id !== 'tldr')
    .map((s) => `  <li><a href="#${s.id}">${s.heading}</a></li>`)
    .join('\n');

  return `<nav class="toc" aria-label="Table of Contents">
  <p><strong>Table of Contents</strong></p>
  <ul>
${items}
  </ul>
</nav>`;
}

export interface AssembledBlog {
  blogHtml: string;
  metadata: {
    title: string;
    slug: string;
    metaTitle: string;
    metaDescription: string;
    excerpt: string;
    faqSchema: string;
    articleSchema: string;
  };
}

export function assembleHTML(
  brief: ContentBrief,
  sections: Map<string, string>,
  infographics: Map<string, string | null>,
  keywords: KeywordData,
  meta: Record<string, unknown>,
  research?: ResearchBrief,
  category?: string
): AssembledBlog {
  // Build FAQ schema from FAQ section content
  const faqHtml = sections.get('faq') ?? '';
  const faqPairs = extractFAQPairs(faqHtml);
  const faqSchema = faqPairs.length > 0 ? generateFAQSchema(faqPairs) : '';
  const articleSchema = generateArticleSchema(brief);

  const toc = buildTableOfContents(brief);

  // Assemble section bodies
  const sectionBlocks = brief.sections
    .map((section) => {
      const sectionHtml = sections.get(section.id) ?? '';
      const infographic = infographics.get(section.id) ?? null;

      let body = sectionHtml;
      if (infographic) {
        const firstPEnd = body.indexOf('</p>');
        if (firstPEnd !== -1) {
          body =
            body.slice(0, firstPEnd + 4) +
            `\n<figure class="blog-infographic">\n${infographic}\n</figure>\n` +
            body.slice(firstPEnd + 4);
        } else {
          body = body + `\n<figure class="blog-infographic">\n${infographic}\n</figure>\n`;
        }
      }

      return `<section id="${section.id}">\n${body}\n</section>`;
    })
    .join('\n\n');

  // ── Link Injection ────────────────────────────────────────────────────────
  let bodyHtml = sectionBlocks;
  if (category) {
    try { bodyHtml = injectInternalLinks(bodyHtml, category); } catch { /* non-fatal */ }
  }
  if (research) {
    try { bodyHtml = injectExternalLinks(bodyHtml, research); } catch { /* non-fatal */ }
  }

  // ── blogHtml: Webflow-compatible clean HTML (no html/head/body/script wrappers) ──
  const blogHtml = `<h1>${brief.h1}</h1>\n\n${toc}\n\n${bodyHtml}`;

  // ── metadata ──────────────────────────────────────────────────────────────
  const slug = typeof meta.slug === 'string' && meta.slug
    ? meta.slug
    : generateSlug(keywords.primaryKeyword);

  // Extract excerpt from intro section (first 150 chars of plain text)
  const introHtml = sections.get('intro') ?? sections.get(brief.sections[0]?.id ?? '') ?? '';
  const excerptFull = stripHtml(introHtml);
  const excerpt = excerptFull.length > 150 ? excerptFull.slice(0, 150) + '...' : excerptFull;

  const metaTitle = typeof meta.title === 'string' ? meta.title : brief.h1;
  const metaDescription = typeof meta.description === 'string' ? meta.description : excerpt;

  return {
    blogHtml,
    metadata: {
      title: brief.h1,
      slug,
      metaTitle,
      metaDescription,
      excerpt,
      faqSchema,
      articleSchema,
    },
  };
}
