import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

interface WebflowItem {
  _id: string;
  name: string;
  slug: string;
  'post-body'?: string;
  'meta-title'?: string;
  _draft?: boolean;
  _archived?: boolean;
}

function extractH2s(html: string): string[] {
  const matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) ?? [];
  return matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';

  const collectionId = process.env.WEBFLOW_COLLECTION_ID;
  const token = process.env.WEBFLOW_API_TOKEN;

  if (!collectionId || !token) {
    return NextResponse.json({ error: 'Webflow env vars missing' }, { status: 500 });
  }

  const res = await fetch(
    `https://api.webflow.com/collections/${collectionId}/items?limit=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'accept-version': '1.0.0',
      },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const data = await res.json();
  const items: WebflowItem[] = data.items ?? [];

  const filtered = items
    .filter(item => !item._archived)
    .filter(item =>
      search
        ? item.name.toLowerCase().includes(search.toLowerCase())
        : true
    )
    .slice(0, 20)
    .map(item => ({
      id: item._id,
      name: item.name,
      slug: item.slug,
      isDraft: item._draft ?? false,
      h2s: item['post-body'] ? extractH2s(item['post-body']) : [],
      bodyHtml: item['post-body'] ?? '',
    }));

  return NextResponse.json({ posts: filtered });
}
