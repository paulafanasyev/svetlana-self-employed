/**
 * Document rendering: {{var}} interpolation → sanitized HTML preview + DOCX.
 *
 * Why no server-side PDF: pdf-lib can only embed TTF/OTF font files, and no
 * Cyrillic-capable font is available in this environment; the base-14
 * Helvetica encoding cannot represent Russian letters (it would silently
 * corrupt the document). Rather than ship a broken PDF generator, PDF export
 * happens through the browser's print pipeline from /documents/:id/print
 * (print CSS included). DOCX is generated server-side and is fully Cyrillic-
 * correct (docx stores text as XML — no font embedding required).
 *
 * Security: values are HTML-escaped before interpolation, so user data can
 * never inject markup into the document body (stored XSS via preview).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { config } from '../config.js';

const DOCS_DIR = resolve(config.STORAGE_DIR, 'documents');

/** HTML-escape user values before interpolation (prevents markup injection). */
export function escape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tiny {{var}} renderer with #if blocks, over already-escaped values. */
export function renderTemplate(html, data = {}) {
  const escaped = {};
  for (const [k, v] of Object.entries(data)) {
    escaped[k] = typeof v === 'string' ? escape(v) : v;
  }
  const withIfs = html.replace(
    /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, key, body) => (escaped[key] ? body : '')
  );
  return withIfs.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const v = escaped[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

export const docStyles = `
  <style>
    body { font-family: -apple-system, 'Segoe UI', 'PT Sans', 'Noto Sans', sans-serif; color: #1a1a2e; line-height: 1.6; margin: 0; }
    .doc { max-width: 720px; margin: 0 auto; padding: 40px; }
    h1 { font-size: 22px; margin: 0 0 16px; color: #4c1d95; }
    h2 { font-size: 16px; margin: 24px 0 8px; color: #312e81; }
    p { margin: 0 0 12px; text-align: justify; }
    .muted { color: #6b7280; font-size: 13px; }
    table.kv { border-collapse: collapse; width: 100%; margin: 12px 0; }
    table.kv th, table.kv td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
    table.kv th { background: #f3f4f6; width: 34%; }
    table.sign { border-collapse: collapse; width: 100%; margin-top: 40px; }
    table.sign td { border-top: 1px solid #9ca3af; padding-top: 12px; width: 50%; vertical-align: top; }
    .offer { white-space: pre-wrap; background: #f8fafc; border-left: 3px solid #7c3aed; padding: 12px 16px; }
    @media print {
      body { margin: 0; }
      .doc { padding: 0; max-width: none; }
      .no-print { display: none !important; }
    }
  </style>
`;

export function wrapDocumentHtml(bodyHtml, title, { printable = false } = {}) {
  const toolbar = printable
    ? `<div class="no-print" style="position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 16px;display:flex;gap:8px;align-items:center">
        <strong>${escape(title)}</strong>
        <button onclick="window.print()" style="margin-left:auto;background:#7c3aed;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer">Сохранить в PDF / Печать</button>
      </div>`
    : '';
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)}</title>${docStyles}</head>
    <body>${toolbar}<div class="doc">${bodyHtml}</div></body></html>`;
}

export function ensureDocsDir() {
  mkdirSync(DOCS_DIR, { recursive: true });
  return DOCS_DIR;
}

/** HTML → plain text with structure preserved, for DOCX export. */
function htmlToText(html) {
  return html
    .replace(/<\/(h1|h2|h3|p|div|tr|li|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<td[^>]*>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Real DOCX file written to STORAGE_DIR/documents/<id>.docx. */
export async function renderDocx({ id, title, bodyHtml }) {
  ensureDocsDir();
  const path = join(DOCS_DIR, `${id}.docx`);
  const lines = htmlToText(bodyHtml).split('\n');

  const paragraphs = lines.map((line, i) => {
    const isTitle = i === 0 || /^#{1,3}\s/.test(line);
    const text = line.replace(/^#{1,3}\s/, '');
    if (!text.trim()) return new Paragraph({ children: [new TextRun('')] });
    return new Paragraph({
      children: [new TextRun({ text, size: 22 })],
      heading: isTitle ? HeadingLevel.HEADING_1 : undefined,
      spacing: { after: 120 },
    });
  });

  const doc = new Document({
    creator: 'Мир Самозанятых / Светлана',
    title,
    sections: [{ children: [new Paragraph({ text: title, heading: HeadingLevel.TITLE }), ...paragraphs] }],
  });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(path, buf);
  return path;
}
