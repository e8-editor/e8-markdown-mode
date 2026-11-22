// SPDX-License-Identifier: GPL-3.0-or-later
//
// Markdown, after markdown-mode.el 2.9-alpha
// (https://github.com/jrblevin/markdown-mode): a major mode for editing
// Markdown, built on text-mode, and gfm-mode on it for GitHub Flavored
// Markdown. Headings, emphasis, inline code, fenced and indented code
// blocks (in their language's own faces with
// markdown-fontify-code-blocks-natively), links, footnotes, lists and
// checkboxes, block quotes, tables, HTML, comments and YAML front matter
// are styled as they are shown, and markup can be hidden. TAB folds
// headings as outline-mode does and S-TAB the whole buffer; C-c C-n, C-c
// C-p, C-c C-f, C-c C-b and C-c C-u move between headings; C-c C-- and C-c
// C-= promote and demote headings and list items, C-c <up> and C-c <down>
// move them. C-c C-s inserts markup (b bold, i italic, c code, C a code
// block, h a heading, l a link, - a rule, [ a checkbox), C-c C-l a link,
// M-RET a list item; C-c C-o follows the link at point, C-c C-d toggles the
// checkbox at point, M-n and M-p go to the next and previous link. M-x
// imenu lists the headings.
//
// Copyright (C) 2007-2026 Jason R. Blevins and markdown-mode contributors
// Copyright (C) 2026 The E8 contributors
// Ported to E8 in 2026.
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.

import { charCount, PerBuffer, truthy } from "subr";

export const markdownModeVersion = "2.9-alpha";

// Options =====================================================================

const OPTIONS: [string, e8.Value, string][] = [
  ["markdown-hide-markup", false, "Whether markup, such as the asterisks around bold text, the hashes before a heading and a link's URL, is hidden. C-c C-x C-m toggles it."],
  ["markdown-hide-urls", false, "Whether the URLs of inline links are shown as markdown-url-compose-char. C-c C-x C-l toggles it."],
  ["markdown-url-compose-char", "∞", "What a hidden URL is shown as, with markdown-hide-urls."],
  ["markdown-fontify-code-blocks-natively", false, "Whether the text of fenced code blocks has the faces its language's major mode gives it. C-c C-x C-f toggles it."],
  ["markdown-fontify-code-block-default-mode", null, "The major mode to fontify a fenced code block with no language in, with markdown-fontify-code-blocks-natively; nil for none."],
  ["markdown-fontify-whole-heading-line", false, "Whether a heading's face goes over its whole line, its markup and newline too, so a background reaches the window's edge."],
  [
    "markdown-code-lang-modes",
    [["ocaml", "tuareg-mode"], ["elisp", "emacs-lisp-mode"], ["ditaa", "artist-mode"], ["asymptote", "asy-mode"], ["dot", "fundamental-mode"], ["sqlite", "sql-mode"], ["calc", "fundamental-mode"], ["C", "c-mode"], ["cpp", "c++-mode"], ["C++", "c++-mode"], ["screen", "shell-script-mode"], ["shell", "sh-mode"], ["bash", "sh-mode"]],
    "The major modes of code blocks' languages, as [language, mode] pairs; a language not here uses LANGUAGE-ts-mode if its grammar is installed, else LANGUAGE-mode.",
  ],
  ["markdown-asymmetric-header", false, "Whether atx headings are inserted with hashes only before the text, # Heading, rather than around it, # Heading #."],
  ["markdown-bold-underscore", false, "Whether bold text is inserted with underscores, __bold__, rather than asterisks."],
  ["markdown-italic-underscore", false, "Whether italic text is inserted with underscores, _italic_, rather than asterisks."],
  ["markdown-unordered-list-item-prefix", "  * ", "What a new unordered list item starts with, when there is no list to follow."],
  ["markdown-ordered-list-enumeration", true, "Whether a new ordered list item takes the next number; nil to number every item 1."],
  ["markdown-list-indent-width", 4, "How many columns promoting or demoting a list item moves it."],
  ["markdown-indent-on-enter", true, "What RET does: nil for a plain newline, t to indent the new line with markdown-indent-line, indent-and-new-item to start a new list item as well, in a list, or end the list in an empty item."],
  ["markdown-hr-strings", ["-------------------------------------------------------------------------------", "* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *", "---------------------------------------", "* * * * * * * * * * * * * * * * * * * *", "---------", "* * * * *"], "The horizontal rules C-c C-s - inserts, the first by default and the others with a prefix argument."],
  ["markdown-enable-wiki-links", false, "Whether [[wiki links]] are styled and followed."],
  ["markdown-wiki-link-alias-first", true, "Whether, in [[A|B]], A is the text shown and B the page, rather than the other way round."],
  ["markdown-enable-highlighting-syntax", false, "Whether ==highlighted text== is styled."],
  ["markdown-gfm-uppercase-checkbox", false, "Whether a ticked checkbox is written [X] rather than [x]."],
  ["markdown-gfm-use-electric-backquote", true, "Whether typing a third backquote at the start of a line in gfm-mode inserts a code block."],
  ["markdown-gfm-additional-languages", [], "More languages for C-c C-s C to offer, as strings."],
  ["markdown-code-block-braces", false, "Whether C-c C-s C puts the language in braces, ```{lang}."],
  ["markdown-spaces-after-code-fence", 1, "How many spaces C-c C-s C puts between the backquotes and the language."],
  ["markdown-nested-imenu-heading-index", true, "Whether M-x imenu lists headings under their parents, rather than all at one level."],
  ["markdown-use-pandoc-style-yaml-metadata", false, "Whether YAML metadata may be anywhere and end with ..., as Pandoc allows, rather than only at the start of the buffer between --- lines."],
];
for (const [name, value, doc] of OPTIONS) e8.defineVariable({ name, value, doc });

e8.defineVariable({ name: "markdown-gfm-used-languages", value: [], doc: "The languages of code blocks in this buffer, most recent first, which C-c C-s C offers.", local: true });
e8.defineVariable({ name: "markdown-cycle-global-status", value: 1, doc: "Where S-TAB is in cycling the buffer's visibility: 1 everything shown, 2 the overview, 3 the contents.", local: true });
e8.defineVariable({ name: "markdown-cycle-subtree-status", value: null, doc: "Where TAB is in cycling the heading at point: folded, children or subtree.", local: true });
e8.defineHook("markdown-mode-hook", "Run after entering markdown-mode.");
e8.defineHook("gfm-mode-hook", "Run after entering gfm-mode.");

/** The GFM languages C-c C-s C offers, as markdown-gfm-recognized-languages. */
const GFM_LANGUAGES = [
  "Ada", "Agda", "AppleScript", "Assembly", "Awk", "Bash", "C", "C#", "C++", "CMake", "CSS", "Clojure", "CoffeeScript", "Common Lisp", "Coq", "Crystal", "D", "Dart", "Diff",
  "Dockerfile", "Elixir", "Elm", "Emacs Lisp", "Erlang", "F#", "Fish", "Fortran", "Go", "GraphQL", "Groovy", "HTML", "Haskell", "INI", "Idris", "JSON", "Java", "JavaScript", "Julia",
  "Kotlin", "LaTeX", "Lua", "Makefile", "Markdown", "Matlab", "Nim", "Nix", "OCaml", "Objective-C", "PHP", "Perl", "PowerShell", "Prolog", "Python", "R", "Racket", "Ruby", "Rust",
  "SQL", "Sass", "Scala", "Scheme", "Shell", "Swift", "TOML", "Tcl", "TeX", "Text", "TypeScript", "Vim script", "XML", "YAML", "Zig", "console", "sh", "text",
];

const v = (name: string): e8.Value | undefined => e8.variable(name);
const num = (name: string, fallback: number): number => {
  const x = v(name);
  return typeof x === "number" ? x : fallback;
};

// Faces =======================================================================

const FACES: [string, string, e8.FaceAttributes][] = [
  ["markdown-italic-face", "Italic text.", { inherit: "italic" }],
  ["markdown-bold-face", "Bold text.", { inherit: "bold" }],
  ["markdown-strike-through-face", "Struck-through text.", { strikeThrough: true }],
  ["markdown-markup-face", "Markup: the characters around and before what they mark up.", { inherit: "shadow", slant: "normal", weight: "normal" }],
  ["markdown-header-rule-face", "The underline of a setext heading.", { inherit: "markdown-markup-face" }],
  ["markdown-header-delimiter-face", "The hashes around an atx heading.", { inherit: "markdown-markup-face" }],
  ["markdown-list-face", "List markers.", { inherit: "markdown-markup-face" }],
  ["markdown-blockquote-face", "The text of block quotes.", { inherit: "font-lock-doc-face" }],
  ["markdown-code-face", "Code blocks, their fences included, and inline code.", { inherit: "fixed-pitch" }],
  ["markdown-inline-code-face", "Inline code.", { inherit: ["markdown-code-face", "font-lock-constant-face"] }],
  ["markdown-pre-face", "Preformatted text, indented or in a code block.", { inherit: ["markdown-code-face", "font-lock-constant-face"] }],
  ["markdown-table-face", "Tables.", { inherit: "markdown-code-face" }],
  ["markdown-language-keyword-face", "The language of a fenced code block.", { inherit: "font-lock-type-face" }],
  ["markdown-language-info-face", "What follows the language on a code fence.", { inherit: "font-lock-string-face" }],
  ["markdown-link-face", "Link text.", { inherit: "link" }],
  ["markdown-missing-link-face", "Links to files that do not exist.", { inherit: "font-lock-warning-face" }],
  ["markdown-reference-face", "Link references.", { inherit: "markdown-markup-face" }],
  ["markdown-footnote-marker-face", "Footnote markers.", { inherit: "markdown-markup-face" }],
  ["markdown-footnote-text-face", "Footnote text.", { inherit: "font-lock-comment-face" }],
  ["markdown-url-face", "URLs.", { inherit: "font-lock-string-face" }],
  ["markdown-plain-url-face", "URLs in text, not in a link.", { inherit: "markdown-link-face" }],
  ["markdown-link-title-face", "The title of a link.", { inherit: "font-lock-comment-face" }],
  ["markdown-line-break-face", "The two spaces that end a line with a hard break.", { inherit: "font-lock-constant-face", underline: true }],
  ["markdown-comment-face", "HTML comments.", { inherit: "font-lock-comment-face" }],
  ["markdown-math-face", "Mathematics.", { inherit: "font-lock-string-face" }],
  ["markdown-metadata-key-face", "Metadata keys.", { inherit: "font-lock-variable-name-face" }],
  ["markdown-metadata-value-face", "Metadata values.", { inherit: "font-lock-string-face" }],
  ["markdown-gfm-checkbox-face", "GFM checkboxes.", { inherit: "font-lock-builtin-face" }],
  ["markdown-highlight-face", "The thing at point, as a link under the mouse.", { inherit: "highlight" }],
  ["markdown-hr-face", "Horizontal rules.", { inherit: "markdown-markup-face" }],
  ["markdown-html-tag-name-face", "HTML tag names.", { inherit: "font-lock-type-face" }],
  ["markdown-html-tag-delimiter-face", "HTML tag delimiters.", { inherit: "markdown-markup-face" }],
  ["markdown-html-attr-name-face", "HTML attribute names.", { inherit: "font-lock-variable-name-face" }],
  ["markdown-html-attr-value-face", "HTML attribute values.", { inherit: "font-lock-string-face" }],
  ["markdown-html-entity-face", "HTML entities.", { inherit: "font-lock-variable-name-face" }],
  ["markdown-highlighting-face", "==Highlighted text==.", { background: "yellow", foreground: "black" }],
  ["markdown-header-face", "The text of headings; the faces of each level inherit it.", { inherit: ["font-lock-function-name-face"], weight: "bold" }],
];
for (const [name, doc, attributes] of FACES) e8.defineFace({ name, doc, attributes });
for (let level = 1; level <= 6; level++) {
  e8.defineFace({ name: `markdown-header-face-${level}`, doc: `Level ${level} headings.`, attributes: { inherit: "markdown-header-face" } });
}

// Parsing =====================================================================
//
// What each line of the buffer is, as markdown-syntax-propertize marks
// code blocks, metadata and comments with text properties: parsed from the
// start of the buffer, as a code fence or a comment changes what follows
// it, and kept until the buffer's text changes.

type Kind =
  | "blank"
  | "text"
  | "atx"
  | "setext-text"
  | "setext-rule"
  | "hr"
  | "fence-open"
  | "fence-body"
  | "fence-close"
  | "pre"
  | "meta-border"
  | "meta"
  | "comment"
  | "table"
  | "quote"
  | "list";

interface Parse {
  tick: number;
  lines: string[];
  kinds: Kind[];
  /** For each line in a fenced code block, the line its opening fence is on; -1 for others. */
  fence: number[];
}

const parses = new PerBuffer<Parse>();

const ATX = /^(#+)([ \t]+)(.*?)(?:([ \t]+)(#+))?[ \t]*$/;
const ATX_EMPTY = /^(#+)[ \t]*$/;
const SETEXT_RULE = /^(=+|-+)[ \t]*$/;
const HR = /^(?:(?:\* ?){3,}[* ]*|(?:- ?){3,}[- ]*|(?:_ ?){3,}[_ ]*)$/;
const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})([ \t]*\{?[ \t]*)([^\s`{}]+)?(?:[ \t]+([^`]*?))?([ \t]*\}?[ \t]*)$/;
const LIST = /^([ \t]*)([0-9#]+\.|[*+:-])([ \t]+|$)(\[[ xX]\][ \t]*)?/;
const QUOTE = /^([ \t]*)([A-Z]?>)([ \t]*)(.*)$/;
const TABLE = /^[ \t]*\|/;
const PRE = /^( {4}|\t)/;
const BLANK = /^[ \t]*$/;

/** The width of leading whitespace, tabs to the next multiple of four. */
function indentWidth(text: string): number {
  let w = 0;
  for (const c of text) {
    if (c === " ") w++;
    else if (c === "\t") w = (Math.floor(w / 4) + 1) * 4;
    else break;
  }
  return w;
}

function parseLines(lines: string[]): { kinds: Kind[]; fence: number[] } {
  const n = lines.length;
  const kinds: Kind[] = new Array<Kind>(n).fill("text");
  const fence: number[] = new Array<number>(n).fill(-1);
  let i = 0;
  // YAML metadata between --- lines at the very start.
  if (n > 1 && /^-{3}[ \t]*$/.test(lines[0]!)) {
    let end = 1;
    while (end < n && !/^(?:-{3}|\.{3})[ \t]*$/.test(lines[end]!)) end++;
    if (end < n) {
      kinds[0] = "meta-border";
      for (let l = 1; l < end; l++) kinds[l] = "meta";
      kinds[end] = "meta-border";
      i = end + 1;
    }
  }
  // The content column of the list item lines are under, or -1 outside lists.
  let listContent = -1;
  for (; i < n; i++) {
    const text = lines[i]!;
    const prev = i > 0 ? kinds[i - 1]! : "blank";
    if (BLANK.test(text)) {
      kinds[i] = "blank";
      continue;
    }
    const indent = indentWidth(text);
    const open = FENCE_OPEN.exec(text);
    if (open && indent < 4 + Math.max(0, listContent)) {
      const marker = open[2]!;
      const close = new RegExp(`^[ \\t]*${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`);
      let end = i + 1;
      while (end < n && !close.test(lines[end]!)) end++;
      // An unclosed fence runs to the end of the buffer, as GFM has it.
      kinds[i] = "fence-open";
      fence[i] = i;
      for (let l = i + 1; l < Math.min(end, n); l++) {
        kinds[l] = "fence-body";
        fence[l] = i;
      }
      if (end < n) {
        kinds[end] = "fence-close";
        fence[end] = i;
      }
      i = end;
      continue;
    }
    if (/^[ \t]*<!--/.test(text) && !/-->/.test(text.slice(text.indexOf("<!--") + 4))) {
      let end = i + 1;
      while (end < n && !/--[ \t]*>/.test(lines[end]!)) end++;
      for (let l = i; l <= Math.min(end, n - 1); l++) kinds[l] = "comment";
      i = end;
      continue;
    }
    if (PRE.test(text) && (prev === "blank" || prev === "pre") && (listContent < 0 || indent >= listContent + 4)) {
      kinds[i] = "pre";
      continue;
    }
    if (indent === 0 && !LIST.test(text)) listContent = -1;
    if (ATX.test(text) || ATX_EMPTY.test(text)) {
      kinds[i] = "atx";
      listContent = -1;
      continue;
    }
    if (SETEXT_RULE.test(text) && prev === "text" && indent === 0 && i > 0 && !/^[ \t-]/.test(lines[i - 1]!)) {
      kinds[i - 1] = "setext-text";
      kinds[i] = "setext-rule";
      continue;
    }
    if (HR.test(text)) {
      kinds[i] = "hr";
      continue;
    }
    const list = LIST.exec(text);
    if (list) {
      kinds[i] = "list";
      listContent = indentWidth(list[1]!) + list[2]!.length + Math.max(1, list[3]!.length);
      continue;
    }
    if (QUOTE.test(text)) {
      kinds[i] = "quote";
      continue;
    }
    if (TABLE.test(text)) {
      kinds[i] = "table";
      continue;
    }
    kinds[i] = "text";
  }
  return { kinds, fence };
}

/** The current buffer's parse, made again if its text has changed. */
function parse(): Parse {
  const tick = e8.bufferCharsModifiedTick();
  const buffer = e8.currentBuffer();
  const kept = parses.get(buffer);
  if (kept !== undefined && kept.tick === tick) return kept;
  const text = e8.saveRestriction(() => {
    e8.widen();
    return e8.bufferText(e8.pointMin(), e8.pointMax());
  });
  const lines = text.split("\n");
  const made: Parse = { tick, lines, ...parseLines(lines) };
  parses.set(buffer, made);
  return made;
}

/** Whether the line is in a code block: fenced, its fences too, or indented. */
function codeLine(p: Parse, line: number): boolean {
  const k = p.kinds[line];
  return k === "fence-open" || k === "fence-body" || k === "fence-close" || k === "pre";
}

/** Whether position is in a code block, as markdown-code-block-at-pos. */
export function markdownCodeBlockAtPos(pos: number): boolean {
  return codeLine(parse(), e8.lineOf(pos));
}

// Headings ====================================================================

export interface Heading {
  /** The heading's first line, its text's for a setext heading. */
  line: number;
  /** The heading's last line, the underline for a setext heading. */
  lastLine: number;
  level: number;
  setext: boolean;
  /** The heading's text. */
  text: string;
}

/** The buffer's headings, outside code blocks, metadata and comments. */
export function markdownHeadings(): Heading[] {
  const p = parse();
  const found: Heading[] = [];
  for (let i = 0; i < p.lines.length; i++) {
    const k = p.kinds[i];
    if (k === "atx") {
      const text = p.lines[i]!;
      const m = ATX.exec(text);
      found.push({ line: i, lastLine: i, level: (m ?? ATX_EMPTY.exec(text))![1]!.length, setext: false, text: m ? m[3]! : "" });
    } else if (k === "setext-text") {
      found.push({ line: i, lastLine: i + 1, level: p.lines[i + 1]!.startsWith("=") ? 1 : 2, setext: true, text: p.lines[i]!.trim() });
    }
  }
  return found;
}

/** The index of the heading point is in or under, or -1 before the first. */
function headingIndexAt(all: Heading[], line: number): number {
  let lo = 0;
  let hi = all.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (all[mid]!.line <= line) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  // The underline of a setext heading belongs to it.
  if (found + 1 < all.length && all[found + 1]!.lastLine === line) found++;
  return found;
}

/** The heading whose line, or underline, line is, or undefined. */
function headingOnLine(all: Heading[], line: number): Heading | undefined {
  const i = headingIndexAt(all, line);
  const h = all[i];
  return h !== undefined && line >= h.line && line <= h.lastLine ? h : undefined;
}

/** The line after the subtree of heading i: the next heading at its level or above, or the line count. */
function subtreeEndLine(all: Heading[], i: number, lines: number): number {
  for (let j = i + 1; j < all.length; j++) if (all[j]!.level <= all[i]!.level) return all[j]!.line;
  return lines;
}

/** The level of the heading at point, as markdown-outline-level. */
export function markdownOutlineLevel(): number {
  return headingOnLine(markdownHeadings(), e8.lineOf(e8.point()))?.level ?? 0;
}

// Folding =====================================================================
//
// As outline.el: overlays whose invisible property is outline hide what
// is under a heading, shown as "...".

const FOLD = "markdown-fold";

/** The position before the newline that ends the line, or the buffer's end. */
const endOfLine = (line: number): number => e8.lineEnd(Math.min(line, e8.lineCount() - 1));

/** Hides or shows the text from the end of line `from` to the end of the line before `to`. */
function flag(fromLine: number, toLine: number, hide: boolean): void {
  if (toLine <= fromLine + 1 && hide) return;
  const start = endOfLine(fromLine);
  const lines = e8.lineCount();
  // The newline that ends the buffer stays, as outline-end-of-subtree leaves it.
  const last = toLine >= lines && lines > 1 && e8.lineText(lines - 1) === "" ? lines - 2 : Math.min(toLine, lines) - 1;
  const end = e8.lineEnd(last);
  if (end <= start) return;
  for (const o of e8.overlaysIn(start, end)) {
    if (e8.overlayGet(o, FOLD) !== true) continue;
    const os = e8.overlayStart(o)!;
    const oe = e8.overlayEnd(o)!;
    e8.deleteOverlay(o);
    // Keep the parts outside what is shown.
    if (os < start) e8.makeOverlay(os, start, { invisible: "outline", [FOLD]: true });
    if (oe > end) e8.makeOverlay(end, oe, { invisible: "outline", [FOLD]: true });
  }
  if (hide) e8.makeOverlay(start, end, { invisible: "outline", [FOLD]: true });
}

/** Whether the end of the line is hidden. */
const hiddenAfter = (line: number): boolean => e8.overlaysAt(endOfLine(line)).some((o) => e8.overlayGet(o, FOLD) === true);

function showAll(): void {
  flag(0, e8.lineCount(), false);
}

/** Shows the headings down to `level` and hides all else, as outline-hide-sublevels. */
function hideSublevels(level: number): void {
  const all = markdownHeadings();
  showAll();
  const shown = all.filter((h) => h.level <= level);
  const lines = e8.lineCount();
  for (let i = 0; i < shown.length; i++) flag(shown[i]!.lastLine, i + 1 < shown.length ? shown[i + 1]!.line : lines, true);
  // The text before the first heading stays.
}

/** Shows every heading and hides the text under them, as outline-hide-body. */
function hideBody(): void {
  hideSublevels(1000);
}

function hideSubtree(all: Heading[], i: number): void {
  flag(all[i]!.lastLine, subtreeEndLine(all, i, e8.lineCount()), true);
}

function showSubtree(all: Heading[], i: number): void {
  flag(all[i]!.lastLine, subtreeEndLine(all, i, e8.lineCount()), false);
}

/** Shows the heading's own text and its children's headings, as outline-show-entry and outline-show-children. */
function showChildren(all: Heading[], i: number): void {
  const end = subtreeEndLine(all, i, e8.lineCount());
  const h = all[i]!;
  const children = all.slice(i + 1).filter((c) => c.line < end);
  const childLevel = Math.min(...children.map((c) => c.level), 1000);
  flag(h.lastLine, end, false);
  const shown = children.filter((c) => c.level <= childLevel);
  for (let j = 0; j < shown.length; j++) flag(shown[j]!.lastLine, j + 1 < shown.length ? shown[j + 1]!.line : end, true);
}

// Fontification ===============================================================

/** The code point offset of UTF-16 index i in text. */
function offsetter(text: string): (i: number) => number {
  return /[\uD800-\uDFFF]/.test(text) ? (i: number) => charCount(text.slice(0, i)) : (i: number) => i;
}

function face(start: number, end: number, name: string | string[]): void {
  if (end > start) e8.putTextProperty(start, end, "face", name);
}

function addFace(start: number, end: number, name: string, append = false): void {
  if (end > start) e8.addFaceTextProperty(start, end, name, append ? { append: true } : undefined);
}

/** Gives markup its face, and makes it hidden while markdown-hide-markup is on, as markdown-markup-properties. */
function markup(start: number, end: number, name = "markdown-markup-face"): void {
  if (end <= start) return;
  addFace(start, end, name);
  e8.putTextProperty(start, end, "invisible", "markdown-markup");
}

const inlineKind = (k: Kind | undefined): boolean => k === "text" || k === "list" || k === "quote" || k === "table" || k === "setext-text";

/** The major mode for a code block's language, as markdown-get-lang-mode, or undefined. */
export function markdownGetLangMode(lang: string): string | undefined {
  const alist = v("markdown-code-lang-modes");
  const down = lang.toLowerCase();
  const exists = (mode: string | undefined): mode is string => mode !== undefined && e8.fboundp(mode);
  const assoc = (key: string): string | undefined => {
    const entry = Array.isArray(alist) ? (alist.find((e) => Array.isArray(e) && e[0] === key) as e8.Value[] | undefined) : undefined;
    return entry ? String(entry[1]) : undefined;
  };
  for (const mode of [assoc(lang), assoc(down)]) if (exists(mode)) return mode;
  for (const name of lang === down ? [lang] : [lang, down]) {
    const mode = `${name}-ts-mode`;
    if (exists(mode) && e8.treesitLanguageAvailableP(name)) return mode;
  }
  for (const mode of [`${lang}-mode`, `${down}-mode`]) if (exists(mode)) return mode;
  return undefined;
}

/**
 * Gives a code block's text the faces its language's mode gives it, as
 * markdown-fontify-code-block-natively: in a buffer of its own, whose
 * faces are copied back. False if there is no mode for the language.
 */
function fontifyNatively(lang: string | undefined, start: number, end: number): boolean {
  const defaultMode = v("markdown-fontify-code-block-default-mode");
  const mode = lang !== undefined ? markdownGetLangMode(lang) : typeof defaultMode === "string" ? defaultMode : undefined;
  if (mode === undefined || !e8.fboundp(mode)) return false;
  const text = e8.bufferSubstringNoProperties(start, end);
  const name = ` *markdown-code-fontification:${mode}*`;
  const fresh = e8.getBuffer(name) === undefined;
  e8.getBufferCreate(name);
  const runs: [number, number, e8.Value][] = [];
  e8.withCurrentBuffer(name, () => {
    if (fresh) e8.bufferDisableUndo();
    e8.deleteRegion(e8.pointMin(), e8.pointMax());
    e8.insert(`${text} `);
    if (e8.variable("major-mode") !== mode) e8.call(mode as e8.CommandName);
    e8.call("font-lock-ensure");
    const size = e8.pointMax() - 1;
    // A tree-sitter mode's faces come from its syntax tree, not properties, until asked for.
    if (e8.treesitLanguage() !== undefined) e8.treesitFontLockFontifyRegion(e8.pointMin(), size);
    for (let p = e8.pointMin(); p < size; ) {
      const next = Math.min(e8.nextSinglePropertyChange(p, "face", size) ?? size, size);
      const f = e8.getTextProperty(p, "face");
      if (truthy(f)) runs.push([p - e8.pointMin(), next - e8.pointMin(), f!]);
      p = next;
    }
    e8.setBufferModified(false);
  });
  for (const [a, b, f] of runs) e8.putTextProperty(start + a, start + b, "face", f);
  return true;
}

/** Fontifies the code block whose opening fence is on line `open`. */
function fontifyFence(p: Parse, open: number): void {
  const n = p.lines.length;
  let close = open + 1;
  while (close < n && p.fence[close] === open && p.kinds[close] === "fence-body") close++;
  const closed = close < n && p.kinds[close] === "fence-close" && p.fence[close] === open;
  const m = FENCE_OPEN.exec(p.lines[open]!)!;
  const ls = e8.lineStart(open);
  const at = offsetter(p.lines[open]!);
  let i = m[1]!.length;
  markup(ls + at(i), ls + at(i + m[2]!.length));
  i += m[2]!.length;
  markup(ls + at(i), ls + at(i + m[3]!.length));
  i += m[3]!.length;
  const lang = m[4];
  if (lang !== undefined) {
    addFace(ls + at(i), ls + at(i + lang.length), "markdown-language-keyword-face");
    i += lang.length;
  }
  if (m[5] !== undefined) {
    const infoAt = p.lines[open]!.indexOf(m[5], i);
    addFace(ls + at(infoAt), ls + at(infoAt + m[5].length), "markdown-language-info-face");
  }
  const bodyStart = e8.lineStart(Math.min(open + 1, e8.lineCount() - 1));
  const bodyEnd = close < n ? e8.lineStart(close) : e8.pointMax();
  if (close > open + 1 && bodyEnd > bodyStart) {
    const lang2 = lang === undefined ? undefined : lang;
    if (!(truthy(v("markdown-fontify-code-blocks-natively")) && fontifyNatively(lang2, bodyStart, bodyEnd))) face(bodyStart, bodyEnd, "markdown-pre-face");
  }
  if (closed) {
    const cs = e8.lineStart(close);
    const ct = p.lines[close]!;
    const indent = /^[ \t]*/.exec(ct)![0].length;
    markup(cs + indent, cs + ct.trimEnd().length);
  }
  // The block's background, its fences included.
  const blockEnd = closed ? Math.min(e8.lineEnd(close) + 1, e8.pointMax()) : e8.pointMax();
  addFace(ls, blockEnd, "markdown-code-face", true);
  // The fence lines, newlines and all, are hidden with the markup.
  e8.putTextProperty(ls, Math.min(e8.lineEnd(open) + 1, e8.pointMax()), "invisible", "markdown-markup");
  if (closed) e8.putTextProperty(e8.lineStart(close), blockEnd, "invisible", "markdown-markup");
}

/** Fontifies a block line by its kind, but not what is inline in it. */
function fontifyLine(p: Parse, line: number): void {
  const text = p.lines[line]!;
  const ls = e8.lineStart(line);
  const le = e8.lineEnd(line);
  const at = offsetter(text);
  switch (p.kinds[line]) {
    case "atx": {
      const m = ATX.exec(text);
      const level = Math.min(6, (m ?? ATX_EMPTY.exec(text))![1]!.length);
      const headingFace = `markdown-header-face-${level}`;
      const whole = truthy(v("markdown-fontify-whole-heading-line")) && !truthy(v("markdown-hide-markup"));
      if (m === null) {
        markup(ls, le, "markdown-header-delimiter-face");
        if (whole) addFace(ls, Math.min(le + 1, e8.pointMax()), headingFace, true);
        break;
      }
      const textStart = ls + at(m[1]!.length + m[2]!.length);
      const textEnd = textStart + charCount(m[3]!);
      face(textStart, textEnd, headingFace);
      markup(ls, textStart, "markdown-header-delimiter-face");
      if (m[5] !== undefined) markup(textEnd, le, "markdown-header-delimiter-face");
      if (whole) addFace(ls, Math.min(le + 1, e8.pointMax()), headingFace, true);
      break;
    }
    case "setext-text": {
      const level = p.lines[line + 1]?.startsWith("=") ? 1 : 2;
      face(ls, le, `markdown-header-face-${level}`);
      break;
    }
    case "setext-rule":
      markup(ls, le, "markdown-header-rule-face");
      break;
    case "hr":
      markup(ls, le, "markdown-hr-face");
      break;
    case "pre":
      face(ls, le, "markdown-pre-face");
      break;
    case "comment":
      face(ls, le, "markdown-comment-face");
      break;
    case "meta-border":
      markup(ls, le);
      break;
    case "meta": {
      const m = /^([ \t]*(?:-[ \t]*)?)([A-Za-z][A-Za-z _-]*?)([:=][ \t]*)(.*)$/.exec(text);
      if (m) {
        const keyStart = ls + at(m[1]!.length);
        const keyEnd = keyStart + charCount(m[2]!);
        const valueStart = keyEnd + charCount(m[3]!);
        face(keyStart, keyEnd, "markdown-metadata-key-face");
        face(keyEnd, valueStart, "markdown-markup-face");
        face(valueStart, le, "markdown-metadata-value-face");
      } else face(ls, le, "markdown-metadata-value-face");
      break;
    }
    case "table":
      face(ls + at(/^[ \t]*/.exec(text)![0].length), le, "markdown-table-face");
      break;
    case "quote": {
      const m = QUOTE.exec(text)!;
      const markEnd = ls + at(m[1]!.length + m[2]!.length);
      markup(ls + at(m[1]!.length), markEnd);
      addFace(markEnd, le, "markdown-blockquote-face", true);
      break;
    }
    case "list": {
      const m = LIST.exec(text)!;
      const markStart = ls + at(m[1]!.length);
      addFace(markStart, markStart + charCount(m[2]!), "markdown-list-face");
      if (m[4] !== undefined) {
        const box = ls + at(m[1]!.length + m[2]!.length + m[3]!.length);
        addFace(box, box + 3, "markdown-gfm-checkbox-face");
      }
      break;
    }
  }
}

const SCHEMES =
  "acap|cid|data|dav|fax|file|ftp|geo|gopher|http|https|imap|ldap|mailto|mid|message|modem|news|nfs|nntp|pop|prospero|rtsp|service|sip|sips|tel|telnet|tip|urn|vemmi|wais";
const PLAIN_URI = new RegExp(`\\b(?:${SCHEMES}):[^\\]\\t\\n\\r<>; ]+`, "g");
const ANGLE_URI = /(<)([a-z][a-z0-9.+-]{1,31}:[^\]\t\n\r<>,;()]+)(>)/g;
const EMAIL = /<([\w.+-]+@[\w.-]+)>/g;
const INLINE_LINK = /(!)?(\[)((?:\\\]|[^\]])*)(\])(\()[ \t\n]*([^)]*?)(?:[ \t\n]+("[^"]*"))?[ \t\n]*(\))/g;
const REF_LINK = /(!)?(\[)([^\]^][^\]]*|)(\])(\[)([^\]]*?)(\])/g;
const REF_DEFINITION = /^( {0,3})(\[)([^\]\n]+?)(\])(:)[ \t]*(.*?)[ \t]*( "[^"]*"$|$)/;
const FOOTNOTE = /(\[\^)(.+?)(\])/g;
/** A footnote's definition, [^label]: text, with its label and the space after the colon. */
const FOOTNOTE_DEFINITION = /^ {0,3}\[\^([\p{L}\p{N}-]*?)\]:([ \t]*)/u;
const WIKI_LINK = /(?<!\\)(\[\[)([^\]|]+)(?:(\|)([^\]]+))?(\]\])/g;
const BOLD = /(?<!\\)(\*\*|__)([^\s\\]|[^\s](?:[^\n]|\n(?!\n))*?[^\\\s])\1/g;
const ITALIC = /(?<![\\*\w])(\*|_)(?![\s*_])((?:[^\n]|\n(?!\n))*?[^\s\\])\1(?![*\w])/g;
const ITALIC_STAR = /(?<![\\*])(\*)(?![\s*])((?:[^\n]|\n(?!\n))*?[^\s\\*])\*(?!\*)/g;
const STRIKE = /(?<!\\)(~~)([^\s\\]|[^\s](?:[^\n]|\n(?!\n))*?[^\\\s])~~/g;
const HIGHLIGHT = /(?<!\\)(==)([^\s\\]|[^\s](?:[^\n]|\n(?!\n))*?[^\\\s])==/g;
const KBD = /(<kbd>)((?:[^\n]|\n(?!\n))*?)(<\/kbd>)/g;
const HTML_TAG = /(<\/?)([A-Za-z][\w-]*)((?:\s+[A-Za-z:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^'">\s]+))?)*\s*)(\/?>)/g;
const HTML_ATTR = /([A-Za-z:-]+)(?:\s*(=)\s*("[^"]*"|'[^']*'|[^'">\s]+))?/g;
const HTML_ENTITY = /&#?[A-Za-z0-9]+;/g;
const INLINE_COMMENT = /<!--[\s\S]*?--[ \t]*>/g;
const ESCAPE = /(\\)[\\`*_{}[\]()#+\-.!<>|~"$=^]/g;

/** Every match of a global regexp in text, from the start. */
function matches(re: RegExp, text: string): RegExpExecArray[] {
  re.lastIndex = 0;
  const found: RegExpExecArray[] = [];
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    found.push(m);
    if (m[0].length === 0) re.lastIndex++;
  }
  return found;
}

/** Replaces text[from, to) with a character of no meaning, keeping its length. */
function mask(chars: string[], from: number, to: number): void {
  for (let i = from; i < to; i++) if (chars[i] !== "\n") chars[i] = "\u0001";
}

/** The groups' starts in a match, in UTF-16 indices, found by their order in the match. */
function groupStarts(m: RegExpExecArray): number[] {
  const starts: number[] = [];
  let at = m.index;
  for (let g = 1; g < m.length; g++) {
    if (m[g] === undefined) {
      starts.push(-1);
      continue;
    }
    const i = m[0].indexOf(m[g]!, at - m.index);
    const start = i < 0 ? at : m.index + i;
    starts.push(start);
    at = start + m[g]!.length;
  }
  return [m.index, ...starts];
}

/**
 * Fontifies what is inline in a run of lines, a paragraph, a heading's
 * text or a list item: code spans, emphasis, links, URLs, footnotes, HTML
 * and escapes, as markdown-mode-font-lock-keywords does.
 */
function fontifyInline(text: string, start: number): void {
  const at = offsetter(text);
  const pos = (i: number): number => start + at(i);
  const chars = [...text.split("")];
  const masked = (): string => chars.join("");
  // Comments.
  for (const m of matches(INLINE_COMMENT, text)) {
    face(pos(m.index), pos(m.index + m[0].length), "markdown-comment-face");
    mask(chars, m.index, m.index + m[0].length);
  }
  // Code spans: a run of backquotes, then the next run of as many.
  for (let i = 0; i < text.length; ) {
    if (text[i] !== "`" || chars[i] !== "`" || (i > 0 && text[i - 1] === "\\")) {
      i++;
      continue;
    }
    let j = i;
    while (text[j] === "`") j++;
    const width = j - i;
    let k = j;
    let close = -1;
    while (k < text.length) {
      if (text[k] === "\n" && text[k + 1] === "\n") break;
      if (text[k] === "`") {
        let e = k;
        while (text[e] === "`") e++;
        if (e - k === width) {
          close = k;
          break;
        }
        k = e;
      } else k++;
    }
    if (close < 0) {
      i = j;
      continue;
    }
    markup(pos(i), pos(j));
    addFace(pos(j), pos(close), "markdown-inline-code-face");
    markup(pos(close), pos(close + width));
    mask(chars, i, close + width);
    i = close + width;
  }
  for (const m of matches(KBD, masked())) {
    const g = groupStarts(m);
    markup(pos(g[1]!), pos(g[1]! + m[1]!.length));
    addFace(pos(g[2]!), pos(g[2]! + m[2]!.length), "markdown-inline-code-face");
    markup(pos(g[3]!), pos(g[3]! + m[3]!.length));
    mask(chars, m.index, m.index + m[0].length);
  }
  // Links, whose URLs nothing else styles.
  const hideUrls = truthy(v("markdown-hide-urls"));
  for (const m of matches(INLINE_LINK, masked())) {
    const g = groupStarts(m);
    if (m[1] !== undefined) markup(pos(g[1]!), pos(g[1]! + 1));
    markup(pos(g[2]!), pos(g[2]! + 1));
    addFace(pos(g[3]!), pos(g[3]! + m[3]!.length), "markdown-link-face");
    markup(pos(g[4]!), pos(g[4]! + 1));
    markup(pos(g[5]!), pos(g[5]! + 1));
    // The URL and title are hidden with the markup, as markdown-fontify-inline-links hides them.
    markup(pos(g[6]!), pos(g[6]! + m[6]!.length), "markdown-url-face");
    if (m[7] !== undefined) markup(pos(g[7]!), pos(g[7]! + m[7].length), "markdown-link-title-face");
    markup(pos(g[8]!), pos(g[8]! + 1));
    // Between them, the spaces too.
    e8.putTextProperty(pos(g[5]!), pos(g[8]! + 1), "invisible", "markdown-markup");
    if (hideUrls) e8.putTextProperty(pos(g[5]!), pos(g[8]! + 1), "display", String(v("markdown-url-compose-char") ?? "∞"));
    mask(chars, g[4]!, m.index + m[0].length);
  }
  for (const m of matches(REF_LINK, masked())) {
    const g = groupStarts(m);
    if (m[1] !== undefined) markup(pos(g[1]!), pos(g[1]! + 1));
    markup(pos(g[2]!), pos(g[2]! + 1));
    addFace(pos(g[3]!), pos(g[3]! + m[3]!.length), "markdown-link-face");
    markup(pos(g[4]!), pos(g[4]! + 1));
    markup(pos(g[5]!), pos(g[5]! + 1));
    addFace(pos(g[6]!), pos(g[6]! + m[6]!.length), "markdown-reference-face");
    markup(pos(g[7]!), pos(g[7]! + 1));
    mask(chars, g[4]!, m.index + m[0].length);
  }
  if (truthy(v("markdown-enable-wiki-links"))) {
    for (const m of matches(WIKI_LINK, masked())) {
      const g = groupStarts(m);
      markup(pos(g[1]!), pos(g[1]! + 2));
      addFace(pos(g[2]!), pos(g[2]! + m[2]!.length), "markdown-link-face");
      if (m[3] !== undefined) {
        markup(pos(g[3]!), pos(g[3]! + 1));
        addFace(pos(g[4]!), pos(g[4]! + m[4]!.length), "markdown-link-face");
      }
      markup(pos(g[5]!), pos(g[5]! + 2));
      mask(chars, m.index, m.index + m[0].length);
    }
  }
  for (const m of matches(FOOTNOTE, masked())) {
    markup(pos(m.index), pos(m.index + 2));
    addFace(pos(m.index + 2), pos(m.index + 2 + m[2]!.length), "markdown-footnote-marker-face");
    markup(pos(m.index + m[0].length - 1), pos(m.index + m[0].length));
    mask(chars, m.index, m.index + m[0].length);
  }
  for (const m of matches(ANGLE_URI, masked())) {
    markup(pos(m.index), pos(m.index + 1));
    addFace(pos(m.index + 1), pos(m.index + 1 + m[2]!.length), "markdown-plain-url-face");
    markup(pos(m.index + m[0].length - 1), pos(m.index + m[0].length));
    mask(chars, m.index, m.index + m[0].length);
  }
  for (const m of matches(EMAIL, masked())) {
    addFace(pos(m.index), pos(m.index + m[0].length), "markdown-plain-url-face");
    mask(chars, m.index, m.index + m[0].length);
  }
  for (const m of matches(PLAIN_URI, masked())) {
    addFace(pos(m.index), pos(m.index + m[0].length), "markdown-plain-url-face");
    mask(chars, m.index, m.index + m[0].length);
  }
  for (const m of matches(HTML_TAG, masked())) {
    const g = groupStarts(m);
    addFace(pos(g[1]!), pos(g[1]! + m[1]!.length), "markdown-html-tag-delimiter-face");
    addFace(pos(g[2]!), pos(g[2]! + m[2]!.length), "markdown-html-tag-name-face");
    for (const a of matches(HTML_ATTR, m[3]!)) {
      const ag = groupStarts(a);
      const base = g[3]!;
      addFace(pos(base + ag[1]!), pos(base + ag[1]! + a[1]!.length), "markdown-html-attr-name-face");
      if (a[2] !== undefined) addFace(pos(base + ag[2]!), pos(base + ag[2]! + 1), "markdown-html-tag-delimiter-face");
      if (a[3] !== undefined) addFace(pos(base + ag[3]!), pos(base + ag[3]! + a[3].length), "markdown-html-attr-value-face");
    }
    addFace(pos(g[4]!), pos(g[4]! + m[4]!.length), "markdown-html-tag-delimiter-face");
    mask(chars, m.index, m.index + m[0].length);
  }
  for (const m of matches(HTML_ENTITY, masked())) addFace(pos(m.index), pos(m.index + m[0].length), "markdown-html-entity-face");
  // Emphasis: strike-through, bold, then italic, which bold's delimiters are not.
  const delimited = (re: RegExp, faceName: string): void => {
    for (const m of matches(re, masked())) {
      const d = m[1]!.length;
      const end = m.index + m[0].length;
      markup(pos(m.index), pos(m.index + d));
      addFace(pos(m.index + d), pos(end - d), faceName, true);
      markup(pos(end - d), pos(end));
      chars[m.index] = "\u0002";
      if (d === 2) chars[m.index + 1] = "\u0002";
      chars[end - 1] = "\u0002";
      if (d === 2) chars[end - 2] = "\u0002";
    }
  };
  delimited(STRIKE, "markdown-strike-through-face");
  if (truthy(v("markdown-enable-highlighting-syntax"))) delimited(HIGHLIGHT, "markdown-highlighting-face");
  delimited(BOLD, "markdown-bold-face");
  delimited(ITALIC, "markdown-italic-face");
  // An asterisk may emphasise inside a word too, as in un*frigging*believable.
  delimited(ITALIC_STAR, "markdown-italic-face");
  // Hard line breaks: two spaces at the end of a line the paragraph goes on after.
  let lineStart = 0;
  for (let nl = text.indexOf("\n"); nl >= 0; nl = text.indexOf("\n", lineStart)) {
    if (nl - lineStart >= 3 && text.slice(nl - 2, nl) === "  " && !/[ \t]/.test(text[nl - 3]!)) addFace(pos(nl - 2), pos(nl), "markdown-line-break-face");
    lineStart = nl + 1;
  }
  for (const m of matches(ESCAPE, masked())) markup(pos(m.index), pos(m.index + 1));
}

/** Fontifies a reference definition line, [label]: url "title". */
function fontifyReferenceDefinition(text: string, start: number): boolean {
  const m = REF_DEFINITION.exec(text);
  if (!m || m[3]!.startsWith("^")) return false;
  const at = offsetter(text);
  const g = groupStarts(m);
  const pos = (i: number): number => start + at(i);
  face(pos(g[2]!), pos(g[2]! + 1), "markdown-markup-face");
  face(pos(g[3]!), pos(g[3]! + m[3]!.length), "markdown-reference-face");
  face(pos(g[4]!), pos(g[4]! + 2), "markdown-markup-face");
  face(pos(g[6]!), pos(g[6]! + m[6]!.length), "markdown-url-face");
  if (m[7]) face(pos(g[7]!), pos(g[7]! + m[7].length), "markdown-link-title-face");
  return true;
}

/** Fontifies whole lines from start to end, for jit-lock-functions. */
function fontify(start: number, end: number): void {
  if (!e8.derivedModeP("markdown-mode")) return;
  const p = parse();
  const n = Math.min(p.lines.length, e8.lineCount());
  let first = e8.lineOf(start);
  let last = e8.lineOf(Math.max(start, end - 1));
  // A setext underline makes the line before it a heading.
  if (first > 0) first--;
  // Whole paragraphs, as emphasis and links may run over lines, and whole code blocks.
  while (first > 0 && inlineKind(p.kinds[first]) && inlineKind(p.kinds[first - 1])) first--;
  if (p.fence[first]! >= 0) first = p.fence[first]!;
  while (last + 1 < n && inlineKind(p.kinds[last]) && inlineKind(p.kinds[last + 1])) last++;
  while (last + 1 < n && p.fence[last]! >= 0 && p.fence[last + 1] === p.fence[last]) last++;
  if (last + 1 < n && p.kinds[last + 1] === "setext-rule") last++;
  const from = e8.lineStart(first);
  const to = Math.min(e8.lineEnd(last) + 1, e8.pointMax());
  e8.removeTextProperty(from, to, "face");
  e8.removeTextProperty(from, to, "invisible");
  e8.removeTextProperty(from, to, "display");
  let run = -1;
  const flushRun = (upTo: number): void => {
    if (run < 0) return;
    fontifyInline(p.lines.slice(run, upTo).join("\n"), e8.lineStart(run));
    run = -1;
  };
  for (let line = first; line <= last; line++) {
    const k = p.kinds[line]!;
    if (k === "fence-open") {
      flushRun(line);
      fontifyFence(p, line);
      while (line + 1 <= last && p.fence[line + 1] === p.fence[line]) line++;
      continue;
    }
    if (k === "fence-body" || k === "fence-close") continue;
    fontifyLine(p, line);
    if (k === "atx") {
      flushRun(line);
      const m = ATX.exec(p.lines[line]!);
      if (m) {
        const offset = m[1]!.length + m[2]!.length;
        fontifyInline(m[3]!, e8.lineStart(line) + charCount(p.lines[line]!.slice(0, offset)));
      }
      continue;
    }
    if (inlineKind(k)) {
      if (k === "text" && fontifyReferenceDefinition(p.lines[line]!, e8.lineStart(line))) {
        flushRun(line);
        continue;
      }
      if (run < 0) run = line;
      continue;
    }
    flushRun(line);
  }
  flushRun(last + 1);
}

// Editing helpers =============================================================

const lineText = (line = e8.lineOf(e8.point())): string => e8.lineText(line);
const currentLine = (): number => e8.lineOf(e8.point());
const blankLine = (line = currentLine()): boolean => line < 0 || line >= e8.lineCount() || BLANK.test(e8.lineText(line));

function useRegion(): [number, number] | undefined {
  const mark = e8.mark();
  if (!e8.regionActive() || mark === undefined || mark === e8.point()) return undefined;
  return [Math.min(mark, e8.point()), Math.max(mark, e8.point())];
}

/** The bounds of the word at point, or undefined, as bounds-of-thing-at-point does for words. */
function wordAtPoint(): [number, number] | undefined {
  const line = currentLine();
  const ls = e8.lineStart(line);
  const text = lineText(line);
  const at = e8.point() - ls;
  const chars = [...text];
  const word = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}_'-]/u.test(c);
  if (!word(chars[at]) && !word(chars[at - 1])) return undefined;
  let a = at;
  let b = at;
  while (a > 0 && word(chars[a - 1])) a--;
  while (b < chars.length && word(chars[b])) b++;
  return a === b ? undefined : [ls + a, ls + b];
}

/**
 * Wraps s1 and s2 around the region, else the word at point, else inserts
 * them with point between, as markdown-wrap-or-insert. The bounds of what
 * was wrapped, delimiters and all, or undefined.
 */
function wrapOrInsert(s1: string, s2: string, bounds?: [number, number]): [number, number] | undefined {
  const region = bounds ?? useRegion() ?? wordAtPoint();
  const point = e8.point();
  const [a, b] = region ?? [point, point];
  e8.gotoChar(b);
  e8.insert(s2);
  e8.gotoChar(a);
  e8.insert(s1);
  if (region !== undefined) {
    e8.gotoChar(point + charCount(s1));
    e8.deactivateMark();
    return [a, b + charCount(s1) + charCount(s2)];
  }
  return undefined;
}

/** The match of a delimited span around point on its line, as thing-at-point-looking-at, or undefined. */
function spanAtPoint(re: RegExp): { start: number; end: number; inner: string } | undefined {
  const line = currentLine();
  const ls = e8.lineStart(line);
  const text = lineText(line);
  const at = offsetter(text);
  const col = e8.point() - ls;
  for (const m of matches(new RegExp(re.source, "g"), text)) {
    const s = at(m.index);
    const e = at(m.index + m[0].length);
    if (col >= s && col <= e) return { start: ls + s, end: ls + e, inner: m[2]! };
  }
  return undefined;
}

/**
 * Inserts or removes delimiters, as markdown--insert-common: around the
 * region, removing them if it is already so marked up; at a span marked
 * up so, removing its markup; else around the word at point, or empty with
 * point between.
 */
function insertCommon(start: string, end: string, re: RegExp): void {
  const region = useRegion();
  if (region === undefined) {
    const span = spanAtPoint(re);
    if (span !== undefined) {
      const point = e8.point();
      const d = charCount(start);
      e8.deleteRegion(span.end - charCount(end), span.end);
      e8.deleteRegion(span.start, span.start + d);
      e8.gotoChar(Math.max(span.start, Math.min(point - d, span.end - d - charCount(end))));
      return;
    }
  } else {
    const text = e8.bufferText(region[0], region[1]);
    if (text.startsWith(start) && text.endsWith(end) && text.length >= start.length + end.length) {
      e8.deleteRegion(region[1] - charCount(end), region[1]);
      e8.deleteRegion(region[0], region[0] + charCount(start));
      return;
    }
  }
  wrapOrInsert(start, end);
}

/** Makes the line before point blank, unless it is the buffer's start, as markdown-ensure-blank-line-before. */
function ensureBlankLineBefore(): void {
  const line = currentLine();
  if (line > 0 && !blankLine(line - 1)) {
    e8.gotoChar(e8.lineStart(line));
    e8.insert("\n");
  }
}

/** Makes the line after point blank, as markdown-ensure-blank-line-after. */
function ensureBlankLineAfter(): void {
  const line = currentLine();
  if (line + 1 < e8.lineCount() && !blankLine(line + 1)) e8.saveExcursion(() => {
    e8.gotoChar(e8.lineEnd(line));
    e8.insert("\n");
  });
}

// Inserting markup ============================================================

const BOLD_AT = /(\*\*|__)((?:[^\n])+?)\1/;
const ITALIC_AT = /(?<![*_])([*_])([^*_\n]+?)\1(?![*_])/;
const CODE_AT = /(`)([^`\n]+?)`/;
const STRIKE_AT = /(~~)([^\n]+?)~~/;
const KBD_AT = /(<kbd>)([^\n]*?)<\/kbd>/;

function defineInsert(name: string, doc: string, run: () => void): void {
  e8.defineCommand({ name, doc, run });
}

defineInsert(
  "markdown-insert-bold",
  "Make the region or the word at point bold, or remove the markup from the bold text at point; else insert ** ** with point between. With markdown-bold-underscore, __ __.",
  () => {
    const d = truthy(v("markdown-bold-underscore")) ? "__" : "**";
    insertCommon(d, d, BOLD_AT);
  },
);
defineInsert(
  "markdown-insert-italic",
  "Make the region or the word at point italic, or remove the markup from the italic text at point; else insert * * with point between. With markdown-italic-underscore, _ _.",
  () => {
    const d = truthy(v("markdown-italic-underscore")) ? "_" : "*";
    insertCommon(d, d, ITALIC_AT);
  },
);
defineInsert("markdown-insert-strike-through", "Strike through the region or the word at point with ~~, or remove the markup from the struck-through text at point.", () => insertCommon("~~", "~~", STRIKE_AT));
defineInsert("markdown-insert-code", "Mark the region or the word at point up as inline code with backquotes, or remove the backquotes around the code at point.", () => insertCommon("`", "`", CODE_AT));
defineInsert("markdown-insert-kbd", "Put <kbd> tags around the region or the word at point, or remove them from the key at point.", () => insertCommon("<kbd>", "</kbd>", KBD_AT));

e8.defineCommand({
  name: "markdown-insert-hr",
  doc: "Insert a horizontal rule, the first of markdown-hr-strings; with a prefix argument N, the Nth, and with C-u the last.",
  params: [{ name: "arg", kind: "prefix" }],
  run: (arg: e8.PrefixArg) => {
    const strings = (v("markdown-hr-strings") as string[] | null) ?? ["* * *"];
    let i = 0;
    if (Array.isArray(arg)) i = strings.length - 1;
    else if (typeof arg === "number") i = Math.max(0, Math.min(arg - 1, strings.length - 1));
    if (!blankLine()) {
      e8.gotoChar(e8.lineEnd(currentLine()));
      e8.insert("\n");
    }
    ensureBlankLineBefore();
    e8.insert(strings[i]!);
    ensureBlankLineAfter();
  },
});

/** Removes the heading markup from the line point is on, keeping its text, as markdown-remove-header. */
function removeHeader(): void {
  const all = markdownHeadings();
  const h = headingOnLine(all, currentLine());
  if (h === undefined) return;
  if (h.setext) {
    e8.deleteRegion(e8.lineEnd(h.line), e8.lineEnd(h.lastLine));
  } else {
    e8.deleteRegion(e8.lineStart(h.line), e8.lineEnd(h.line));
    e8.gotoChar(e8.lineStart(h.line));
    e8.insert(h.text);
  }
  e8.gotoChar(e8.lineStart(h.line));
}

/** Inserts heading markup, as markdown-insert-header: around the region, the line's text, or nothing. */
export function markdownInsertHeader(levelIn = 1, textIn?: string, setext = false): void {
  const level = Math.min(Math.max(levelIn, 1), setext ? 2 : 6);
  let text = textIn;
  if (text === undefined) {
    const region = useRegion();
    if (region !== undefined) {
      text = e8.bufferText(region[0], region[1]);
      e8.deleteRegion(region[0], region[1]);
      e8.deactivateMark();
    } else {
      removeHeader();
      const line = currentLine();
      text = lineText(line);
      e8.deleteRegion(e8.lineStart(line), e8.lineEnd(line));
      e8.gotoChar(e8.lineStart(line));
      if (setext && BLANK.test(text)) text = e8.readString("Header text: ");
    }
    text = text.replace(/\s+/g, " ").trim();
  }
  ensureBlankLineBefore();
  if (setext) {
    e8.insert(`${text}\n${(level === 2 ? "-" : "=").repeat(Math.max(1, e8.stringWidth(text)))}`);
  } else {
    const hashes = "#".repeat(level);
    e8.insert(`${hashes} ${text}`);
    if (!truthy(v("markdown-asymmetric-header"))) e8.insert(` ${hashes}`);
  }
  ensureBlankLineAfter();
  if (setext) e8.gotoChar(e8.lineEnd(currentLine() - 1));
  else if (!truthy(v("markdown-asymmetric-header"))) e8.gotoChar(e8.point() - level - 1);
}

for (let level = 1; level <= 6; level++) {
  e8.defineCommand({
    name: `markdown-insert-header-atx-${level}`,
    doc: `Make the region or the line a level ${level} atx heading, # Heading #, or insert empty markup for one.`,
    run: () => markdownInsertHeader(level),
  });
}
for (const level of [1, 2]) {
  e8.defineCommand({
    name: `markdown-insert-header-setext-${level}`,
    doc: `Make the region or the line a level ${level} setext heading, underlined with ${level === 1 ? "=" : "-"}, asking for its text on a blank line.`,
    run: () => markdownInsertHeader(level, undefined, true),
  });
}

/** Inserts or changes a heading at the level and in the style of the one before, as markdown-insert-header-dwim. */
function insertHeaderDwim(arg: e8.PrefixArg, preferSetext: boolean): void {
  const all = markdownHeadings();
  const i = headingIndexAt(all, currentLine());
  const before = all[i];
  let level = before?.level;
  let setext = before !== undefined ? before.setext : preferSetext;
  if (preferSetext && before === undefined) setext = true;
  if (Array.isArray(arg) && arg[0] === 4 && level !== undefined && level > 1) level--;
  else if (Array.isArray(arg) && arg[0] === 16 && level !== undefined && level < 6) level++;
  else if (arg !== null && !Array.isArray(arg)) level = e8.prefixNumericValue(arg);
  if (level !== undefined) setext = setext && level <= 2;
  markdownInsertHeader(level ?? 1, undefined, setext);
}

e8.defineCommand({
  name: "markdown-insert-header-dwim",
  doc:
    "Insert or change a heading, at the level and in the style of the heading before point: a numeric prefix argument gives the level, C-u promotes it and C-u C-u demotes it. " +
    "The region, or the line's text, becomes the heading's text.",
  params: [{ name: "arg", kind: "prefix" }],
  run: (arg: e8.PrefixArg) => insertHeaderDwim(arg, false),
});
e8.defineCommand({
  name: "markdown-insert-header-setext-dwim",
  doc: "As markdown-insert-header-dwim, but making a setext heading, underlined, where the level allows.",
  params: [{ name: "arg", kind: "prefix" }],
  run: (arg: e8.PrefixArg) => insertHeaderDwim(arg, true),
});

e8.defineCommand({
  name: "markdown-insert-blockquote",
  doc: "Make the region a block quote, or start one on a line of its own.",
  run: () => {
    const region = useRegion();
    if (region !== undefined) {
      prefixRegion(region[0], region[1], "> ");
      return;
    }
    if (!blankLine()) {
      e8.gotoChar(e8.lineEnd(currentLine()));
      e8.insert("\n");
    }
    ensureBlankLineBefore();
    e8.insert("> ");
    ensureBlankLineAfter();
  },
});

/** Puts `prefix` before each line from start to end. */
function prefixRegion(start: number, end: number, prefix: string): void {
  const first = e8.lineOf(start);
  const last = e8.lineOf(Math.max(start, end - 1));
  for (let line = last; line >= first; line--) {
    e8.gotoChar(e8.lineStart(line));
    e8.insert(prefix);
  }
}

e8.defineCommand({
  name: "markdown-blockquote-region",
  doc: "Quote the region: > before each of its lines.",
  params: [{ name: "start", kind: "region-beginning" }, { name: "end", kind: "region-end" }],
  run: (start: number, end: number) => prefixRegion(start, end, "> "),
});
e8.defineCommand({
  name: "markdown-pre-region",
  doc: "Make the region preformatted: four spaces before each of its lines.",
  params: [{ name: "start", kind: "region-beginning" }, { name: "end", kind: "region-end" }],
  run: (start: number, end: number) => prefixRegion(start, end, "    "),
});
e8.defineCommand({
  name: "markdown-insert-pre",
  doc: "Make the region preformatted, or start a preformatted block on a line of its own.",
  run: () => {
    const region = useRegion();
    if (region !== undefined) {
      prefixRegion(region[0], region[1], "    ");
      return;
    }
    if (!blankLine()) {
      e8.gotoChar(e8.lineEnd(currentLine()));
      e8.insert("\n");
    }
    ensureBlankLineBefore();
    e8.insert("    ");
    ensureBlankLineAfter();
  },
});

/** The languages of the buffer's code blocks, most recent first, as markdown-gfm-parse-buffer-for-languages finds them. */
function usedLanguages(): string[] {
  const p = parse();
  const found: string[] = [];
  for (let i = p.lines.length - 1; i >= 0; i--) {
    if (p.kinds[i] !== "fence-open") continue;
    const lang = FENCE_OPEN.exec(p.lines[i]!)?.[4];
    if (lang !== undefined && !found.includes(lang)) found.push(lang);
  }
  return found;
}

e8.defineCommand({
  name: "markdown-insert-gfm-code-block",
  doc:
    "Insert a fenced code block, asking for its language with completion over the ones the buffer uses and GitHub knows, or put a fence around the region. " +
    "The language is put in braces with markdown-code-block-braces.",
  params: [
    {
      name: "lang",
      prompt: () => {
        const used = usedLanguages();
        return used.length > 0 ? `Programming language [${used[0]}]: ` : "Programming language: ";
      },
      collection: () => [...new Set([...usedLanguages(), ...((v("markdown-gfm-additional-languages") as string[] | null) ?? []), ...GFM_LANGUAGES])],
    },
  ],
  run: (langIn: string) => {
    const used = usedLanguages();
    let lang = (langIn ?? "").trim();
    if (lang === "" && used.length > 0) lang = used[0]!;
    const spaces = " ".repeat(num("markdown-spaces-after-code-fence", 1));
    const info = lang === "" ? "" : truthy(v("markdown-code-block-braces")) ? `${spaces}{${lang}}` : `${spaces}${lang}`;
    const region = useRegion();
    if (region !== undefined) {
      let [a, b] = region;
      if (e8.lineStart(e8.lineOf(b)) !== b || b === a) b = e8.lineEnd(e8.lineOf(b));
      a = e8.lineStart(e8.lineOf(a));
      e8.deactivateMark();
      e8.gotoChar(b);
      e8.insert(e8.lineStart(e8.lineOf(b)) === b && b !== a ? "```\n" : "\n```");
      e8.gotoChar(a);
      e8.insert(`\`\`\`${info}\n`);
      ensureBlankLineBefore();
      return;
    }
    if (!blankLine()) {
      e8.gotoChar(e8.lineEnd(currentLine()));
      e8.insert("\n");
    }
    ensureBlankLineBefore();
    const indent = " ".repeat(e8.currentIndentation());
    e8.deleteRegion(e8.lineStart(currentLine()), e8.lineEnd(currentLine()));
    e8.insert(`${indent}\`\`\`${info}\n${indent}\n${indent}\`\`\``);
    ensureBlankLineAfter();
    e8.gotoChar(e8.lineEnd(currentLine() - 1));
  },
});

e8.defineCommand({
  name: "markdown-electric-backquote",
  doc: "Insert a backquote; the third at the start of a line, with markdown-gfm-use-electric-backquote, starts a fenced code block instead, asking for its language.",
  params: [{ name: "n", kind: "count" }],
  run: (n: number) => {
    e8.insert("`".repeat(Math.max(1, n ?? 1)));
    if (!truthy(v("markdown-gfm-use-electric-backquote"))) return;
    const line = currentLine();
    const before = e8.bufferText(e8.lineStart(line), e8.point());
    if (/^[ \t]*```$/.test(before) && e8.point() === e8.lineEnd(line)) {
      e8.deleteRegion(e8.point() - 3, e8.point());
      e8.callInteractively("markdown-insert-gfm-code-block" as e8.CommandName);
    }
  },
});

/** Reads a link's URL and text, as markdown-insert-link does, the text defaulting to the region or the word at point. */
function insertLink(image: boolean): void {
  const region = useRegion() ?? wordAtPoint();
  const defaultText = region !== undefined ? e8.bufferText(region[0], region[1]) : "";
  const url = e8.readString(image ? "Image URL: " : "Link URL: ");
  if (url.trim() === "") e8.userError("A URL is needed");
  const text = e8.readString(image ? "Alt text: " : "Link text: ", { initial: defaultText });
  const title = e8.readString("Title (optional): ");
  if (region !== undefined) e8.deleteRegion(region[0], region[1]);
  e8.deactivateMark();
  e8.insert(`${image ? "!" : ""}[${text}](${url}${title === "" ? "" : ` "${title}"`})`);
}

e8.defineCommand({
  name: "markdown-insert-link",
  doc: "Insert an inline link, [text](url \"title\"), asking for its URL, text and title; the region, or the word at point, is the text it starts with.",
  run: () => insertLink(false),
});
e8.defineCommand({
  name: "markdown-insert-image",
  doc: "Insert an inline image, ![alt text](url \"title\"), asking for its URL, alt text and title.",
  run: () => insertLink(true),
});
e8.defineCommand({
  name: "markdown-insert-uri",
  doc: "Put angle brackets around the region, or the URL at point, or insert empty ones with point between.",
  run: () => void wrapOrInsert("<", ">"),
});
e8.defineCommand({
  name: "markdown-insert-wiki-link",
  doc: "Make the region, or the word at point, a [[wiki link]], or insert empty brackets with point between.",
  run: () => void wrapOrInsert("[[", "]]"),
});

/** The labels of the buffer's footnotes. */
function footnoteLabels(): number[] {
  const labels: number[] = [];
  for (const m of matches(/\[\^(\d+)\]/g, e8.bufferText(e8.pointMin(), e8.pointMax()))) labels.push(Number(m[1]));
  return labels;
}

e8.defineCommand({
  name: "markdown-insert-footnote",
  doc: "Insert a footnote marker with the next free number, and its definition at the end of the buffer, and go to the definition to write it.",
  run: () => {
    const label = Math.max(0, ...footnoteLabels()) + 1;
    e8.insert(`[^${label}]`);
    e8.gotoChar(e8.pointMax());
    if (!blankLine(e8.lineCount() - 1)) e8.insert("\n");
    if (!blankLine(e8.lineCount() - 2)) e8.insert("\n");
    e8.insert(`[^${label}]: `);
  },
});

e8.defineCommand({
  name: "markdown-insert-gfm-checkbox",
  doc: "Insert a GFM checkbox, [ ], after the list marker of the item at point, or at point.",
  run: () => {
    const line = currentLine();
    const m = LIST.exec(lineText(line));
    if (m && m[4] === undefined) {
      e8.gotoChar(e8.lineStart(line) + charCount(m[1]! + m[2]! + m[3]!));
      e8.insert("[ ] ");
    } else e8.insert("[ ] ");
  },
});

// Lists =======================================================================

export interface ListItem {
  line: number;
  indent: number;
  marker: string;
  spacing: string;
  checkbox: string | undefined;
  /** The column the item's text starts at. */
  content: number;
}

function listItemOn(line: number): ListItem | undefined {
  if (line < 0 || line >= e8.lineCount()) return undefined;
  const p = parse();
  if (p.kinds[line] !== "list") return undefined;
  const m = LIST.exec(e8.lineText(line))!;
  const indent = indentWidth(m[1]!);
  return { line, indent, marker: m[2]!, spacing: m[3]!, checkbox: m[4], content: indent + m[2]!.length + Math.max(1, m[3]!.length) + (m[4]?.length ?? 0) };
}

/** The list item point is in, as markdown-cur-list-item-bounds: its own line, or one above that it continues. */
export function markdownCurListItem(line = currentLine()): ListItem | undefined {
  const own = listItemOn(line);
  if (own !== undefined) return own;
  if (blankLine(line)) return undefined;
  const indent = indentWidth(e8.lineText(line));
  for (let l = line - 1; l >= 0; l--) {
    const item = listItemOn(l);
    if (item !== undefined) return indent > item.indent || !blankLine(l + 1) ? item : undefined;
    if (blankLine(l)) {
      if (indent === 0) return undefined;
      continue;
    }
    if (indentWidth(e8.lineText(l)) === 0 && listItemOn(l) === undefined && indent === 0) {
      // A paragraph's lines continue the item above them only if lazily, without a blank line.
      continue;
    }
  }
  return undefined;
}

/** The line after the item on line, its continuation and sublists. */
function listItemEnd(item: ListItem): number {
  const n = e8.lineCount();
  let end = item.line + 1;
  while (end < n) {
    const text = e8.lineText(end);
    if (BLANK.test(text)) {
      // A blank line goes on the item only if indented text follows.
      let next = end;
      while (next < n && blankLine(next)) next++;
      if (next < n && indentWidth(e8.lineText(next)) > item.indent) {
        end = next;
        continue;
      }
      break;
    }
    const other = listItemOn(end);
    if (other !== undefined && other.indent <= item.indent) break;
    if (other === undefined && indentWidth(text) <= item.indent && blankLine(end - 1)) break;
    end++;
  }
  return end;
}

e8.defineCommand({
  name: "markdown-insert-list-item",
  doc:
    "Insert a new list item after the one at point, splitting the line at point: the next number in an ordered list, the same bullet otherwise, an unticked checkbox after a checkbox. " +
    "C-u makes it a level less indented, C-u C-u a level more. Outside a list, start one with markdown-unordered-list-item-prefix.",
  params: [{ name: "arg", kind: "prefix" }],
  run: (arg: e8.PrefixArg) => markdownInsertListItem(Array.isArray(arg) ? arg[0]! : 1),
});

/** Inserts a new list item, as markdown-insert-list-item; arg 4 outdents it, 16 indents it. */
export function markdownInsertListItem(arg = 1): void {
  let line = currentLine();
  while (line > 0 && blankLine(line) && markdownCurListItem(line) === undefined) line--;
  const item = markdownCurListItem(line);
  if (item === undefined) {
    if (!blankLine()) {
      e8.gotoChar(e8.lineEnd(currentLine()));
      e8.insert("\n");
    }
    e8.insert(String(v("markdown-unordered-list-item-prefix") ?? "  * "));
    return;
  }
  // At a marker's end, with nothing typed after it, start the item above this line.
  const before = e8.bufferText(e8.lineStart(currentLine()), e8.point());
  if (listItemOn(currentLine()) !== undefined && /^[ \t]*$/.test(before)) {
    e8.gotoChar(e8.lineStart(currentLine()));
    e8.insert("\n");
    e8.gotoChar(e8.point() - 1);
  } else if (!blankLine()) {
    e8.call("newline");
    e8.deleteRegion(e8.lineStart(currentLine()), e8.lineStart(currentLine()) + /^[ \t]*/.exec(lineText())![0].length);
  }
  const width = num("markdown-list-indent-width", 4);
  let indent = item.indent;
  let marker = item.marker;
  if (arg === 4) {
    indent = Math.max(0, item.indent - width);
    for (let l = item.line - 1; l >= 0; l--) {
      const up = listItemOn(l);
      if (up !== undefined && up.indent < item.indent) {
        marker = up.marker;
        break;
      }
      if (up === undefined && blankLine(l) && indentWidth(e8.lineText(Math.min(l + 1, e8.lineCount() - 1))) === 0) break;
    }
  } else if (arg === 16) indent = item.indent + width;
  const pad = " ".repeat(indent);
  const checkbox = item.checkbox !== undefined ? item.checkbox.replace(/[xX]/, " ") : "";
  if (/[0-9]/.test(marker)) {
    if (arg === 16) {
      e8.insert(`${pad}1. ${checkbox}`);
      return;
    }
    let number = 0;
    let spacing = ". ";
    for (let l = currentLine() - 1; l >= 0; l--) {
      const m = new RegExp(`^${pad}([0-9]+)(\\.[ \\t]*)`).exec(e8.lineText(l));
      if (m && indentWidth(e8.lineText(l)) === indent) {
        number = Number(m[1]);
        spacing = m[2]!;
        break;
      }
    }
    const next = truthy(v("markdown-ordered-list-enumeration")) && number > 0 ? String(number + 1) : "1";
    // Keep the text aligned when the number gains a digit.
    const adjust = String(number).length - next.length;
    if (number > 0 && adjust < 0 && !spacing.includes("\t") && spacing.length - 1 + adjust >= 1) spacing = spacing.slice(0, spacing.length + adjust);
    e8.insert(`${pad}${next}${spacing}${checkbox}`);
  } else {
    e8.insert(`${pad}${marker}${item.spacing === "" ? " " : item.spacing}${checkbox}`);
  }
}

/** Ticks or unticks the checkbox on the line point is on, as markdown-toggle-gfm-checkbox. The new state, or undefined if there is none. */
export function markdownToggleGfmCheckbox(): string | undefined {
  const line = currentLine();
  const text = lineText(line);
  const m = LIST.exec(text);
  const box = m?.[4] !== undefined ? charCount(m[1]! + m[2]! + m[3]!) : -1;
  if (box < 0) return undefined;
  const at = e8.lineStart(line) + box + 1;
  const ticked = e8.bufferText(at, at + 1) !== " ";
  const mark = ticked ? " " : truthy(v("markdown-gfm-uppercase-checkbox")) ? "X" : "x";
  e8.saveExcursion(() => {
    e8.deleteRegion(at, at + 1);
    e8.gotoChar(at);
    e8.insert(mark);
  });
  return `[${mark}]`;
}

e8.defineCommand({
  name: "markdown-toggle-gfm-checkbox",
  doc: "Tick or untick the GFM checkbox, [ ] or [x], of the list item on this line.",
  run: () => {
    if (markdownToggleGfmCheckbox() === undefined) e8.userError("No checkbox on this line");
  },
});

// Indentation =================================================================

/** The indentation of the list items above line, innermost first, as markdown-calculate-list-levels. */
function listLevels(line: number): number[] {
  const levels: number[] = [];
  let item = markdownCurListItem(line) ?? markdownCurListItem(line - 1);
  while (item !== undefined) {
    levels.push(item.indent);
    let up: ListItem | undefined;
    for (let l = item.line - 1; l >= 0 && up === undefined; l--) {
      const other = listItemOn(l);
      if (other !== undefined && other.indent < item.indent) up = other;
      else if (other === undefined && !blankLine(l) && indentWidth(e8.lineText(l)) === 0) break;
    }
    item = up;
  }
  return levels;
}

/**
 * The columns a line might be indented to, as markdown-calc-indents: the
 * previous line's indentation first, the default, then the text of the list
 * item it starts, a preformatted block's, a tab stop either side, the list
 * markers above, and the first column.
 */
function calcIndents(line: number): number[] {
  const tab = num("tab-width", 4);
  const prevText = line > 0 ? e8.lineText(line - 1) : "";
  const prev = line > 0 ? indentWidth(prevText) : 0;
  const positions = [prev];
  const list = LIST.exec(prevText);
  if (list) positions.push(indentWidth(list[1]!) + list[2]!.length + list[3]!.length);
  // A preformatted block's indentation here: four columns past the text of the list item it would be in.
  const item = markdownCurListItem(line - 1);
  positions.push(item !== undefined ? item.content + 4 : 4);
  positions.push(prev + tab);
  if (prev > tab) positions.push(prev - tab);
  positions.push(...listLevels(line));
  positions.push(0);
  return positions;
}

/** Indents the line to column, point keeping its place in the text. */
function indentLineTo(line: number, column: number): void {
  const now = e8.currentIndentation();
  const offset = e8.currentColumn() - now;
  const ls = e8.lineStart(line);
  e8.deleteRegion(ls, ls + /^[ \t]*/.exec(lineText(line))![0].length);
  e8.gotoChar(ls);
  e8.insert(" ".repeat(column));
  e8.gotoChar(Math.min(ls + column + Math.max(0, offset), e8.lineEnd(line)));
}

const sortedIndents = (line: number): number[] => [...new Set(calcIndents(line))].sort((a, b) => a - b);

e8.defineCommand({
  name: "markdown-indent-line",
  doc:
    "Indent the line as the previous one is indented; run from TAB (markdown-cycle), to the next of the columns markdown-calc-indents gives: the text of a list item, a tab stop, " +
    "the list markers above, and back to the first column.",
  run: () => {
    const line = currentLine();
    if (e8.thisCommand() !== "markdown-cycle") {
      indentLineTo(line, calcIndents(line)[0]!);
      return;
    }
    const positions = sortedIndents(line);
    const i = positions.indexOf(e8.currentIndentation());
    indentLineTo(line, i < 0 ? 0 : (positions[i + 1] ?? 0));
  },
});

e8.defineCommand({
  name: "markdown-enter-key",
  doc:
    "Start a new line, indented with markdown-indent-line as markdown-indent-on-enter says. With markdown-indent-on-enter indent-and-new-item, in a list start a new item, " +
    "or in an empty item remove it.",
  run: () => {
    const how = v("markdown-indent-on-enter");
    if (!truthy(how)) {
      e8.call("newline");
      return;
    }
    if (how === "indent-and-new-item" && !markdownCodeBlockAtPos(e8.point())) {
      const item = listItemOn(currentLine());
      if (item !== undefined) {
        const ls = e8.lineStart(currentLine());
        if (e8.lineEnd(currentLine()) - ls === item.content) {
          e8.deleteRegion(ls, e8.lineEnd(currentLine()));
          e8.call("newline");
          return;
        }
        markdownInsertListItem(1);
        return;
      }
    }
    e8.call("newline");
    e8.call("markdown-indent-line" as e8.CommandName);
  },
});

e8.defineCommand({
  name: "markdown-outdent-or-delete",
  doc: "At the start of a line's text, after its indentation, outdent it to the next of the columns markdown-indent-line would choose; else delete the character before point.",
  params: [{ name: "n", kind: "count" }],
  run: (n: number) => {
    const line = currentLine();
    const col = e8.currentColumn();
    const indent = e8.currentIndentation();
    if (useRegion() === undefined && col > 0 && col === indent) {
      // As markdown-outdent-find-next-position: the column before this one.
      indentLineTo(line, Math.max(0, ...sortedIndents(line).filter((c) => c < col)));
      return;
    }
    e8.call("delete-backward-char", n ?? 1);
  },
});

// Outline commands ============================================================

e8.defineCommand({
  name: "markdown-cycle",
  doc:
    "On a heading, cycle what shows under it: folded, its children's headings, everything under it. With a prefix argument, cycle the whole buffer, as markdown-shifttab. " +
    "Elsewhere indent the line, as TAB does.",
  params: [{ name: "arg", kind: "prefix" }],
  run: (arg: e8.PrefixArg) => {
    if (arg !== null) {
      cycleGlobal();
      return;
    }
    const all = markdownHeadings();
    const line = currentLine();
    const h = headingOnLine(all, line);
    if (h === undefined) {
      e8.call("indent-for-tab-command");
      return;
    }
    const i = all.indexOf(h);
    const end = subtreeEndLine(all, i, e8.lineCount());
    e8.gotoChar(e8.lineStart(h.line));
    let lastText = end - 1;
    while (lastText > h.lastLine && blankLine(lastText)) lastText--;
    const repeated = e8.lastCommand() === e8.thisCommand();
    const status = v("markdown-cycle-subtree-status");
    if (lastText <= h.lastLine) {
      e8.message("EMPTY ENTRY");
      e8.setVariable("markdown-cycle-subtree-status", null);
    } else if (hiddenAfter(h.lastLine) && !(repeated && status === "children")) {
      showChildren(all, i);
      // With nothing hidden under its children, the subtree is shown: say so.
      const hasHidden = all.slice(i + 1).some((c) => c.line < end && hiddenAfter(c.lastLine));
      if (!hasHidden) {
        e8.message("SUBTREE");
        e8.setVariable("markdown-cycle-subtree-status", "subtree");
      } else {
        e8.message("CHILDREN");
        e8.setVariable("markdown-cycle-subtree-status", "children");
      }
    } else if (repeated && status === "children") {
      showSubtree(all, i);
      e8.message("SUBTREE");
      e8.setVariable("markdown-cycle-subtree-status", "subtree");
    } else {
      hideSubtree(all, i);
      e8.message("FOLDED");
      e8.setVariable("markdown-cycle-subtree-status", "folded");
    }
  },
});

function cycleGlobal(): void {
  const repeated = e8.lastCommand() === e8.thisCommand();
  const status = v("markdown-cycle-global-status");
  if (repeated && status === 2) {
    hideSublevels(1);
    e8.message("CONTENTS");
    e8.setVariable("markdown-cycle-global-status", 3);
  } else if (repeated && status === 3) {
    showAll();
    e8.message("SHOW ALL");
    e8.setVariable("markdown-cycle-global-status", 1);
  } else {
    hideBody();
    e8.message("OVERVIEW");
    e8.setVariable("markdown-cycle-global-status", 2);
  }
}

e8.defineCommand({
  name: "markdown-shifttab",
  doc: "Cycle the whole buffer's visibility: every heading, OVERVIEW; the top-level headings, CONTENTS; everything, SHOW ALL.",
  run: () => cycleGlobal(),
});
e8.defineCommand({ name: "markdown-show-all", doc: "Show everything the headings hide.", run: () => showAll() });
e8.defineCommand({ name: "markdown-hide-body", doc: "Show only the headings.", run: () => hideBody() });

/** The headings that are shown, not inside a folded heading. */
function visibleHeadings(all: Heading[]): Heading[] {
  return all.filter((h) => h.line === 0 || !e8.invisibleP(e8.lineStart(h.line)));
}

function gotoHeading(h: Heading | undefined, what: string): void {
  if (h === undefined) e8.userError(`No ${what} heading`);
  e8.gotoChar(e8.lineStart(h.line));
}

e8.defineCommand({
  name: "markdown-outline-next",
  doc: "Go to the next heading that shows; with a count, that many.",
  params: [{ name: "n", kind: "count" }],
  shiftSelect: true,
  run: (n: number) => moveHeadings(n ?? 1),
});
e8.defineCommand({
  name: "markdown-outline-previous",
  doc: "Go to the previous heading that shows; with a count, that many back.",
  params: [{ name: "n", kind: "count" }],
  shiftSelect: true,
  run: (n: number) => moveHeadings(-(n ?? 1)),
});

function moveHeadings(n: number): void {
  const shown = visibleHeadings(markdownHeadings());
  const line = currentLine();
  let i = n > 0 ? shown.findIndex((h) => h.line > line) - 1 : shown.findIndex((h) => h.line >= line);
  if (n > 0 && i === -2) i = shown.length - 1;
  if (n < 0 && i === -1) i = shown.length;
  const target = shown[i + n];
  if (target === undefined) {
    e8.gotoChar(n > 0 ? e8.pointMax() : e8.pointMin());
    return;
  }
  e8.gotoChar(e8.lineStart(target.line));
}

function sameLevel(n: number): void {
  const all = markdownHeadings();
  const i = headingIndexAt(all, currentLine());
  if (i < 0) e8.userError("Before first heading");
  const h = all[i]!;
  let at = i;
  for (let k = 0; k < Math.abs(n); k++) {
    let j = at + Math.sign(n);
    while (j >= 0 && j < all.length && all[j]!.level > h.level) j += Math.sign(n);
    if (j < 0 || j >= all.length || all[j]!.level < h.level) {
      e8.userError(`No ${n > 0 ? "following" : "previous"} same-level heading`);
    }
    at = j;
  }
  e8.gotoChar(e8.lineStart(all[at]!.line));
}

e8.defineCommand({
  name: "markdown-outline-next-same-level",
  doc: "Go to the next heading at the level of this one, within its parent.",
  params: [{ name: "n", kind: "count" }],
  shiftSelect: true,
  run: (n: number) => sameLevel(n ?? 1),
});
e8.defineCommand({
  name: "markdown-outline-previous-same-level",
  doc: "Go to the previous heading at the level of this one, within its parent.",
  params: [{ name: "n", kind: "count" }],
  shiftSelect: true,
  run: (n: number) => sameLevel(-(n ?? 1)),
});
e8.defineCommand({
  name: "markdown-outline-up",
  doc: "Go to the heading this one is under.",
  params: [{ name: "n", kind: "count" }],
  shiftSelect: true,
  run: (n: number) => {
    const all = markdownHeadings();
    let i = headingIndexAt(all, currentLine());
    if (i < 0) e8.userError("Before first heading");
    for (let k = 0; k < (n ?? 1); k++) {
      const level = all[i]!.level;
      let j = i - 1;
      while (j >= 0 && all[j]!.level >= level) j--;
      if (j < 0) {
        if (k === 0) e8.userError("Already at top level of the outline");
        break;
      }
      i = j;
    }
    gotoHeading(all[i], "parent");
  },
});
e8.defineCommand({
  name: "markdown-back-to-heading",
  doc: "Go to the start of the heading point is under.",
  run: () => {
    const all = markdownHeadings();
    const i = headingIndexAt(all, currentLine());
    if (i < 0) e8.userError("Before first heading");
    gotoHeading(all[i], "");
  },
});

// Promotion, demotion and moving ==============================================

/** Changes the level of the heading on line by delta, keeping its style where it can, as markdown-promote and markdown-demote do. */
function changeHeadingLevel(h: Heading, delta: number): void {
  const level = h.level + delta;
  if (level < 1 || level > 6) e8.userError(delta < 0 ? "Cannot promote further" : "Cannot demote further");
  const point = e8.point();
  const column = point - e8.lineStart(h.line);
  e8.gotoChar(e8.lineStart(h.line));
  const symmetric = !h.setext && /[ \t]#+[ \t]*$/.test(e8.lineText(h.line));
  if (h.setext && level <= 2) {
    const rule = e8.lineText(h.lastLine);
    e8.deleteRegion(e8.lineStart(h.lastLine), e8.lineEnd(h.lastLine));
    e8.gotoChar(e8.lineStart(h.lastLine));
    e8.insert((level === 1 ? "=" : "-").repeat(rule.trimEnd().length));
    e8.gotoChar(Math.min(point, e8.pointMax()));
    return;
  }
  e8.deleteRegion(e8.lineStart(h.line), e8.lineEnd(h.lastLine));
  const hashes = "#".repeat(level);
  e8.gotoChar(e8.lineStart(h.line));
  e8.insert(`${hashes} ${h.text}${symmetric || (h.setext && !truthy(v("markdown-asymmetric-header"))) ? ` ${hashes}` : ""}`);
  e8.gotoChar(Math.min(e8.lineStart(h.line) + Math.max(0, column + (h.setext ? level + 1 : delta)), e8.lineEnd(h.line)));
}

/** Indents the list item, and what is under it, by delta columns. */
function shiftListItem(item: ListItem, delta: number): void {
  if (item.indent + delta < 0) e8.userError("Cannot outdent further");
  const end = listItemEnd(item);
  const point = e8.point();
  const pointLine = currentLine();
  const pointCol = point - e8.lineStart(pointLine);
  for (let l = item.line; l < end; l++) {
    if (blankLine(l)) continue;
    const ls = e8.lineStart(l);
    const text = e8.lineText(l);
    const indent = indentWidth(text);
    e8.deleteRegion(ls, ls + /^[ \t]*/.exec(text)![0].length);
    e8.gotoChar(ls);
    e8.insert(" ".repeat(Math.max(0, indent + delta)));
  }
  e8.gotoChar(Math.min(e8.lineStart(pointLine) + Math.max(0, pointCol + delta), e8.lineEnd(pointLine)));
}

function promoteOrDemote(delta: number): void {
  const all = markdownHeadings();
  const h = headingOnLine(all, currentLine());
  if (h !== undefined) {
    changeHeadingLevel(h, delta);
    return;
  }
  const item = markdownCurListItem();
  if (item !== undefined) {
    shiftListItem(item, delta * num("markdown-list-indent-width", 4));
    return;
  }
  e8.userError("Nothing to promote or demote at point");
}

e8.defineCommand({
  name: "markdown-promote",
  doc: "Promote the heading at point a level, or outdent the list item at point and what is under it by markdown-list-indent-width.",
  run: () => promoteOrDemote(-1),
});
e8.defineCommand({
  name: "markdown-demote",
  doc: "Demote the heading at point a level, or indent the list item at point and what is under it by markdown-list-indent-width.",
  run: () => promoteOrDemote(1),
});

/** Swaps the lines [a, b) with [b, c), keeping point at the same place in what moved. */
function swapLines(a: number, b: number, c: number, keepFirst: boolean): void {
  const pa = e8.lineStart(a);
  const pb = e8.lineStart(b);
  const pc = c >= e8.lineCount() ? e8.pointMax() : e8.lineStart(c);
  let first = e8.bufferText(pa, pb);
  let second = e8.bufferText(pb, pc);
  if (!second.endsWith("\n")) {
    second += "\n";
    first = first.slice(0, -1);
  }
  const offset = e8.point() - (keepFirst ? pa : pb);
  e8.deleteRegion(pa, pc);
  e8.gotoChar(pa);
  e8.insert(second + first);
  e8.gotoChar(keepFirst ? pa + charCount(second) + offset : pa + offset);
}

function move(up: boolean): void {
  const all = markdownHeadings();
  const line = currentLine();
  const h = headingOnLine(all, line);
  const lines = e8.lineCount();
  if (h !== undefined) {
    const i = all.indexOf(h);
    const end = subtreeEndLine(all, i, lines);
    if (up) {
      let j = i - 1;
      while (j >= 0 && all[j]!.level > h.level) j--;
      if (j < 0 || all[j]!.level < h.level) e8.userError("Cannot move past superior level");
      swapLines(all[j]!.line, h.line, end, false);
    } else {
      const j = all.findIndex((x) => x.line === end);
      if (j < 0 || all[j]!.level < h.level) e8.userError("Cannot move past superior level");
      swapLines(h.line, end, subtreeEndLine(all, j, lines), true);
    }
    return;
  }
  const item = markdownCurListItem();
  if (item !== undefined) {
    const end = listItemEnd(item);
    if (up) {
      let l = item.line - 1;
      while (l >= 0 && (blankLine(l) || listItemOn(l) === undefined || listItemOn(l)!.indent > item.indent)) {
        if (listItemOn(l) === undefined && !blankLine(l) && indentWidth(e8.lineText(l)) <= item.indent) {
          l = -1;
          break;
        }
        l--;
      }
      const prev = l >= 0 ? listItemOn(l) : undefined;
      if (prev === undefined || prev.indent !== item.indent) e8.userError("No previous list item");
      swapLines(prev.line, item.line, end, false);
    } else {
      const next = listItemOn(end);
      if (next === undefined || next.indent !== item.indent) e8.userError("No next list item");
      swapLines(item.line, end, listItemEnd(next), true);
    }
    return;
  }
  // Else the line, as markdown-move-up moves a paragraph's line.
  if (up ? line === 0 : line + 1 >= lines) return;
  if (up) swapLines(line - 1, line, line + 1, false);
  else swapLines(line, line + 1, line + 2, true);
}

e8.defineCommand({ name: "markdown-move-up", doc: "Move the heading at point and its subtree above the heading before it, or the list item above the one before it, or the line above the line before.", run: () => move(true) });
e8.defineCommand({ name: "markdown-move-down", doc: "Move the heading at point and its subtree below the next one, or the list item below the next, or the line below the next.", run: () => move(false) });

function subtreeBounds(): [number, number] {
  const all = markdownHeadings();
  const i = headingIndexAt(all, currentLine());
  if (i < 0) e8.userError("Before first heading");
  const end = subtreeEndLine(all, i, e8.lineCount());
  return [e8.lineStart(all[i]!.line), end >= e8.lineCount() ? e8.pointMax() : e8.lineStart(end)];
}

e8.defineCommand({
  name: "markdown-mark-subtree",
  doc: "Put the region around the heading at point and everything under it.",
  run: () => {
    const [a, b] = subtreeBounds();
    e8.gotoChar(a);
    e8.pushMark(b, { activate: true });
  },
});
e8.defineCommand({
  name: "markdown-narrow-to-subtree",
  doc: "Narrow the buffer to the heading at point and everything under it.",
  run: () => {
    const [a, b] = subtreeBounds();
    e8.narrowToRegion(a, b);
  },
});

// Links =======================================================================

export interface Link {
  start: number;
  end: number;
  text: string;
  /** The URL, or the reference's label for a reference link. */
  url: string;
  reference: boolean;
  wiki: boolean;
}

/** The links on a line, in order, as markdown-make-regex-link-generic finds them. */
function linksOn(line: number): Link[] {
  const text = e8.lineText(line);
  const ls = e8.lineStart(line);
  const at = offsetter(text);
  const found: Link[] = [];
  const add = (index: number, length: number, linkText: string, url: string, reference = false, wiki = false): void => {
    if (found.some((l) => index + ls < l.end && ls + at(index + length) > l.start)) return;
    found.push({ start: ls + at(index), end: ls + at(index + length), text: linkText, url, reference, wiki });
  };
  for (const m of matches(INLINE_LINK, text)) add(m.index, m[0].length, m[3]!, m[6]!);
  for (const m of matches(REF_LINK, text)) add(m.index, m[0].length, m[3]!, m[6]! === "" ? m[3]! : m[6]!, true);
  if (truthy(v("markdown-enable-wiki-links"))) {
    for (const m of matches(WIKI_LINK, text)) {
      const aliasFirst = truthy(v("markdown-wiki-link-alias-first"));
      const page = m[4] === undefined ? m[2]! : aliasFirst ? m[4] : m[2]!;
      add(m.index, m[0].length, m[4] === undefined ? m[2]! : aliasFirst ? m[2]! : m[4], page, false, true);
    }
  }
  for (const m of matches(ANGLE_URI, text)) add(m.index, m[0].length, m[2]!, m[2]!);
  for (const m of matches(PLAIN_URI, text)) add(m.index, m[0].length, m[0], m[0]);
  return found.sort((a, b) => a.start - b.start);
}

/** The link at point, or undefined, as markdown-link-at-pos. */
export function markdownLinkAtPoint(pos = e8.point()): Link | undefined {
  if (markdownCodeBlockAtPos(pos)) return undefined;
  return linksOn(e8.lineOf(pos)).find((l) => pos >= l.start && pos < l.end);
}

/** The URL a reference's label is defined as, as markdown-reference-definition. */
export function markdownReferenceDefinition(label: string): string | undefined {
  const p = parse();
  const want = label.toLowerCase();
  for (let i = 0; i < p.lines.length; i++) {
    if (codeLine(p, i)) continue;
    const m = REF_DEFINITION.exec(p.lines[i]!);
    if (m && m[3]!.toLowerCase() === want) return m[6]!.replace(/^<|>$/g, "");
  }
  return undefined;
}

/** Opens a URL in the system's browser, with browse-url if there is one. */
function browseUrl(url: string): void {
  if (e8.fboundp("browse-url")) {
    e8.funcall("browse-url", url);
    return;
  }
  const opener = v("shell-command-guess-open");
  if (typeof opener !== "string") e8.userError(`Don't know how to open ${url}`);
  e8.callProcess([opener, url]);
  e8.message(`Opened ${url}`);
}

/** Follows a link's URL, as markdown--browse-url: a URL with a scheme in the browser, else the file it names, relative to the buffer's. */
function followUrl(url: string, wiki: boolean): void {
  if (/^[a-z][a-z0-9.+-]*:/i.test(url) && !/^file:/i.test(url)) {
    browseUrl(url);
    return;
  }
  let file = url.replace(/^file:(\/\/)?/i, "").replace(/#.*$/, "");
  try {
    file = decodeURIComponent(file);
  } catch {
    // A file named with a stray %.
  }
  if (wiki) file = `${file.replace(/ /g, "_")}.${(e8.bufferFileName() ?? "x.md").replace(/^.*\./, "")}`;
  if (file === "") return;
  const dir = e8.bufferFileName() !== undefined ? e8.fileNameDirectory(e8.bufferFileName()!) : String(v("default-directory") ?? "");
  e8.call("find-file", e8.expandFileName(file, dir ?? undefined));
}

e8.defineCommand({
  name: "markdown-follow-thing-at-point",
  doc: "Follow the link at point: open its URL in the browser, or visit the file it names; for a reference link, the URL its reference defines.",
  run: () => {
    const link = markdownLinkAtPoint();
    if (link === undefined) e8.userError("Point is not at a Markdown link or URL");
    let url = link.url;
    if (link.reference) {
      const defined = markdownReferenceDefinition(url);
      if (defined === undefined) e8.userError(`Reference [${url}] is not defined`);
      url = defined;
    }
    followUrl(url, link.wiki);
  },
});

/** Goes to the next or previous link, as markdown-next-link. */
function nextLink(forward: boolean): void {
  const point = e8.point();
  const p = parse();
  for (let l = currentLine(); forward ? l < e8.lineCount() : l >= 0; l += forward ? 1 : -1) {
    if (codeLine(p, l)) continue;
    const links = linksOn(l);
    // Backward, not the link point is in.
    const target = forward ? links.find((k) => k.start > point) : links.filter((k) => k.start < point && !(point < k.end)).pop();
    if (target !== undefined) {
      e8.gotoChar(target.start);
      return;
    }
  }
  e8.message(forward ? "No further links" : "No previous links");
}

e8.defineCommand({ name: "markdown-next-link", doc: "Go to the start of the next link or URL.", run: () => nextLink(true) });
e8.defineCommand({ name: "markdown-previous-link", doc: "Go to the start of the previous link or URL.", run: () => nextLink(false) });

e8.defineCommand({
  name: "markdown-do",
  doc: "Do what makes sense at point: tick or untick a checkbox, follow a link, or go to a footnote's definition or back to its marker.",
  run: () => {
    if (markdownToggleGfmCheckbox() !== undefined) return;
    if (markdownLinkAtPoint() !== undefined) {
      e8.call("markdown-follow-thing-at-point" as e8.CommandName);
      return;
    }
    const line = currentLine();
    const text = lineText(line);
    const col = e8.point() - e8.lineStart(line);
    const p = parse();
    const definition = FOOTNOTE_DEFINITION.exec(text);
    // On a footnote's definition, back to its marker, as markdown-footnote-return.
    if (definition !== null) {
      const marker = `[^${definition[1]}]`;
      for (let l = 0; l < p.lines.length; l++) {
        const i = p.lines[l]!.indexOf(marker);
        if (i >= 0 && !(l === line || FOOTNOTE_DEFINITION.exec(p.lines[l]!)?.[1] === definition[1])) {
          e8.gotoChar(e8.lineStart(l) + charCount(p.lines[l]!.slice(0, i + marker.length)));
          return;
        }
      }
      e8.userError(`No marker for footnote ${definition[1]}`);
    }
    // On a marker, to its definition's text, as markdown-footnote-goto-text.
    for (const m of matches(FOOTNOTE, text)) {
      if (col < m.index || col > m.index + m[0].length) continue;
      for (let l = 0; l < p.lines.length; l++) {
        const d = FOOTNOTE_DEFINITION.exec(p.lines[l]!);
        if (d !== null && d[1] === m[2]) {
          e8.gotoChar(e8.lineStart(l) + charCount(d[0]));
          return;
        }
      }
      e8.userError(`No definition for footnote ${m[2]}`);
    }
    e8.userError("Nothing to do at point");
  },
});

// Toggles =====================================================================

/** Fontifies the buffer again, after an option that changes how it looks. */
function refontify(): void {
  e8.saveRestriction(() => {
    e8.widen();
    e8.call("font-lock-flush");
  });
}

function toggle(name: string, arg: e8.PrefixArg, on: string, off: string): boolean {
  const value = arg === null ? !truthy(v(name)) : e8.prefixNumericValue(arg) > 0;
  e8.makeLocalVariable(name);
  e8.setVariable(name, value);
  e8.message(value ? on : off);
  return value;
}

e8.defineCommand({
  name: "markdown-toggle-markup-hiding",
  doc: "Hide the markup, such as asterisks, hashes and the URLs of links, or show it again; with a prefix argument, hide it if positive.",
  params: [{ name: "arg", kind: "prefix" }],
  run: (arg: e8.PrefixArg) => {
    const hide = toggle("markdown-hide-markup", arg, "markdown-mode markup hiding enabled", "markdown-mode markup hiding disabled");
    if (hide) e8.addToInvisibilitySpec("markdown-markup");
    else e8.removeFromInvisibilitySpec("markdown-markup");
    refontify();
  },
});
e8.defineCommand({
  name: "markdown-toggle-url-hiding",
  doc: "Show the URLs of inline links as markdown-url-compose-char, or in full again; with a prefix argument, hide them if positive.",
  params: [{ name: "arg", kind: "prefix" }],
  run: (arg: e8.PrefixArg) => {
    toggle("markdown-hide-urls", arg, "markdown-mode URL hiding enabled", "markdown-mode URL hiding disabled");
    refontify();
  },
});
e8.defineCommand({
  name: "markdown-toggle-fontify-code-blocks-natively",
  doc: "Fontify the code in fenced code blocks as its language's mode does, or not; with a prefix argument, do if positive.",
  params: [{ name: "arg", kind: "prefix" }],
  run: (arg: e8.PrefixArg) => {
    toggle("markdown-fontify-code-blocks-natively", arg, "Fontifying code blocks natively", "Not fontifying code blocks natively");
    refontify();
  },
});

// imenu =======================================================================

type ImenuItem = [string, number | ImenuItem[]];

e8.defun("markdown-imenu-create-flat-index", () => markdownHeadings().map((h): ImenuItem => [h.text, e8.lineStart(h.line)]));

/** The headings as a tree, each with children a submenu whose first item, ".", is the heading itself, as markdown-imenu-create-nested-index. */
e8.defun("markdown-imenu-create-nested-index", () => {
  const all = markdownHeadings();
  const build = (from: number, to: number, level: number): ImenuItem[] => {
    const items: ImenuItem[] = [];
    for (let i = from; i < to; ) {
      const h = all[i]!;
      let end = i + 1;
      while (end < to && all[end]!.level > h.level) end++;
      const pos = e8.lineStart(h.line);
      if (end > i + 1) items.push([h.text, [[".", pos], ...build(i + 1, end, h.level + 1)]]);
      else items.push([h.text, pos]);
      i = end;
    }
    void level;
    return items;
  };
  return build(0, all.length, 1);
});

// Modes =======================================================================

/** Sets a variable in the current buffer only, as setq-local. */
function setLocal(name: string, value: e8.Value): void {
  e8.makeLocalVariable(name);
  e8.setVariable(name, value);
}

const SYNTAX: { [chars: string]: string } = { '"': ".", "'": "w", "`": ".", "$": ".", "&": ".", "*": ".", "+": ".", "-": ".", "/": ".", "<": ".", "=": ".", ">": ".", "|": ".", "\\": "\\" };

export const markdownMode = e8.defineMajorMode({
  name: "markdown-mode",
  modeName: "Markdown",
  parent: "text-mode",
  doc:
    "The major mode for editing Markdown. TAB on a heading folds it and S-TAB the buffer; C-c C-n and C-c C-p go between headings, C-c C-- and C-c C-= promote and demote, " +
    "C-c <up> and C-c <down> move what is at point. C-c C-s inserts markup: b bold, i italic, c code, C a code block, h a heading, l a link, - a rule, [ a checkbox. " +
    "M-RET inserts a list item, C-c C-o follows a link, C-c C-d ticks a checkbox, M-n and M-p go between links, C-c C-x C-m hides markup.",
  syntax: SYNTAX,
  bindings: {
    "C-c C-s 1": "markdown-insert-header-atx-1",
    "C-c C-s 2": "markdown-insert-header-atx-2",
    "C-c C-s 3": "markdown-insert-header-atx-3",
    "C-c C-s 4": "markdown-insert-header-atx-4",
    "C-c C-s 5": "markdown-insert-header-atx-5",
    "C-c C-s 6": "markdown-insert-header-atx-6",
    "C-c C-s !": "markdown-insert-header-setext-1",
    "C-c C-s @": "markdown-insert-header-setext-2",
    "C-c C-s b": "markdown-insert-bold",
    "C-c C-s c": "markdown-insert-code",
    "C-c C-s C": "markdown-insert-gfm-code-block",
    "C-c C-s f": "markdown-insert-footnote",
    "C-c C-s h": "markdown-insert-header-dwim",
    "C-c C-s H": "markdown-insert-header-setext-dwim",
    "C-c C-s i": "markdown-insert-italic",
    "C-c C-s k": "markdown-insert-kbd",
    "C-c C-s l": "markdown-insert-link",
    "C-c C-s p": "markdown-insert-pre",
    "C-c C-s P": "markdown-pre-region",
    "C-c C-s q": "markdown-insert-blockquote",
    "C-c C-s Q": "markdown-blockquote-region",
    "C-c C-s s": "markdown-insert-strike-through",
    "C-c C-s w": "markdown-insert-wiki-link",
    "C-c C-s -": "markdown-insert-hr",
    "C-c C-s [": "markdown-insert-gfm-checkbox",
    "C-c C-s e": "markdown-insert-italic",
    "C-c C-l": "markdown-insert-link",
    "C-c C-i": "markdown-insert-image",
    "C-c C--": "markdown-promote",
    "C-c C-=": "markdown-demote",
    "C-c C-o": "markdown-follow-thing-at-point",
    "C-c C-d": "markdown-do",
    RET: "markdown-enter-key",
    DEL: "markdown-outdent-or-delete",
    TAB: "markdown-cycle",
    "<backtab>": "markdown-shifttab",
    "S-TAB": "markdown-shifttab",
    "C-c C-n": "markdown-outline-next",
    "C-c C-p": "markdown-outline-previous",
    "C-c C-f": "markdown-outline-next-same-level",
    "C-c C-b": "markdown-outline-previous-same-level",
    "C-c C-u": "markdown-outline-up",
    "C-c <up>": "markdown-move-up",
    "C-c <down>": "markdown-move-down",
    "C-c <left>": "markdown-promote",
    "C-c <right>": "markdown-demote",
    "C-c C-x u": "markdown-move-up",
    "C-c C-x d": "markdown-move-down",
    "C-c C-x l": "markdown-promote",
    "C-c C-x r": "markdown-demote",
    "C-c C-M-h": "markdown-mark-subtree",
    "C-x n s": "markdown-narrow-to-subtree",
    "M-RET": "markdown-insert-list-item",
    "C-c C-j": "markdown-insert-list-item",
    "C-c C-x m": "markdown-insert-list-item",
    "M-n": "markdown-next-link",
    "M-p": "markdown-previous-link",
    "C-c C-x C-f": "markdown-toggle-fontify-code-blocks-natively",
    "C-c C-x C-l": "markdown-toggle-url-hiding",
    "C-c C-x C-m": "markdown-toggle-markup-hiding",
    // C-m is RET and C-i is TAB in Emacs, as a terminal sends them; E8 reads them apart.
    "C-c C-x RET": "markdown-toggle-markup-hiding",
    "C-c TAB": "markdown-insert-image",
    "C-c C-x C-x": "markdown-toggle-gfm-checkbox",
    "C-c -": "markdown-insert-hr",
  } as unknown as { [keys: string]: e8.CommandName },
  setup: () => {
    setLocal("tab-width", 4);
    setLocal("comment-start", "<!-- ");
    setLocal("comment-end", " -->");
    setLocal("comment-start-skip", "<!--[ \t]*");
    setLocal("comment-column", 0);
    setLocal(
      "paragraph-start",
      ["\f", "[ \t\f]*$", "\\(?:[ \t]*>\\)+[ \t\f]*$", "[ \t]*[*+-][ \t]+", "[ \t]*\\(?:[0-9]+\\|#\\)\\.[ \t]+", "[ \t]*\\[\\S-*\\]:[ \t]+", "[ \t]*:[ \t]+", "^|"].join("\\|"),
    );
    setLocal(
      "paragraph-separate",
      ["[ \t\f]*$", "\\(?:[ \t]*>\\)+[ \t\f]*$", ".*  $", "^#+", "^\\(?:   \\)?[-=]+[ \t]*$", "[ \t]*\\[\\^\\S-*\\]:[ \t]*$"].join("\\|"),
    );
    setLocal("adaptive-fill-first-line-regexp", "\\`[ \t]*[A-Z]?>[ \t]*?\\'");
    setLocal("indent-line-function", "markdown-indent-line");
    setLocal(
      "imenu-create-index-function",
      truthy(v("markdown-nested-imenu-heading-index")) ? "markdown-imenu-create-nested-index" : "markdown-imenu-create-flat-index",
    );
    setLocal("imenu-submenus-on-top", false);
    e8.addToInvisibilitySpec("outline", { ellipsis: true });
    if (truthy(v("markdown-hide-markup"))) e8.addToInvisibilitySpec("markdown-markup");
    else e8.removeFromInvisibilitySpec("markdown-markup");
    e8.addHook("jit-lock-functions", fontify, { local: true });
  },
});

export const gfmMode = e8.defineMajorMode({
  name: "gfm-mode",
  modeName: "GFM",
  parent: markdownMode,
  doc: "The major mode for editing GitHub Flavored Markdown: markdown-mode, with C-c C-s d for strike-through and ``` starting a code block.",
  bindings: {
    "C-c C-s d": "markdown-insert-strike-through",
    "`": "markdown-electric-backquote",
  } as unknown as { [keys: string]: e8.CommandName },
  setup: () => {
    setLocal("markdown-gfm-used-languages", usedLanguages());
  },
});

e8.defineCommand({
  name: "markdown-show-version",
  doc: "Show the version of markdown-mode in the echo area.",
  run: () => e8.message(`markdown-mode, version ${markdownModeVersion}`),
});

// Files named as Markdown open in markdown-mode, as markdown-mode's autoload adds them.
const alist = e8.defaultValue("auto-mode-alist");
e8.setDefault("auto-mode-alist", [
  ...(Array.isArray(alist) ? alist.filter((e) => !(Array.isArray(e) && e[1] === "markdown-mode")) : []),
  ["\\.\\(?:md\\|markdown\\|mkd\\|mdown\\|mkdn\\|mdwn\\|mdx\\)\\'", "markdown-mode"],
]);
