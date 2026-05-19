import { NextRequest, NextResponse } from 'next/server';
import type { Brief, SectionDraft } from '@/app/studio/types';

export const maxDuration = 30;

function assembleBlogHtml(sections: SectionDraft[], h1: string): string {
  const body = sections
    .filter(s => s.status === 'done' && s.html)
    .map(s => `<section id="${s.id}">\n${s.html}\n</section>`)
    .join('\n\n');
  return `<h1>${h1}</h1>\n\n${body}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  const {
    sections,
    brief,
    blogType,
    existingItemId,
  }: {
    sections: SectionDraft[];
    brief: Brief;
    blogType: string;
    existingItemId?: string;
  } = await req.json();

  const collectionId = process.env.WEBFLOW_COLLECTION_ID;
  const token = process.env.WEBFLOW_API_TOKEN;

  if (!collectionId || !token) {
    return NextResponse.json({ error: 'Webflow env vars missing' }, { status: 500 });
  }

  const blogHtml = assembleBlogHtml(sections, brief.h1);
  const introSection = sections.find(s => s.id === 'intro');
  const excerptFull = introSection ? stripHtml(introSection.html) : '';
  const excerpt = excerptFull.length > 150 ? excerptFull.slice(0, 150) + '...' : excerptFull;

  const slug = brief.h1
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);

  const fields = {
    name: brief.h1,
    slug,
    'post-body': blogHtml,
    'meta-title': brief.metaTitle,
    'meta-description': brief.metaDescription,
    'post-summary': excerpt,
    'blog-category': blogType,
    _draft: true,
  };

  const isUpdate = !!existingItemId;
  const url = isUpdate
    ? `https://api.webflow.com/collections/${collectionId}/items/${existingItemId}`
    : `https://api.webflow.com/collections/${collectionId}/items`;

  const wfRes = await fetch(url, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'accept-version': '1.0.0',
    },
    body: JSON.stringify({ fields }),
  });

  if (!wfRes.ok) {
    const err = await wfRes.text();
    return NextResponse.json({ error: `Webflow error: ${err}` }, { status: 500 });
  }

  const result = await wfRes.json();
  return NextResponse.json({
    success: true,
    itemId: result._id,
    slug,
    isUpdate,
  });
}
