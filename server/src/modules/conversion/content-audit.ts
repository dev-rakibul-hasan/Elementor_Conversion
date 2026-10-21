import type { DIRDocument } from '../dir/types.js';
import { convertDIRToElementor } from '../elementor/generator.js';

function normalize(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function inventory(elements: any[]) {
  const counts = new Map<string, number>();
  const text: string[] = [];
  const urls: string[] = [];
  const settings = (value: any, key = '', media = false) => {
    if (typeof value === 'string' && ['title', 'text', 'editor', 'tab_title', 'tab_content', 'html'].includes(key)) {
      const normalized = normalize(value);
      if (normalized) text.push(normalized);
    }
    media = key === 'link' ? false : media || /image|gallery/.test(key);
    if (value && typeof value === 'object') {
      if (typeof value.url === 'string' && value.url && media) urls.push(value.url);
      for (const [name, child] of Object.entries(value)) settings(child, name, media);
    }
  };
  const visit = (element: any) => {
    if (element.widgetType) counts.set(element.widgetType, (counts.get(element.widgetType) || 0) + 1);
    settings(element.settings);
    for (const child of element.elements || []) visit(child);
  };
  elements.forEach(visit);
  return { counts, text, urls };
}

/** Structural/content fidelity only. This does not compare rendered screenshots. */
export function auditDIRContent(dir: DIRDocument, document: any): void {
  if (dir.pages.length !== 1) throw new Error('Exactly one DIR page is supported per conversion');
  const expected = convertDIRToElementor(dir).document;
  if (!Array.isArray(document?.content) || document.content.length !== expected.content.length) {
    throw new Error('Elementor section count differs from the DIR');
  }
  const before = inventory(expected.content);
  const after = inventory(document.content);
  for (const [widget, count] of before.counts) {
    if ((after.counts.get(widget) || 0) < count) throw new Error(`Elementor output is missing required ${widget} widgets`);
  }
  const actualText = after.text.join(' ');
  for (const text of before.text) {
    if (!actualText.includes(text)) throw new Error(`Elementor output is missing DIR content: ${text.slice(0, 80)}`);
  }
  for (const url of before.urls) {
    if (!after.urls.includes(url)) throw new Error('Elementor output changed or omitted a source image');
  }
  const checkSource = (node: any) => {
    if (['heading', 'text', 'button', 'link', 'badge', 'list-item', 'icon-text'].includes(node.kind)) {
      const text = normalize(node.kind === 'text' ? node.html || node.text || '' : node.text || '');
      if (text && !actualText.includes(text)) throw new Error(`Elementor output is missing source text: ${text.slice(0, 80)}`);
    }
    if (node.kind === 'image' && node.url && !after.urls.includes(node.url)) throw new Error('Elementor output omitted a DIR image');
    for (const child of node.children || []) checkSource(child);
    for (const item of [...(node.tabs || []), ...(node.items || [])]) for (const child of item.children || []) checkSource(child);
  };
  dir.pages[0].sections.forEach(checkSource);
  for (let index = 0; index < expected.content.length; index++) {
    const required = expected.content[index].settings;
    const actual = document.content[index].settings || {};
    for (const property of ['flex_direction', 'flex_direction_tablet', 'flex_direction_mobile', 'background_color']) {
      if (required[property] !== undefined && JSON.stringify(actual[property]) !== JSON.stringify(required[property])) {
        throw new Error(`Elementor section ${index + 1} differs from DIR ${property}`);
      }
    }
  }
  if (expected.page_settings?.background_color !== document.page_settings?.background_color) {
    throw new Error('Elementor page background differs from the DIR');
  }
}
