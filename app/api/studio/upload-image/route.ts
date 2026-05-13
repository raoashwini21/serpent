import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const token = process.env.WEBFLOW_API_TOKEN;
  const siteId = process.env.WEBFLOW_SITE_ID;

  if (!token) {
    return NextResponse.json({ error: 'WEBFLOW_API_TOKEN missing' }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // If no site ID, return a data URL as fallback (works in preview, not ideal for prod)
    if (!siteId) {
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${file.type};base64,${base64}`;
      return NextResponse.json({ url: dataUrl, fallback: true });
    }

    // Upload to Webflow Assets API v2
    const uploadFormData = new FormData();
    uploadFormData.append('file', new Blob([buffer], { type: file.type }), file.name);
    uploadFormData.append('fileName', file.name);

    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/assets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: uploadFormData,
    });

    if (!res.ok) {
      const err = await res.text();
      // Fall back to data URL if Webflow upload fails
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${file.type};base64,${base64}`;
      console.error('Webflow upload failed, using data URL fallback:', err);
      return NextResponse.json({ url: dataUrl, fallback: true });
    }

    const data = await res.json();
    const url = data.hostedUrl ?? data.url ?? data.cdn ?? '';

    if (!url) {
      return NextResponse.json({ error: 'No URL in Webflow response' }, { status: 500 });
    }

    return NextResponse.json({ url });

  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
