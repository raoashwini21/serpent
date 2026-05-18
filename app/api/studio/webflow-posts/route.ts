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
    const fd = item['fieldData'];
    if (fd && typeof fd === 'object') {
      const nested = (fd as Record<string, unknown>)[key];
      if (typeof nested === 'string' && nested) return nested;
    }
  }
  return '';
}

async function fetchAllItems(
  collectionId: string,
  token: string
): Promise<{ items: Record<string, unknown>[]; apiVersion: string }> {
  const allItems: Record<string, unknown>[] = [];
  let apiVersion = 'v2';
  let offset = 0;
  const limit = 100;

  // Try v2 first
  const testRes = await fetch(
    `https://api.webflow.com/v2/collections/${collectionId}/items?limit=1`,
    { headers: { Authorization: `Bearer ${token}`, 'accept-version': '2.0.0' } }
  );

  if (testRes.ok) {
    // Paginate v2
    while (true) {
      const res = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}`, 'accept-version': '2.0.0' } }
      );
      if (!res.ok) break;
      const data = await res.json();
      const batch: Record<string, unknown>[] = data.items ?? [];
      allItems.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
      if (offset > 2000) break; // safety cap
    }
  } else {
    // Paginate v1
    apiVersion = 'v1';
    while (true) {
      const res = await fetch(
        `https://api.webflow.com/collections/${collectionId}/items?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}`, 'accept-version': '1.0.0' } }
      );
      if (!res.ok) break;
      const data = await res.json();
      const batch: Record<string, unknown>[] = data.items ?? [];
      allItems.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
      if (offset > 2000) break;
    }
  }

  return { items: allItems, apiVersion };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') ?? '').toLowerCase().trim();
  const debug = searchParams.get('debug') === '1';

  const collectionId = process.env.WEBFLOW_COLLECTION_ID;
  const token = process.env.WEBFLOW_API_TOKEN;

  if (!collectionId || !token) {
    return NextResponse.json({ error: 'Webflow env vars missing' }, { status: 500 });
  }

  const { items, apiVersion } = await fetchAllItems(collectionId, token);

  if (debug && items.length > 0) {
    return NextResponse.json({
      apiVersion,
      totalItems: items.length,
      firstItemKeys: Object.keys(items[0]),
      firstItem: items[0],
    });
  }

  const filtered = items
    .filter(item => !item._archived && !(item['fieldData'] as Record<string, unknown>)?.['archived'])
    .filter(item => {
      if (!search) return true;
      const name = getField(item, 'name', 'Name');
      const slug = getField(item, 'slug', 'Slug');
      return (
        name.toLowerCase().includes(search) ||
        slug.toLowerCase().includes(search)
      );
    })
    .slice(0, 30)
    .map(item => {
      const name = getField(item, 'name', 'Name');
      const slug = getField(item, 'slug', 'Slug');
      const bodyHtml = getField(item, 'post-body', 'post-body-2', 'body', 'content', 'post-content');
      const isDraft = Boolean(item['_draft'] ?? (item['fieldData'] as Record<string, unknown>)?.['draft']);
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
