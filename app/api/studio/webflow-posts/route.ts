import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

function extractH2s(html: string): string[] {
  const matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) ?? [];
  return matches.map(m => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
}

function getField(item: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = item[key];
    if (typeof val === 'string' && val) return val;
    // Webflow v2 nests under fieldData
    const fd = item['fieldData'];
    if (fd && typeof fd === 'object') {
      const nested = (fd as Record<string, unknown>)[key];
      if (typeof nested === 'string' && nested) return nested;
    }
  }
  return '';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';
  const debug = searchParams.get('debug') === '1';

  const collectionId = process.env.WEBFLOW_COLLECTION_ID;
  const token = process.env.WEBFLOW_API_TOKEN;

  if (!collectionId || !token) {
    return NextResponse.json({ error: 'Webflow env vars missing' }, { status: 500 });
  }

  // Try Webflow v2 first, fall back to v1
  let items: Record<string, unknown>[] = [];
  let apiVersion = 'v2';

  const v2Res = await fetch(
    `https://api.webflow.com/v2/collections/${collectionId}/items?limit=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'accept-version': '2.0.0',
      },
    }
  );

  if (v2Res.ok) {
    const data = await v2Res.json();
    items = data.items ?? [];
  } else {
    // Fall back to v1
    apiVersion = 'v1';
    const v1Res = await fetch(
      `https://api.webflow.com/collections/${collectionId}/items?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'accept-version': '1.0.0',
        },
      }
    );
    if (!v1Res.ok) {
      const err = await v1Res.text();
      return NextResponse.json({ error: `Webflow error: ${err}` }, { status: 500 });
    }
    const data = await v1Res.json();
    items = data.items ?? [];
  }

  // Debug mode — return raw first item so we can see field names
  if (debug && items.length > 0) {
    return NextResponse.json({ 
      apiVersion, 
      totalItems: items.length,
      firstItemKeys: Object.keys(items[0]),
      firstItem: items[0],
    });
  }

  const filtered = items
    .filter(item => !item._archived && !(item['fieldData'] as Record<string,unknown>)?.['archived'])
    .filter(item => {
      if (!search) return true;
      const name = getField(item, 'name', 'Name');
      return name.toLowerCase().includes(search.toLowerCase());
    })
    .slice(0, 20)
    .map(item => {
      const name = getField(item, 'name', 'Name');
      const slug = getField(item, 'slug', 'Slug');
      const bodyHtml = getField(item, 'post-body', 'post-body-2', 'body', 'content', 'post-content');
      const isDraft = Boolean(item['_draft'] ?? (item['fieldData'] as Record<string,unknown>)?.['draft']);
      const id = (item['_id'] ?? item['id']) as string;

      return {
        id,
        name: name || 'Untitled',
        slug: slug || '',
        isDraft,
        h2s: bodyHtml ? extractH2s(bodyHtml) : [],
        bodyHtml,
      };
    })
    .filter(item => item.name !== 'Untitled' || item.slug);

  return NextResponse.json({ posts: filtered, apiVersion, total: items.length });
}
