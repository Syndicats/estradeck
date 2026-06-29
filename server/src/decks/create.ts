import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { CREATE_PRESENTATION_SCRIPT, REPO_ROOT, DECK_HTML_FILE } from '../config';
import { deckDir, uniqueDeckId } from './paths';
import { HttpError } from '../errors';

const execFileP = promisify(execFile);
// Only single slides (1) and section dividers (d). Vertical stacks (N > 1) are not supported.
const STRUCTURE_RE = /^(1|d)(,(1|d))*$/;

export interface CreateDeckOptions {
  title: string;
  structure?: string;
}

/** Scaffold a new deck by shelling out to the skill's create-presentation.js. */
export async function createDeck(opts: CreateDeckOptions): Promise<string> {
  const title = (opts.title || 'Untitled').trim().slice(0, 120);
  const structure = (opts.structure || '1,1,1,1,1').replace(/\s/g, '');
  if (!STRUCTURE_RE.test(structure)) {
    throw new HttpError(400, 'Invalid structure (use only 1 and d, e.g. "1,1,d,1,1")', 'INVALID_STRUCTURE');
  }
  const id = uniqueDeckId(title);
  const html = path.join(deckDir(id), DECK_HTML_FILE);
  await execFileP(
    process.execPath,
    [CREATE_PRESENTATION_SCRIPT, '--structure', structure, '--title', title, '--output', html],
    { cwd: REPO_ROOT },
  );
  return id;
}
