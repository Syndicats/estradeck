import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

/**
 * Given a document position, return the element-child index path from the slide's
 * root <section> down to the HTML element under the cursor, plus that element's
 * source start offset. Returns null when the position is not inside an element.
 */
export function elementPathAt(
  view: EditorView,
  pos: number,
): { path: number[]; from: number } | null {
  const tree = syntaxTree(view.state);
  let node: any = tree.resolveInner(pos, -1);
  while (node && node.name !== 'Element') node = node.parent;
  if (!node) return null;

  // Chain of Element ancestors: [section, …, hovered].
  const chain: any[] = [];
  let cur: any = node;
  while (cur && cur.name === 'Element') {
    chain.unshift(cur);
    let p = cur.parent;
    while (p && p.name !== 'Element') p = p.parent;
    cur = p;
  }

  const path: number[] = [];
  for (let i = 1; i < chain.length; i++) {
    let idx = 0;
    let sib = chain[i].prevSibling;
    while (sib) {
      if (sib.name === 'Element') idx++;
      sib = sib.prevSibling;
    }
    path.push(idx);
  }
  return { path, from: node.from };
}
