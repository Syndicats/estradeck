import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html as cmHtml } from '@codemirror/lang-html';
import { EditorView, keymap } from '@codemirror/view';
import { foldGutter, codeFolding, foldKeymap } from '@codemirror/language';
import type { CssVar } from '@studio/shared';
import { useStudio } from '../state/deckStore';
import { makeBrandCompletionSource, extractDeckClasses, type CompletionData } from '../lib/cmComplete';
import { colorSwatches, refreshSwatches } from '../lib/cmColor';
import { numberScrubber } from '../lib/cmScrub';
import { slidesIntelligence, type SiGenerateReq } from '../lib/cmIntelligence';
import * as api from '../api/client';

function varKind(value: string): CssVar['kind'] {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgba?|hsla?)\(/i.test(v)) return 'color';
  if (/font/i.test(v) && !/^-?[\d.]/.test(v)) return 'font';
  if (/^-?[\d.]+(px|pt|em|rem|%|vh|vw)$/.test(v)) return 'length';
  return 'other';
}

/**
 * The theme slide template editor — the same CodeMirror experience as the deck Code tab:
 * HTML highlighting, brand-aware autocompletion (theme + base-style classes, theme CSS
 * vars, reveal data-*), color swatches, ⌥-drag number scrubbing, Format (Prettier), and
 * ⌘K Slides Intelligence scoped to this theme. Controlled — the parent owns the value.
 */
export function ThemeCodeEditor({
  themeId,
  value,
  onChange,
}: {
  themeId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const showToast = useStudio((s) => s.showToast);
  const [formatting, setFormatting] = useState(false);
  const viewRef = useRef<EditorView | null>(null);
  const completeRef = useRef<CompletionData>({ classes: [], cssVars: [] });

  // Brand-aware completion data: classes from the base components + this theme's CSS,
  // plus the theme's palette/font variables (for var(--…) completion + swatches).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/brand/base.css').then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      fetch(`/themes/${themeId}/theme.css`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      api.getTheme(themeId).then((t) => t.vars).catch(() => []),
    ]).then(([baseCss, themeCss, vars]) => {
      if (cancelled) return;
      const classes = Array.from(
        new Set([...extractDeckClasses(baseCss), ...extractDeckClasses(themeCss)]),
      );
      const cssVars: CssVar[] = vars.map((v) => ({
        name: v.name,
        value: v.value,
        kind: varKind(v.value),
        label: v.name.replace(/^--/, ''),
      }));
      completeRef.current = { classes, cssVars };
      viewRef.current?.dispatch({ effects: refreshSwatches.of(null) });
    });
    return () => {
      cancelled = true;
    };
  }, [themeId]);

  const generate = useCallback(
    async (req: SiGenerateReq) => {
      const { html } = await api.generateThemeSi(themeId, req);
      return html;
    },
    [themeId],
  );
  const getMedia = useCallback(async () => {
    const { assets } = await api.listThemeAssets(themeId).catch(() => ({ assets: [] }));
    return assets.map((a) => ({
      name: a.name,
      ref: a.ref,
      thumbUrl: a.kind === 'video' ? a.posterUrl : a.url,
      kind: a.kind,
    }));
  }, [themeId]);
  const complete = useCallback(
    async (req: { prompt: string; mode: 'compose' | 'replace'; code?: string }, signal: AbortSignal) => {
      const { completion } = await api.suggestThemeSiCompletion(themeId, req, signal);
      return completion ?? '';
    },
    [themeId],
  );

  const format = useCallback(async () => {
    const view = viewRef.current;
    if (!view || formatting) return;
    setFormatting(true);
    try {
      const current = view.state.doc.toString();
      const { html } = await api.formatHtml(current);
      if (html && html !== current) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: html } });
      }
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setFormatting(false);
    }
  }, [formatting, showToast]);

  const extensions = useMemo(() => {
    const lang = cmHtml({ autoCloseTags: false });
    return [
      lang,
      lang.language.data.of({ autocomplete: makeBrandCompletionSource(() => completeRef.current) }),
      colorSwatches(() => completeRef.current.cssVars),
      numberScrubber(),
      slidesIntelligence(generate, getMedia, complete),
      codeFolding(),
      foldGutter(),
      keymap.of(foldKeymap),
      EditorView.lineWrapping,
    ];
  }, [generate, getMedia, complete]);

  return (
    <div className="theme-cm">
      <div className="theme-cm-head">
        <span className="code-id">template HTML</span>
        <button
          className="btn-sm"
          disabled={formatting}
          onClick={() => void format()}
          title="Pretty-print this template's HTML"
        >
          {formatting ? 'Formatting…' : 'Format'}
        </button>
      </div>
      <div className="theme-cm-wrap">
        <CodeMirror
          value={value}
          theme="dark"
          height="100%"
          className="cm-fill"
          extensions={extensions}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            closeBrackets: false,
            autocompletion: true,
          }}
        />
      </div>
      <p className="code-hint">✦ ⌘K Slides Intelligence · ⌥-drag a number to adjust · @ mentions theme assets</p>
    </div>
  );
}
