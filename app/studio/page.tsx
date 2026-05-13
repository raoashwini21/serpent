'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  Finding,
  GscRow,
  ResearchData,
  Brief,
  SectionDraft,
  PhaseStatus,
} from './types';
import { SECTION_LABELS } from './types';
import { BLOG_TYPES } from '@/prompts/blog-types';

const BLOG_SECTIONS: Record<string, string[]> = {
  'tool-review': ['tldr', 'intro', 'what-is', 'features', 'pricing', 'pros-cons', 'salesrobot', 'faq', 'conclusion'],
  'tool-comparison': ['tldr', 'intro', 'overview', 'comparison', 'salesrobot', 'faq', 'conclusion'],
  'alternatives': ['tldr', 'intro', 'why-switch', 'alternatives-list', 'salesrobot', 'faq', 'conclusion'],
  'how-to-guide': ['tldr', 'intro', 'what-is', 'why-it-matters', 'how-to-steps', 'salesrobot', 'faq', 'conclusion'],
  'listicle': ['tldr', 'intro', 'what-to-look-for', 'tools-list', 'salesrobot', 'faq', 'conclusion'],
  'strategy-guide': ['tldr', 'intro', 'why-it-matters', 'tips-list', 'salesrobot', 'faq', 'conclusion'],
};

function parseGscCsv(text: string): GscRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).map(line => {
    const [query, clicks, impressions, ctr, position] = line.split(',');
    return {
      query: (query ?? '').replace(/"/g, '').trim(),
      clicks: parseInt(clicks ?? '0'),
      impressions: parseInt(impressions ?? '0'),
      ctr: parseFloat((ctr ?? '0').replace('%', '')) / 100,
      position: parseFloat(position ?? '0'),
    };
  }).filter(r => r.query && r.impressions > 0);
}

function StatusDot({ status }: { status: PhaseStatus }) {
  const map: Record<PhaseStatus, string> = {
    pending: 'bg-gray-300',
    running: 'bg-blue-400 animate-pulse',
    done: 'bg-green-500',
    error: 'bg-red-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status]}`} />;
}

function FindingItem({ f }: { f: Finding }) {
  const dot = f.type === 'added' ? 'bg-green-500' : f.type === 'removed' ? 'bg-red-500' : 'bg-amber-400';
  return (
    <div className="flex gap-2 items-start text-xs text-gray-600 mb-1">
      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <span>{f.text}</span>
    </div>
  );
}

function H2DiffRow({ change, index }: { change: Brief['h2Changes'][0]; index: number }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 mb-2 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${change.isNew ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
          {change.isNew ? 'New H2' : `H2 #${index + 1}`}
        </span>
      </div>
      {change.old && (
        <div className="line-through text-gray-400 mb-1">{change.old}</div>
      )}
      <div className="font-medium text-gray-800">{change.next}</div>
      <div className="text-gray-500 mt-1">{change.reason}</div>
    </div>
  );
}

function SectionCard({
  section,
  isActive,
  onRegenerate,
  onEdit,
}: {
  section: SectionDraft;
  isActive: boolean;
  onRegenerate: (id: string, note: string) => void;
  onEdit: (id: string, html: string) => void;
}) {
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [editHtml, setEditHtml] = useState(section.html);

  const stateStyle: Record<SectionDraft['status'], string> = {
    pending: 'bg-gray-100 text-gray-500',
    flagged: 'bg-amber-50 text-amber-700',
    writing: 'bg-blue-50 text-blue-700',
    done: 'bg-green-50 text-green-700',
    skipped: 'bg-gray-50 text-gray-400',
  };

  const stateLabel: Record<SectionDraft['status'], string> = {
    pending: 'pending',
    flagged: 'will rewrite',
    writing: 'writing...',
    done: 'done',
    skipped: 'skipped',
  };

  return (
    <div className={`border rounded-lg mb-2 overflow-hidden text-sm ${isActive ? 'border-blue-300' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-white">
        <span className="font-medium text-gray-800 flex-1">{SECTION_LABELS[section.id] ?? section.id}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${stateStyle[section.status]}`}>
          {stateLabel[section.status]}
        </span>
      </div>

      {section.flagReason && section.status === 'flagged' && (
        <div className="px-3 py-1.5 bg-amber-50 text-xs text-amber-700 border-t border-amber-100">
          {section.flagReason}
        </div>
      )}

      {section.status === 'done' && section.html && (
        <>
          {editing ? (
            <div className="border-t border-gray-100">
              <textarea
                className="w-full p-3 text-xs font-mono bg-gray-50 border-0 resize-none"
                rows={8}
                value={editHtml}
                onChange={e => setEditHtml(e.target.value)}
              />
              <div className="flex gap-2 p-2 border-t border-gray-100">
                <button
                  className="text-xs px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
                  onClick={() => { onEdit(section.id, editHtml); setEditing(false); }}
                >
                  Save
                </button>
                <button
                  className="text-xs px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 bg-gray-50 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: section.html.slice(0, 300) + (section.html.length > 300 ? '...' : '') }}
            />
          )}

          {!editing && (
            <div className="flex gap-2 px-3 py-2 border-t border-gray-100">
              <button
                className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
                onClick={() => { setEditHtml(section.html); setEditing(true); }}
              >
                Edit
              </button>
              <input
                type="text"
                placeholder="Regenerate with note..."
                value={note}
                onChange={e => setNote(e.target.value)}
                className="flex-1 text-xs px-2 py-1 rounded border border-gray-200 bg-white"
                onKeyDown={e => { if (e.key === 'Enter' && note) { onRegenerate(section.id, note); setNote(''); } }}
              />
              <button
                className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
                onClick={() => { onRegenerate(section.id, note); setNote(''); }}
              >
                ↺
              </button>
            </div>
          )}
        </>
      )}

      {section.status === 'writing' && (
        <div className="px-3 py-2 border-t border-blue-100 bg-blue-50">
          <div className="text-xs text-blue-600 animate-pulse">Writing...</div>
          {section.html && (
            <div className="text-xs text-gray-500 mt-1 font-mono">{section.html.slice(-120)}</div>
          )}
        </div>
      )}
    </div>
  );
}


interface ReviewScreenProps {
  sections: SectionDraft[];
  brief: Brief;
  onEdit: (id: string, html: string) => void;
  onRegenerate: (id: string, note: string) => void;
  onBack: () => void;
  onPublish: () => void;
  pushStatus: 'idle' | 'pushing' | 'done' | 'error';
  pushResult: { slug: string; itemId: string } | null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '_$1_')
    .replace(/<li>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textToHtml(text: string): string {
  const lines = text.split('\n');
  let html = '';
  let inUl = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { if (inUl) { html += '</ul>\n'; inUl = false; } continue; }
    if (trimmed.startsWith('# ')) { html += `<h1>${trimmed.slice(2)}</h1>\n`; }
    else if (trimmed.startsWith('## ')) { html += `<h2>${trimmed.slice(3)}</h2>\n`; }
    else if (trimmed.startsWith('### ')) { html += `<h3>${trimmed.slice(4)}</h3>\n`; }
    else if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
      if (!inUl) { html += '<ul>\n'; inUl = true; }
      html += `<li>${trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>')}</li>\n`;
    } else {
      if (inUl) { html += '</ul>\n'; inUl = false; }
      const p = trimmed
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/_(.*?)_/g, '<em>$1</em>');
      html += `<p>${p}</p>\n`;
    }
  }
  if (inUl) html += '</ul>\n';
  return html;
}

function ReviewSection({
  section,
  onEdit,
  onRegenerate,
}: {
  section: SectionDraft;
  onEdit: (id: string, html: string) => void;
  onRegenerate: (id: string, note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [note, setNote] = useState('');

  const startEdit = () => {
    setEditText(htmlToText(section.html));
    setEditing(true);
  };

  const saveEdit = () => {
    onEdit(section.id, textToHtml(editText));
    setEditing(false);
  };

  return (
    <div className="mb-8 border-b border-gray-100 pb-8 last:border-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide flex-1">
          {SECTION_LABELS[section.id] ?? section.id}
        </span>
        {!editing && (
          <button onClick={startEdit} className="text-xs px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50">
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            className="w-full p-3 text-sm bg-gray-50 border border-gray-200 rounded-lg resize-none leading-relaxed"
            rows={Math.max(8, editText.split('\n').length + 2)}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            style={{ fontFamily: 'inherit' }}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800">Save</button>
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      ) : (
        <div
          className="prose prose-gray max-w-none text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: section.html }}
        />
      )}

      {!editing && (
        <div className="flex gap-2 mt-3">
          <input
            type="text"
            placeholder="Regenerate with note..."
            value={note}
            onChange={e => setNote(e.target.value)}
            className="flex-1 text-xs px-3 py-1.5 rounded border border-gray-200 bg-white"
            onKeyDown={e => { if (e.key === 'Enter' && note) { onRegenerate(section.id, note); setNote(''); } }}
          />
          <button
            onClick={() => { onRegenerate(section.id, note); setNote(''); }}
            className="text-xs px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
          >
            ↺ Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewScreen({ sections, brief, onEdit, onRegenerate, onBack, onPublish, pushStatus, pushResult }: ReviewScreenProps) {
  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
        <span className="text-sm font-semibold text-gray-800 flex-1">{brief.h1}</span>
        <span className="text-xs text-gray-400">{sections.filter(s => s.status === 'done').length} sections</span>
        {pushStatus === 'idle' && (
          <button
            onClick={onPublish}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
          >
            Push to Webflow as draft
          </button>
        )}
        {pushStatus === 'pushing' && (
          <span className="text-sm text-gray-500 animate-pulse">Pushing...</span>
        )}
        {pushStatus === 'done' && pushResult && (
          <span className="text-sm text-green-600">Published — /{pushResult.slug}</span>
        )}
        {pushStatus === 'error' && (
          <span className="text-sm text-red-500">Push failed</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 leading-tight">{brief.h1}</h1>
          {sections
            .filter(s => s.status === 'done' && s.html)
            .map(s => (
              <ReviewSection
                key={s.id}
                section={s}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
              />
            ))
          }
        </div>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const [toolName, setToolName] = useState('');
  const [blogType, setBlogType] = useState('tool-review');
  const [blogTitle, setBlogTitle] = useState('');
  const [mode, setMode] = useState<'new' | 'update'>('new');
  const [started, setStarted] = useState(false);

  const [p1Status, setP1Status] = useState<PhaseStatus>('pending');
  const [p2Status, setP2Status] = useState<PhaseStatus>('pending');
  const [p3Status, setP3Status] = useState<PhaseStatus>('pending');
  const [p4Status, setP4Status] = useState<PhaseStatus>('pending');

  const [research, setResearch] = useState<ResearchData | null>(null);
  const [gscRows, setGscRows] = useState<GscRow[]>([]);
  const [hasGsc, setHasGsc] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefApproved, setBriefApproved] = useState(false);
  // editingBrief state reserved for future inline brief editing
  const [reviewing, setReviewing] = useState(false);

  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [writing, setWriting] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle');
  const [pushResult, setPushResult] = useState<{ slug: string; itemId: string } | null>(null);
  const [error, setError] = useState('');

  // Update mode state
  const [postSearch, setPostSearch] = useState('');
  const [postResults, setPostResults] = useState<{id:string;name:string;slug:string;isDraft:boolean;h2s:string[];bodyHtml:string}[]>([]);
  const [selectedPost, setSelectedPost] = useState<{id:string;name:string;slug:string;h2s:string[];bodyHtml:string} | null>(null);
  const [fetchingPosts, setFetchingPosts] = useState(false);

  const gscRef = useRef<HTMLInputElement>(null);

  const handleGscUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const rows = parseGscCsv(text);
      setGscRows(rows);
      setHasGsc(rows.length > 0);
    };
    reader.readAsText(file);
  }, []);

  useEffect(() => {
    if (mode === 'update') searchPosts('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const searchPosts = useCallback(async (q: string) => {
    setFetchingPosts(true);
    setError('');
    try {
      const res = await fetch(`/api/studio/webflow-posts?search=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(`Webflow fetch failed: ${json.error ?? res.status}`);
        setPostResults([]);
        return;
      }
      const posts = json.posts ?? [];
      setPostResults(posts);
      if (posts.length === 0) setError(q ? `No blogs found matching "${q}" — try a shorter search term` : 'No blogs found in Webflow collection');
    } catch (e) {
      setError(`Search failed: ${e instanceof Error ? e.message : 'unknown'}`);
      setPostResults([]);
    } finally {
      setFetchingPosts(false);
    }
  }, []);

  const runResearch = useCallback(async () => {
    if (!toolName.trim()) { setError('Enter a tool name first'); return; }
    setError('');
    setStarted(true);

    const phases = [1, 2, 3] as const;
    const setters = [setP1Status, setP2Status, setP3Status];
    const researchAccum: Partial<ResearchData> = { toolName };

    for (let i = 0; i < phases.length; i++) {
      setters[i]('running');
      try {
        const res = await fetch('/api/studio/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName, blogType, phase: phases[i] }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        Object.assign(researchAccum, json.data);
        setters[i]('done');
      } catch (e) {
        setters[i]('error');
        setError(`Phase ${phases[i]} failed: ${e instanceof Error ? e.message : 'unknown'}`);
        return;
      }
    }

    setResearch(researchAccum as ResearchData);
    await runBrief(researchAccum as ResearchData, selectedPost?.h2s ?? []);
  }, [toolName, blogType]);

  const runBrief = useCallback(async (researchData: ResearchData, existingH2s: string[] = []) => {
    setP4Status('running');
    try {
      const res = await fetch('/api/studio/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName,
          blogType,
          blogTitle: blogTitle || selectedPost?.name || `${toolName} Review`,
          research: researchData,
          gscRows,
          hasGsc,
          existingH2s,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setBrief(json.brief);
      setP4Status('done');

      const sectionIds = BLOG_SECTIONS[blogType] ?? BLOG_SECTIONS['tool-review'];
      setSections(sectionIds.map(id => ({
        id,
        label: SECTION_LABELS[id] ?? id,
        status: 'pending',
        html: '',
      })));
    } catch (e) {
      setP4Status('error');
      setError(`Brief failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }, [toolName, blogType, blogTitle, gscRows, hasGsc]);

  const approveBrief = useCallback(() => {
    setBriefApproved(true);
  }, []);

  useEffect(() => {
    if (briefApproved && brief) {
      startWriting();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefApproved]);

  const startWriting = useCallback(async () => {
    if (!brief) return;
    setWriting(true);
    const sectionIds = BLOG_SECTIONS[blogType] ?? BLOG_SECTIONS['tool-review'];

    for (const sectionId of sectionIds) {
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'writing' } : s));

      try {
        const res = await fetch('/api/studio/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId,
            brief,
            toolName,
            blogType,
            existingSectionHtml: '',
          }),
        });

        if (!res.ok) throw new Error('Write failed');
        if (!res.body) throw new Error('No stream');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.delta?.text ?? parsed?.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                accumulated += delta;
                setSections(prev => prev.map(s =>
                  s.id === sectionId ? { ...s, html: accumulated } : s
                ));
              }
            } catch { /* skip malformed SSE lines */ }
          }
        }

        setSections(prev => prev.map(s =>
          s.id === sectionId ? { ...s, status: 'done', html: accumulated } : s
        ));
      } catch (e) {
        setSections(prev => prev.map(s =>
          s.id === sectionId ? { ...s, status: 'pending' } : s
        ));
        setError(`Section "${sectionId}" failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    setWriting(false);
  }, [brief, blogType, toolName]);

  const regenerateSection = useCallback(async (sectionId: string, note: string) => {
    if (!brief) return;
    const existing = sections.find(s => s.id === sectionId)?.html ?? '';
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'writing', html: existing } : s));

    try {
      const res = await fetch('/api/studio/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId,
          brief: { ...brief, _note: note },
          toolName,
          blogType,
          existingSectionHtml: existing,
        }),
      });

      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.delta?.text ?? '';
            if (delta) {
              accumulated += delta;
              setSections(prev => prev.map(s =>
                s.id === sectionId ? { ...s, html: accumulated } : s
              ));
            }
          } catch { /* skip */ }
        }
      }

      setSections(prev => prev.map(s =>
        s.id === sectionId ? { ...s, status: 'done', html: accumulated } : s
      ));
    } catch (e) {
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'done' } : s));
      setError(`Regen failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }, [brief, sections, toolName, blogType]);

  const editSection = useCallback((sectionId: string, html: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, html, status: 'done' } : s));
  }, []);

  const pushToWebflow = useCallback(async () => {
    if (!brief) return;
    setPushStatus('pushing');
    try {
      const res = await fetch('/api/studio/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, brief, blogType, existingItemId: selectedPost?.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPushResult({ slug: json.slug, itemId: json.itemId });
      setPushStatus('done');
    } catch (e) {
      setPushStatus('error');
      setError(`Push failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }, [sections, brief, blogType]);

  const doneSections = sections.filter(s => s.status === 'done').length;
  const allDone = sections.length > 0 && doneSections === sections.length;

  if (!started) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-lg">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">SERPent studio</h1>
          <p className="text-sm text-gray-500 mb-6">Research-first blog generation</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mode</label>
              <div className="flex gap-2">
                {(['new', 'update'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setSelectedPost(null); setPostResults([]); }}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${mode === m ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {m === 'new' ? 'New blog' : 'Update existing'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'update' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Find existing blog</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Search by title..."
                    value={postSearch}
                    onChange={e => setPostSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') searchPosts(postSearch); }}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={() => searchPosts(postSearch)}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                  >
                    {fetchingPosts ? '...' : 'Search'}
                  </button>
                </div>
                {postResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {postResults.map(post => (
                      <div
                        key={post.id}
                        onClick={() => { setSelectedPost(post); setToolName(post.name.split(' ')[0]); }}
                        className={`px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50 ${selectedPost?.id === post.id ? 'bg-blue-50' : ''}`}
                      >
                        <div className="text-sm font-medium text-gray-800">{post.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {post.isDraft ? 'Draft' : 'Published'} · {post.h2s.length} H2s · /{post.slug}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedPost && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="text-xs font-medium text-amber-800 mb-1">Selected: {selectedPost.name}</div>
                    <div className="text-xs text-amber-700">
                      Current H2s: {selectedPost.h2s.slice(0, 3).join(', ')}{selectedPost.h2s.length > 3 ? ` +${selectedPost.h2s.length - 3} more` : ''}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tool name</label>
              <input
                type="text"
                placeholder="e.g. PhantomBuster"
                value={toolName}
                onChange={e => setToolName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-400"
              />
            </div>

            {mode === 'new' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Blog type</label>
                <select
                  value={blogType}
                  onChange={e => setBlogType(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-400"
                >
                  {BLOG_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}

            {mode === 'new' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Working title <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder={`${toolName || 'PhantomBuster'} Review 2025`}
                  value={blogTitle}
                  onChange={e => setBlogTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-400"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                GSC data <span className="text-gray-400">(optional — .csv)</span>
              </label>
              <div
                className="border border-dashed border-gray-300 rounded-lg p-4 text-center text-sm text-gray-400 cursor-pointer hover:bg-gray-50"
                onClick={() => gscRef.current?.click()}
              >
                {hasGsc ? `${gscRows.length} keywords loaded` : 'Click to upload GSC export'}
              </div>
              <input ref={gscRef} type="file" accept=".csv" className="hidden" onChange={handleGscUpload} />
              {!hasGsc && (
                <p className="text-xs text-gray-400 mt-1">Without GSC data, H2s will be built from live SERP + PAA signals.</p>
              )}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onClick={runResearch}
              disabled={mode === 'update' && !selectedPost}
              className="w-full py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mode === 'update' ? 'Research + update' : 'Start research'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (reviewing && brief) {
    return (
      <ReviewScreen
        sections={sections}
        brief={brief}
        onEdit={editSection}
        onRegenerate={regenerateSection}
        onBack={() => setReviewing(false)}
        onPublish={pushToWebflow}
        pushStatus={pushStatus}
        pushResult={pushResult}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 text-sm">
        <span className="font-semibold text-gray-800">SERPent studio</span>
        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{toolName}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs ${mode === 'update' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
          {mode === 'update' ? 'Updating' : 'New blog'}
        </span>
        <span className="flex-1" />
        {error && <span className="text-xs text-red-500 max-w-xs truncate">{error}</span>}
        <button
          onClick={() => { setStarted(false); setError(''); setBrief(null); setBriefApproved(false); setSections([]); setResearch(null); setP1Status('pending'); setP2Status('pending'); setP3Status('pending'); setP4Status('pending'); setSelectedPost(null); setPostResults([]); setPostSearch(''); }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ← Back
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r border-gray-200 overflow-y-auto bg-white">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide flex-1">Research</span>
            <span className="text-xs text-gray-400">
              {[p1Status, p2Status, p3Status, p4Status].filter(s => s === 'done').length} / 4 phases
            </span>
          </div>

          <div className="p-3 space-y-2">
            {[
              { n: 1, label: 'Tool site + G2 + Capterra', status: p1Status, data: research ? [...(research.pricing ?? []), ...(research.features ?? [])] : [] },
              { n: 2, label: 'SERP + PAA signals' + (hasGsc ? ' + GSC' : ''), status: p2Status, data: research ? (research.serpH2s ?? []).map(h => ({ type: 'signal' as const, text: h })) : [] },
              { n: 3, label: 'Reddit signals', status: p3Status, data: research?.redditSignals ?? [] },
            ].map(phase => (
              <div key={phase.n} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-white">
                  <StatusDot status={phase.status} />
                  <span className="text-xs font-medium text-gray-700 flex-1">Phase {phase.n} — {phase.label}</span>
                  <span className="text-xs text-gray-400">{phase.status}</span>
                </div>
                {phase.status === 'done' && phase.data.length > 0 && (
                  <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                    {phase.data.slice(0, 5).map((f, i) => <FindingItem key={i} f={f} />)}
                  </div>
                )}
              </div>
            ))}

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-white">
                <StatusDot status={p4Status} />
                <span className="text-xs font-medium text-gray-700 flex-1">Phase 4 — Research brief</span>
                <span className="text-xs text-gray-400">{p4Status}</span>
              </div>

              {p4Status === 'done' && brief && !briefApproved && (
                <>
                  <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                    <div className="text-xs font-medium text-gray-700 mb-2">H1: {brief.h1}</div>
                    <div className="text-xs text-gray-500 mb-2 font-medium">H2 changes:</div>
                    {brief.h2Changes.map((c, i) => <H2DiffRow key={i} change={c} index={i} />)}
                    <div className="text-xs text-gray-500 mt-2">
                      <span className="font-medium">Keywords: </span>{brief.targetKeywords.join(', ')}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">SalesRobot angle: </span>{brief.salesRobotAngle}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">Pricing: </span>{brief.confirmedPricing}
                    </div>
                  </div>
                  <div className="flex gap-2 p-2 border-t border-gray-100">
                    <button
                      onClick={() => {}}
                      className="text-xs px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
                    >
                      Edit brief
                    </button>
                    <button
                      onClick={approveBrief}
                      className="text-xs px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800 flex-1"
                    >
                      Approve — start writing
                    </button>
                  </div>
                </>
              )}

              {briefApproved && (
                <div className="px-3 py-2 bg-green-50 border-t border-green-100 text-xs text-green-700">
                  Brief approved. Writing in progress.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-1/2 overflow-y-auto bg-gray-50">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide flex-1">Draft</span>
            {writing && <span className="text-xs text-blue-500 animate-pulse">Writing...</span>}
            {allDone && !writing && <span className="text-xs text-green-600">All sections done</span>}
            {!briefApproved && <span className="text-xs text-gray-400">Waiting for brief approval</span>}
          </div>

          <div className="p-3">
            {sections.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-12">
                Sections will appear after brief approval
              </div>
            ) : (
              sections.map(s => (
                <SectionCard
                  key={s.id}
                  section={s}
                  isActive={s.status === 'writing'}
                  onRegenerate={regenerateSection}
                  onEdit={editSection}
                />
              ))
            )}

            {allDone && !writing && (
              <div className="mt-4 border border-green-200 rounded-lg p-4 bg-green-50">
                <div className="text-xs text-green-700 mb-3 font-medium">All sections complete</div>
                <button
                  onClick={() => setReviewing(true)}
                  className="w-full py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
                >
                  Review & publish
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
