import type { DeckModel } from '@studio/shared';
import { isAnimatableElement } from '@studio/shared';
import { findSlide, locate } from './locate';

const HL = 'studio-hover-hl';
const STYLE_ID = 'studio-hover-style';

let lastEl: Element | null = null;
let lastFrom = -1;

function previewDoc(): Document | null {
  const iframe = document.querySelector('iframe.preview-frame') as HTMLIFrameElement | null;
  try {
    return iframe?.contentDocument ?? null;
  } catch {
    return null;
  }
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `.${HL}{outline:3px solid #22d3ee !important;outline-offset:1px;background:rgba(34,211,238,.18) !important;box-shadow:0 0 0 5px rgba(34,211,238,.4) !important;border-radius:3px;}`;
  doc.head?.appendChild(s);
}

/** The rendered <section> for a slide key (by id, else by reveal indices). */
function sectionElement(doc: Document, model: DeckModel, key: string): Element | null {
  const slide = findSlide(model, key);
  if (slide?.id) {
    const byId = doc.getElementById(slide.id);
    if (byId) return byId;
  }
  const p = locate(model, key);
  if (!p) return null;
  const tops = doc.querySelectorAll('.slides > section');
  const top = tops[p.h] as Element | undefined;
  if (!top) return null;
  const childSections = Array.from(top.children).filter((c) => c.tagName === 'SECTION');
  return childSections.length ? childSections[p.v] ?? childSections[0] : top;
}

/** Pre-order DFS over a section, mirroring server collectAnimatable() via the shared predicate. */
function animatableElements(section: Element): Element[] {
  const out: Element[] = [];
  const walk = (n: Element) => {
    for (const c of Array.from(n.children)) {
      if (isAnimatableElement(c.tagName, Array.from(c.classList))) out.push(c);
      walk(c);
    }
  };
  walk(section);
  return out;
}

function apply(doc: Document, target: Element): void {
  if (target === lastEl) return;
  ensureStyle(doc);
  if (lastEl) lastEl.classList.remove(HL);
  target.classList.add(HL);
  lastEl = target;
}

export function clearPreviewHighlight(): void {
  lastFrom = -1;
  if (lastEl) {
    lastEl.classList.remove(HL);
    lastEl = null;
  }
}

/**
 * Outline the element at a path of element-child indices from the slide's <section>.
 * `from` is the hovered element's source offset, used to skip recompute while hovering it.
 */
export function highlightPath(model: DeckModel, key: string, path: number[], from: number): void {
  if (from === lastFrom) return;
  const doc = previewDoc();
  if (!doc) return;
  const section = sectionElement(doc, model, key);
  if (!section) {
    clearPreviewHighlight();
    return;
  }
  let target: Element | null = section;
  for (const idx of path) {
    if (!target) break;
    target = (target.children[idx] as Element | undefined) ?? null;
  }
  if (!target) {
    clearPreviewHighlight();
    return;
  }
  apply(doc, target);
  lastFrom = from;
}

/** Outline the Nth animatable element of a slide (for the Animation tab fragment list). */
export function highlightFragment(model: DeckModel, key: string, elementIndex: number): void {
  const doc = previewDoc();
  if (!doc) return;
  const section = sectionElement(doc, model, key);
  if (!section) {
    clearPreviewHighlight();
    return;
  }
  const el = animatableElements(section)[elementIndex];
  if (!el) {
    clearPreviewHighlight();
    return;
  }
  lastFrom = -1;
  apply(doc, el);
}
