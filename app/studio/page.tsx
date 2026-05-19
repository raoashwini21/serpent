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
  'alternatives': ['tldr', 'intro', 'why-switch', 'alternatives-list', 'faq', 'conclusion'],
  'how-to-guide': ['tldr', 'intro', 'what-is', 'why-it-matters', 'how-to-steps', 'salesrobot', 'faq', 'conclusion'],
  'listicle': ['tldr', 'intro', 'what-to-look-for', 'tools-list', 'faq', 'conclusion'],
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

function H2DiffRow({ change, index, isUpdate = false }: { change: Brief['h2Changes'][0]; index: number; isUpdate?: boolean }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 mb-2 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${change.isNew || !isUpdate ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
          {!isUpdate ? `H2 ${index + 1}` : change.isNew ? 'New H2' : 'Updated H2'}
        </span>
      </div>
      {isUpdate && change.old && (
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

  const isFullUpdate = section.id === 'full-update';

  const stateLabel: Record<SectionDraft['status'], string> = {
    pending: 'pending',
    flagged: isFullUpdate ? 'will patch' : 'will rewrite',
    writing: isFullUpdate ? 'patching...' : 'writing...',
    done: 'done',
    skipped: isFullUpdate ? 'no changes needed' : 'skipped',
  };

  return (
    <div className={`border rounded-lg mb-2 overflow-hidden text-sm ${isActive ? 'border-blue-300' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-white">
        <span className="font-medium text-gray-800 flex-1">{SECTION_LABELS[section.id] ?? section.id}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${stateStyle[section.status]}`}>
          {stateLabel[section.status]}
        </span>
      </div>

      {section.flagReason && (section.status === 'flagged' || section.status === 'pending') && (
        <div className={`px-3 py-2 text-xs border-t ${section.status === 'flagged' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
          {section.id === 'full-update'
            ? (() => {
                const lines = section.flagReason.split('\n');
                const emptyIdx = lines.findIndex(l => l === '');
                const h2Lines = emptyIdx === -1 ? lines : lines.slice(0, emptyIdx);
                const footer = emptyIdx === -1 ? '' : lines.slice(emptyIdx + 1).join(' ');
                return (
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">H2 changes</div>
                    {h2Lines.map((line, i) => {
                      const parts = line.split('  →  ');
                      const heading = parts[0] ?? line;
                      const status = parts[1] ?? '';
                      const color = status === 'updated' ? 'text-amber-600' : status === 'will add' ? 'text-blue-600' : status === 'suggested' ? 'text-purple-500' : 'text-gray-400';
                      return (
                        <div key={i} className="flex items-center justify-between py-0.5 border-b border-amber-100 last:border-0">
                          <span className="text-xs text-gray-700 truncate mr-2">{heading}</span>
                          <span className={`text-xs flex-shrink-0 ${color}`}>{status}</span>
                        </div>
                      );
                    })}
                    {footer && <div className="text-xs text-gray-400 mt-2">{footer}</div>}
                  </div>
                );
              })()
            : section.flagReason
          }
        </div>
      )}

      {section.id === 'full-update' && section.html && section.status !== 'writing' && section.status !== 'done' && (
        <div className="border-t border-gray-100">
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">Current blog — scroll to preview</span>
            <span className="text-xs text-gray-400">{Math.round(section.html.replace(/<[^>]+>/g,' ').trim().split(/\s+/).length / 200)} min read</span>
          </div>
          <div
            className="px-3 py-2 prose prose-sm max-w-none text-xs max-h-48 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: section.html }}
          />
        </div>
      )}

      {section.status === 'done' && section.html && (
        <>
          {editing ? (
            <div className="border-t border-gray-100">
              <textarea
                className="w-full p-3 text-xs bg-gray-50 border-0 resize-none leading-relaxed"
                style={{ fontFamily: 'inherit' }}
                rows={8}
                value={editHtml}
                onChange={e => setEditHtml(e.target.value)}
              />
              <div className="flex gap-2 p-2 border-t border-gray-100">
                <button
                  className="text-xs px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
                  onClick={() => { onEdit(section.id, textToHtml(editHtml)); setEditing(false); }}
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
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 bg-gray-50 leading-relaxed">
              {(() => {
                const plain = section.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                return plain.length > 280 ? plain.slice(0, 280) + '...' : plain;
              })()}
            </div>
          )}

          {!editing && (
            <div className="flex gap-2 px-3 py-2 border-t border-gray-100">
              <button
                className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
                onClick={() => { setEditHtml(htmlToText(section.html)); setEditing(true); }}
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



function getFlagReason(sectionId: string, research: ResearchData, brief: { h2Changes: {old: string|null; next: string; reason: string; isNew: boolean}[] }): string {
  if (sectionId === 'pricing') {
    const changes = (research.pricing ?? []).filter(f => f.type !== 'signal');
    if (changes.length) return changes.map(c => c.text).slice(0, 2).join('; ');
  }
  if (sectionId === 'features') {
    const changes = (research.features ?? []).filter(f => f.type !== 'signal');
    if (changes.length) return changes.map(c => c.text).slice(0, 2).join('; ');
  }
  if (sectionId === 'faq') return 'New H2/PAA opportunities found';
  if (sectionId === 'tldr') return 'Update summary with latest findings';
  if (sectionId === 'salesrobot') return 'Refresh positioning angle';
  if (sectionId === 'conclusion') return 'Update verdict with new data';
  return 'Needs review';
}

function extractSectionHtml(bodyHtml: string, sectionId: string): string {
  if (!bodyHtml) return '';
  // Try SERPent-style <section id="..."> wrapper first
  try {
    const escaped = sectionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byId = new RegExp(`<section[^>]*id=["']${escaped}["'][^>]*>([\s\S]*?)<\/section>`, 'i');
    const idMatch = bodyHtml.match(byId);
    if (idMatch?.[1]?.trim()) return idMatch[1].trim();
  } catch { /* ignore */ }
  // For legacy blogs without section wrappers, return full body for first section
  // and empty for others — the full body is handled at the brief level
  return sectionId === 'intro' || sectionId === 'tldr' ? '' : '';
}

// For update mode — returns the complete blog body as-is for surgical editing
function getFullBodyForUpdate(bodyHtml: string): string {
  return bodyHtml ?? '';
}

interface ReviewScreenProps {
  sections: SectionDraft[];
  brief: Brief;
  mode: 'new' | 'update';
  blogType: string;
  onEdit: (id: string, html: string) => void;
  onRegenerate: (id: string, note: string) => void;
  onBack: () => void;
  onPublish: () => void;
  pushStatus: 'idle' | 'pushing' | 'done' | 'error';
  pushResult: { slug: string; itemId: string } | null;
}

// Pricing table — only for review/comparison blogs with confirmed pricing data
function buildPricingTable(confirmedPricing: string): string {
  if (!confirmedPricing || confirmedPricing === 'Contact for pricing') return '';
  const lines = confirmedPricing.split(',').map(s => s.trim()).filter(Boolean);
  if (lines.length < 2) return '';
  const rows = lines.map(line => {
    const match = line.match(/^(.+?)\s+\$?([\d.]+)\/mo/i);
    if (!match) return `<tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px">${line}</td><td></td></tr>`;
    return `<tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:500">${match[1]}</td><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6C5CE7;font-weight:600">$${match[2]}/mo</td></tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:16px 0;font-family:inherit">
<thead><tr style="background:#6C5CE7"><th style="padding:10px 14px;text-align:left;color:#fff;font-size:13px;font-weight:600">Plan</th><th style="padding:10px 14px;text-align:left;color:#fff;font-size:13px;font-weight:600">Price</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
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
  mode,
  onEdit,
  onRegenerate,
}: {
  section: SectionDraft;
  mode: 'new' | 'update';
  onEdit: (id: string, html: string) => void;
  onRegenerate: (id: string, note: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [note, setNote] = useState('');

  const startEdit = () => {
    setEditText(htmlToText(section.html));
    setIsEditing(true);
  };

  const saveEdit = () => {
    onEdit(section.id, textToHtml(editText));
    setIsEditing(false);
  };

  return (
    <div className="mb-8 border-b border-gray-100 pb-8 last:border-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide flex-1">
          {SECTION_LABELS[section.id] ?? section.id}
        </span>
        {!isEditing ? (
          <button onClick={startEdit} className="text-xs px-3 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50">
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={saveEdit} className="text-xs px-3 py-1 rounded bg-gray-900 text-white hover:bg-gray-800">Save</button>
            <button onClick={() => setIsEditing(false)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">Cancel</button>
          </div>
        )}
      </div>

      {isEditing ? (
        <textarea
          className="w-full text-sm leading-relaxed border border-blue-200 rounded-lg p-3 bg-blue-50 outline-none resize-none"
          style={{ fontFamily: 'inherit', minHeight: '200px' }}
          rows={Math.max(6, editText.split('\n').length + 2)}
          value={editText}
          onChange={e => setEditText(e.target.value)}
          autoFocus
        />
      ) : (
        <div
          className="prose prose-gray max-w-none text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: section.html }}
        />
      )}

      {!isEditing && (
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


function FullBlogEditor({
  section,
  onEdit,
  onRegenerate,
}: {
  section: SectionDraft;
  onEdit: (id: string, html: string) => void;
  onRegenerate: (id: string, note: string) => void;
}) {
  const editRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [note, setNote] = useState('');
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [altText, setAltText] = useState('');

  const startEdit = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (editRef.current) {
        editRef.current.innerHTML = section.html;
        editRef.current.focus();
        // Wire up image click handlers
        editRef.current.querySelectorAll('img').forEach(img => {
          img.style.cursor = 'pointer';
          img.addEventListener('click', (e) => {
            e.stopPropagation();
            setSelectedImg(img);
            setAltText(img.alt || '');
          });
        });
        // Click outside image deselects
        editRef.current.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).tagName !== 'IMG') {
            setSelectedImg(null);
          }
        });
      }
    }, 30);
  };

  const saveEdit = () => {
    if (editRef.current) onEdit(section.id, editRef.current.innerHTML);
    setIsEditing(false);
    setSelectedImg(null);
  };

  const deleteSelectedImg = () => {
    if (selectedImg) {
      selectedImg.remove();
      setSelectedImg(null);
    }
  };

  const applyAltText = () => {
    if (selectedImg) {
      selectedImg.alt = altText;
      selectedImg.title = altText;
    }
  };

  const addLink = () => {
    let url = window.prompt('Enter URL:');
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
      url = 'https://' + url;
    }
    document.execCommand('createLink', false, url);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editRef.current) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/studio/upload-image', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const altName = file.name.replace(/\.[^.]+$/, '').replace(/-|_/g, ' ');
      document.execCommand('insertHTML', false, `<img src="${json.url}" alt="${altName}" title="${altName}" style="max-width:100%;height:auto;border-radius:8px;margin:12px 0;cursor:pointer" />`);
      // Wire click on newly inserted image
      setTimeout(() => {
        editRef.current?.querySelectorAll('img').forEach(img => {
          img.style.cursor = 'pointer';
          img.onclick = (e) => { e.stopPropagation(); setSelectedImg(img); setAltText(img.alt || ''); };
        });
      }, 100);
    } catch (err) {
      alert('Image upload failed: ' + (err instanceof Error ? err.message : 'unknown'));
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  return (
    <div>
      {isEditing && (
        <div className="mb-3 sticky top-16 z-10 space-y-1">
          <div className="flex items-center gap-1 p-2 bg-gray-50 border border-gray-200 rounded-lg">
            <button onClick={() => document.execCommand('bold')} className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 font-bold">B</button>
            <button onClick={() => document.execCommand('italic')} className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 italic">I</button>
            <button onClick={addLink} className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50">🔗 Link</button>
            <button onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} className="text-xs px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40">
              {uploadingImage ? '...' : '🖼 Add image'}
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <span className="flex-1" />
            <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800">Save</button>
            <button onClick={() => { setIsEditing(false); setSelectedImg(null); }} className="text-xs px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50">Cancel</button>
          </div>
          {selectedImg && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-xs text-amber-700 font-medium flex-shrink-0">Selected image:</span>
              <input
                type="text"
                value={altText}
                onChange={e => setAltText(e.target.value)}
                placeholder="Alt text..."
                className="flex-1 text-xs px-2 py-1 rounded border border-amber-200 bg-white"
              />
              <button
                onClick={applyAltText}
                className="text-xs px-2 py-1 rounded border border-amber-200 bg-white hover:bg-amber-50 text-amber-700"
              >
                Apply alt
              </button>
              <button
                onClick={deleteSelectedImg}
                className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600"
              >
                Delete image
              </button>
            </div>
          )}
        </div>
      )}

      {isEditing ? (
        <div
          ref={editRef}
          contentEditable
          suppressContentEditableWarning
          className="prose prose-gray max-w-none text-sm leading-relaxed outline-none border border-blue-200 rounded-lg p-4 bg-blue-50 min-h-96"
        />
      ) : (
        <div
          className="prose prose-gray max-w-none text-sm leading-relaxed serpent-review"
          dangerouslySetInnerHTML={{ __html: section.html }}
        />
      )}
      <style>{`
        .serpent-review h2[data-serpent-changed="true"] {
          background: #f0fdf4;
          border-left: 3px solid #22c55e;
          padding-left: 10px;
          margin-left: -13px;
        }
        .serpent-review h2[data-serpent-changed="true"]::after {
          content: " ✓ updated";
          font-size: 11px;
          color: #16a34a;
          font-weight: normal;
          margin-left: 8px;
        }
        .serpent-review h2[data-serpent-added="true"] {
          background: #eff6ff;
          border-left: 3px solid #3b82f6;
          padding-left: 10px;
          margin-left: -13px;
        }
        .serpent-review h2[data-serpent-added="true"]::after {
          content: " + new section";
          font-size: 11px;
          color: #2563eb;
          font-weight: normal;
          margin-left: 8px;
        }
      `}</style>

      <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
        {!isEditing && (
          <button onClick={startEdit} className="text-xs px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50">
            Edit inline
          </button>
        )}
        <input
          type="text"
          placeholder="Regenerate specific part with note..."
          value={note}
          onChange={e => setNote(e.target.value)}
          className="flex-1 text-xs px-3 py-1.5 rounded border border-gray-200 bg-white"
          onKeyDown={e => { if (e.key === 'Enter' && note) { onRegenerate(section.id, note); setNote(''); } }}
        />
        <button
          onClick={() => { onRegenerate(section.id, note); setNote(''); }}
          className="text-xs px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
        >
          ↺ Re-patch
        </button>
      </div>
    </div>
  );
}

function ReviewScreen({ sections, brief, mode, blogType, onEdit, onRegenerate, onBack, onPublish, pushStatus, pushResult }: ReviewScreenProps) {
  const [copied, setCopied] = useState(false);

  const copyForGoogleDocs = async () => {
    // Inject pricing table into pricing section if review/comparison
    const needsTable = ['tool-review', 'tool-comparison'].includes(blogType);
    const table = needsTable ? buildPricingTable(brief.confirmedPricing) : '';

    const fullHtml = sections
      .filter(s => (s.status === 'done' || s.status === 'skipped') && s.html)
      .map(s => {
        let html = s.html;
        if (s.id === 'pricing' && table) html += table;
        return html;
      })
      .join('\n');

    const blob = new Blob(
      [`<html><body><h1>${brief.h1}</h1>${fullHtml}</body></html>`],
      { type: 'text/html' }
    );
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': blob })
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: copy plain text
      const text = `${brief.h1}\n\n` + sections
        .filter(s => (s.status === 'done' || s.status === 'skipped') && s.html)
        .map(s => s.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
        .join('\n\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
        <span className="text-sm font-semibold text-gray-800 flex-1 truncate">{brief.h1}</span>
        <span className="text-xs text-gray-400 flex-shrink-0">{sections.filter(s => s.status === 'done' || s.status === 'skipped').length} sections</span>

        {mode === 'new' ? (
          <button
            onClick={copyForGoogleDocs}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex-shrink-0"
          >
            {copied ? '✓ Copied!' : 'Copy for Google Docs'}
          </button>
        ) : (
          <>
            {pushStatus === 'idle' && (
              <button onClick={onPublish} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 flex-shrink-0">
                Push to Webflow as draft
              </button>
            )}
            {pushStatus === 'pushing' && <span className="text-sm text-gray-500 animate-pulse">Pushing...</span>}
            {pushStatus === 'done' && pushResult && <span className="text-sm text-green-600">Draft saved — /{pushResult.slug}</span>}
            {pushStatus === 'error' && <span className="text-sm text-red-500">Push failed</span>}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 leading-tight">{brief.h1}</h1>
          <p className="text-xs text-gray-400 mb-4">
            {mode === 'new'
              ? 'Click "Copy for Google Docs" to paste with full formatting intact.'
              : 'Edit any section inline. Add links with the 🔗 button. Push when ready.'}
          </p>
          {mode === 'update' && (
            <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              ℹ️ Images and links from the original blog are preserved in unchanged sections. You can see and edit them inline below.
            </div>
          )}
          {sections
            .filter(s => (s.status === 'done' || s.status === 'skipped') && s.html)
            .map(s => (
              <ReviewSection
                key={s.id}
                section={s}
                mode={mode}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
              />
            ))
          }
          {mode === 'new' && (
            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-center">
              <button
                onClick={copyForGoogleDocs}
                className="px-6 py-3 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
              >
                {copied ? '✓ Copied with formatting!' : 'Copy full blog for Google Docs'}
              </button>
            </div>
          )}
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
  const [p1bStatus, setP1bStatus] = useState<PhaseStatus>('pending');
  const [p3aStatus, setP3aStatus] = useState<PhaseStatus>('pending');
  const [p3bStatus, setP3bStatus] = useState<PhaseStatus>('pending');

  const [research, setResearch] = useState<ResearchData | null>(null);
  const [gscRows, setGscRows] = useState<GscRow[]>([]);
  const [hasGsc, setHasGsc] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefApproved, setBriefApproved] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [writing, setWriting] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle');
  const [pushResult, setPushResult] = useState<{ slug: string; itemId: string } | null>(null);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

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

    const phases = [
      { id: '1a', setter: setP1Status,  label: '1a' },
      { id: '1b', setter: setP1bStatus, label: '1b' },
      { id: 2,    setter: setP2Status,  label: '2'  },
      { id: '3a', setter: setP3aStatus, label: '3a' },
      { id: '3b', setter: setP3bStatus, label: '3b' },
    ] as const;

    const researchAccum: Partial<ResearchData> = { toolName };

    for (const phase of phases) {
      phase.setter('running');
      try {
        const res = await fetch('/api/studio/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolName, blogType, phase: phase.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        Object.assign(researchAccum, json.data);
        phase.setter('done');
      } catch (e) {
        phase.setter('error');
        setError(`Phase ${phase.label} failed: ${e instanceof Error ? e.message : 'unknown'}`);
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

      if (mode === 'update' && selectedPost?.bodyHtml) {
        const pricingChanged = (researchData.pricing ?? []).some(f => f.type === 'changed' || f.type === 'removed' || f.type === 'added');
        const featuresChanged = (researchData.features ?? []).some(f => f.type === 'added' || f.type === 'removed');
        const hasNewH2s = json.brief.h2Changes.some((h: {isNew: boolean}) => h.isNew);
        const hasRedditSignals = (researchData.redditSignals ?? []).length > 0;

        // Split existing blog into sections by H2 headings
        const bodyHtml = selectedPost.bodyHtml;
        const h2SplitRegex = /(?=<h2[^>]*>)/gi;
        const rawChunks = bodyHtml.split(h2SplitRegex);
        // First chunk is intro — strip any TL;DR block if it exists before first H2
        let introChunk = rawChunks[0] ?? '';
        const sectionChunks = rawChunks.slice(1);
        // If intro chunk contains a TL;DR heading, move it to sectionChunks
        // and keep only the actual intro paragraphs
        if (/<h2[^>]*>.*?tl;?dr.*?<\/h2>/i.test(introChunk)) {
          const tldrMatch = introChunk.match(/(<h2[^>]*>.*?tl;?dr.*?<\/h2>[\s\S]*)/i);
          if (tldrMatch) {
            sectionChunks.unshift(tldrMatch[1]);
            introChunk = introChunk.slice(0, tldrMatch.index);
          }
        }

        // Map each chunk to a section id based on H2 content
        const chunkMap: Record<string, string> = {};
        chunkMap['intro'] = introChunk;
        for (const chunk of sectionChunks) {
          const h2Text = (chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').toLowerCase();
          if (/tl;?dr|tldr/.test(h2Text)) chunkMap['tldr'] = chunk;
          else if (/what is|who is/.test(h2Text)) chunkMap['what-is'] = chunk;
          else if (/feature|what does|capabilit/.test(h2Text)) chunkMap['features'] = chunk;
          else if (/pric|cost|how much/.test(h2Text)) chunkMap['pricing'] = chunk;
          else if (/worth|pros|cons|is it/.test(h2Text)) chunkMap['pros-cons'] = chunk;
          else if (/salesrobot|how can salesrobot/.test(h2Text)) chunkMap['salesrobot'] = chunk;
          else if (/faq|frequently|question/.test(h2Text)) chunkMap['faq'] = chunk;
          else if (/conclusion/.test(h2Text)) chunkMap['conclusion'] = chunk;
          else if (/why switch|why look/.test(h2Text)) chunkMap['why-switch'] = chunk;
          else if (/verdict|triumphs|final/.test(h2Text)) chunkMap['conclusion'] = chunkMap['conclusion'] ? chunkMap['conclusion'] + chunk : chunk;
          else {
            // Preserve unrecognised sections — they are original content (reviews, how-to-use etc.)
            // Store by index so they don't overwrite each other
            const key = 'preserved-' + Object.keys(chunkMap).filter(k => k.startsWith('preserved-')).length;
            chunkMap[key] = chunk;
          }
        }

        // Flag sections that need changes
        const salesrobotSectionExists = !!chunkMap['salesrobot'];

        // Build sections list — include recognised sections + preserved originals
        const preservedKeys = Object.keys(chunkMap).filter(k => k.startsWith('preserved-'));
        const preservedSections = preservedKeys.map((key, i) => {
          const h2Text = (chunkMap[key].match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
          return {
            id: key,
            label: h2Text.slice(0, 60) || 'Original section',
            status: 'skipped' as const,
            html: chunkMap[key],
          };
        });

        const mainSections = sectionIds.map(id => {
          const existingHtml = chunkMap[id] ?? '';
          const isFlagged =
            (id === 'pricing' && pricingChanged) ||
            (id === 'features' && featuresChanged) ||
            (id === 'tldr' && (pricingChanged || featuresChanged)) ||
            (id === 'salesrobot' && !preservedSections.some(p =>
            p.html.toLowerCase().includes('salesrobot') &&
            p.html.toLowerCase().includes('alternative')
          )) ||
            (id === 'conclusion' && pricingChanged) ||
            (id === 'faq' && hasNewH2s);
          const isNew = !existingHtml && id !== 'intro';

          return {
            id,
            label: SECTION_LABELS[id] ?? id,
            status: isNew ? 'pending' as const : isFlagged ? 'flagged' as const : 'skipped' as const,
            flagReason: isFlagged
              ? id === 'salesrobot' ? 'Always updated with latest SalesRobot features'
              : id === 'pricing' ? 'Pricing changes found'
              : id === 'features' ? 'Feature changes found'
              : id === 'tldr' ? 'Summary needs updating'
              : id === 'faq' ? 'New H2 opportunities'
              : 'Update needed'
              : isNew ? 'New section — will be written'
              : undefined,
            html: existingHtml,
          };
        });

        // Insert preserved sections before SalesRobot/FAQ/Conclusion
        const insertBefore = ['salesrobot', 'faq', 'conclusion'];
        const insertIdx = mainSections.findIndex(s => insertBefore.includes(s.id));
        const allSections = insertIdx >= 0
          ? [...mainSections.slice(0, insertIdx), ...preservedSections, ...mainSections.slice(insertIdx)]
          : [...mainSections, ...preservedSections];

        setSections(allSections);

        // Add warning about images/links
        const hasImages = bodyHtml.includes('<img');
        const hasLinks = bodyHtml.includes('<a href');
        if (hasImages || hasLinks) {
          setInfoMsg(
            `Images${hasLinks ? ' and links' : ''} from the original blog are preserved in unchanged sections. They will appear in the final review.`
          );
        }

      } else {
        // Match each section to its brief H2 suggestion for the label
        const h2Map: Record<string, string> = {};
        const sectionToKeyword: Record<string, string[]> = {
          'what-is':    ['what is', 'what'],
          'features':   ['feature', 'capabilit', 'what does', 'key'],
          'pricing':    ['pric', 'cost', 'plan'],
          'pros-cons':  ['worth', 'pros', 'cons', 'honest'],
          'overview':   ['overview'],
          'comparison': ['vs', 'compar'],
          'salesrobot': ['salesrobot', 'help'],
          'faq':        ['faq', 'frequently', 'question'],
          'conclusion': ['conclusion'],
          'why-switch': ['switch', 'why', 'alternative'],
          'alternatives-list': ['alternative', 'best'],
          'tools-list': ['best', 'top', 'tool'],
          'tips-list':  ['tip', 'strateg'],
          'how-to-steps': ['how to', 'step', 'guide'],
        };
        for (const [sId, keywords] of Object.entries(sectionToKeyword)) {
          const match = json.brief.h2Changes.find((h: {next: string}) =>
            keywords.some(kw => h.next.toLowerCase().includes(kw))
          );
          if (match) h2Map[sId] = match.next;
        }
        setSections(sectionIds.map(id => ({
          id,
          label: SECTION_LABELS[id] ?? id,
          status: 'pending',
          html: '',
          flagReason: h2Map[id] ? `H2: "${h2Map[id]}"` : undefined,
        })));
      }
    } catch (e) {
      setP4Status('error');
      setError(`Brief failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }, [toolName, blogType, blogTitle, gscRows, hasGsc, mode, selectedPost]);

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

    // Update mode: rewrite flagged sections, skip unchanged ones
    // New blog mode: write all sections fresh
    const sectionsToWrite = mode === 'update'
      ? sections.filter(s => s.status === 'flagged' || s.status === 'pending').map(s => s.id)
      : sectionIds;

    for (const sectionId of sectionsToWrite) {
      const currentSection = sections.find(s => s.id === sectionId);
      if (!currentSection) continue;
      // In update mode, skipped sections keep existing HTML — mark as done immediately
      if (mode === 'update' && currentSection.status === 'skipped' && currentSection.html) {
        setSections(prev => prev.map(s => s.id === sectionId ? { ...s, status: 'done' } : s));
        continue;
      }

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
            existingSectionHtml: currentSection?.html ?? '',
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

        // If section came back empty, mark as pending so writer knows
        if (!accumulated.trim()) {
          setSections(prev => prev.map(s =>
            s.id === sectionId ? { ...s, status: 'pending', flagReason: 'Returned empty — regenerate with a note' } : s
          ));
        } else {
          setSections(prev => prev.map(s =>
            s.id === sectionId ? { ...s, status: 'done', html: accumulated } : s
          ));
        }
      } catch (e) {
        setSections(prev => prev.map(s =>
          s.id === sectionId ? { ...s, status: 'pending', flagReason: 'Failed — click regenerate' } : s
        ));
        setError(`Section "${sectionId}" failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    setWriting(false);
  }, [brief, blogType, toolName, mode, sections]);

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

  const doneSections = sections.filter(s => s.status === 'done' || s.status === 'skipped').length;
  const allDone = sections.length > 0 && doneSections === sections.length && !writing && briefApproved;

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
                        onClick={() => {
                          setSelectedPost(post);
                          // Extract tool name from slug — most reliable source
                          // slug is like 'ongage-review' or 'phantombuster-alternatives'
                          const stopWords = new Set(['review', 'alternative', 'alternatives', 'vs', 'best', 'top', 'how', 'to', 'guide', 'comparison', 'in', 'depth', 'the', 'a', 'an', 'and', 'or', 'for', 'is', 'are', 'why', 'what', 'does', 'do', 'can', 'should', 'will', 'with', 'without', 'pricing', 'cost', 'free', 'trial', 'tips', 'tools', 'tool', 'platform', 'software', 'app', 'updated', 'complete', 'ultimate', 'comprehensive']);
                          const slugWords = post.slug.split('-').filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()));
                          const fromSlug = slugWords[0] ?? '';
                          // Capitalise first letter
                          const toolGuess = fromSlug.charAt(0).toUpperCase() + fromSlug.slice(1);
                          setToolName(toolGuess);
                        }}
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
        mode={mode}
        blogType={blogType}
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
        {infoMsg && !error && <span className="text-xs text-blue-500 max-w-xs truncate">ℹ️ {infoMsg}</span>}
        <button
          onClick={() => { setStarted(false); setError(''); setInfoMsg(''); setBrief(null); setBriefApproved(false); setSections([]); setResearch(null); setP1Status('pending'); setP2Status('pending'); setP3Status('pending'); setP4Status('pending'); setSelectedPost(null); setPostResults([]); setPostSearch(''); }}
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
              {[p1Status, p1bStatus, p2Status, p3aStatus, p3bStatus, p4Status].filter(s => s === 'done').length} / 6 phases
            </span>
          </div>

          <div className="p-3 space-y-2">
            {[
              { n: '1a', label: 'Pricing + features', status: p1Status,  data: research ? [...(research.pricing ?? []), ...(research.features ?? [])] : [] },
              { n: '1b', label: 'G2 + Capterra reviews', status: p1bStatus, data: research ? (research.reviewSignals ?? []) : [] },
              { n: '2',  label: 'SERP + PAA' + (hasGsc ? ' + GSC' : ''), status: p2Status, data: research ? (research.serpH2s ?? []).map(h => ({ type: 'signal' as const, text: h })) : [] },
              { n: '3a', label: 'Reddit signals', status: p3aStatus, data: research?.redditSignals ?? [] },
              { n: '3b', label: 'YouTube signals', status: p3bStatus, data: research?.youtubeSignals ?? [] },
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
                    {editingBrief ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">H1</label>
                          <input
                            className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 bg-white"
                            value={brief.h1}
                            onChange={e => setBrief(b => b ? { ...b, h1: e.target.value } : b)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">Primary keyword</label>
                          <input
                            className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 bg-white"
                            value={brief.targetKeywords[0] ?? ''}
                            onChange={e => setBrief(b => b ? { ...b, targetKeywords: [e.target.value, ...(b.targetKeywords.slice(1))] } : b)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">Confirmed pricing</label>
                          <input
                            className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 bg-white"
                            value={brief.confirmedPricing}
                            onChange={e => setBrief(b => b ? { ...b, confirmedPricing: e.target.value } : b)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-0.5 block">SalesRobot angle</label>
                          <textarea
                            className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 bg-white resize-none"
                            rows={2}
                            value={brief.salesRobotAngle}
                            onChange={e => setBrief(b => b ? { ...b, salesRobotAngle: e.target.value } : b)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">H2 changes</label>
                          {brief.h2Changes.map((c, i) => (
                            <div key={i} className="mb-1.5">
                              <input
                                className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 bg-white"
                                value={c.next}
                                onChange={e => setBrief(b => b ? {
                                  ...b,
                                  h2Changes: b.h2Changes.map((h, j) => j === i ? { ...h, next: e.target.value } : h)
                                } : b)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Title</div>
                            <div className="text-xs font-medium text-gray-800">{brief.h1}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Target keywords</div>
                            <div className="flex flex-wrap gap-1">
                              {brief.targetKeywords.map((k, i) => (
                                <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{k}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Confirmed pricing</div>
                            <div className="text-xs text-gray-700">{brief.confirmedPricing}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Confirmed features</div>
                            <div className="text-xs text-gray-700">{(brief.confirmedFeatures ?? []).join(', ') || 'None found'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top user pain points</div>
                            <div className="space-y-0.5">
                              {(brief.topPainPoints ?? []).map((p, i) => (
                                <div key={i} className="text-xs text-gray-700 flex gap-1.5"><span className="text-amber-500">•</span>{p}</div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">SalesRobot angle</div>
                            <div className="text-xs text-gray-700">{brief.salesRobotAngle}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{mode === 'update' ? 'Heading changes' : 'Suggested headings'}</div>
                            {brief.h2Changes.map((c, i) => <H2DiffRow key={i} change={c} index={i} isUpdate={mode === 'update'} />)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 p-2 border-t border-gray-100">
                    <button
                      onClick={() => setEditingBrief(e => !e)}
                      className="text-xs px-3 py-1.5 rounded border border-gray-200 bg-white hover:bg-gray-50"
                    >
                      {editingBrief ? 'Done editing' : 'Edit brief'}
                    </button>
                    <button
                      onClick={approveBrief}
                      className="text-xs px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800 flex-1"
                    >
                      {mode === 'update' ? 'Apply fixes to flagged sections' : 'Approve — start writing'}
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
            {!briefApproved && <span className="text-xs text-gray-400">{mode === 'update' ? 'Review flagged sections below' : 'Waiting for brief approval'}</span>}
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
