# e8-markdown-mode

A major mode for editing [Markdown](https://daringfireball.net/projects/markdown/) in [E8](https://github.com/e8-editor/e8), and `gfm-mode` on it for GitHub Flavored Markdown. A port of Jason Blevins's [markdown-mode](https://github.com/jrblevin/markdown-mode) 2.9-alpha.

## Installing

In `~/.config/e8/init.ts`:

```ts
e8.usePackage("e8-editor/e8-markdown-mode");
```

E8 installs it at its newest version tag into `repos/` beside `init.ts`, records the commit in `e8-lock.json`, and requires it. Files ending in `.md`, `.markdown`, `.mkd`, `.mdown`, `.mkdn`, `.mdwn` and `.mdx` then open in `markdown-mode`. To have READMEs in `gfm-mode`, put an entry before it in `auto-mode-alist`:

```ts
e8.setDefault("auto-mode-alist", [["README\\.md\\'", "gfm-mode"], ...(e8.defaultValue("auto-mode-alist") as e8.Value[])]);
```

`M-x package-vc-upgrade` brings it up to date. Pin a version with `{ rev: "v0.1.0" }`. It needs E8 0.5.19 or newer.

## Using it

Headings, emphasis, inline code, fenced and indented code blocks, links, footnotes, lists and checkboxes, block quotes, tables, HTML tags and entities, comments and YAML front matter are styled as they are shown. Emphasis and links may run over the lines of a paragraph, and nothing inside code is styled as Markdown.

| Key | Does |
| --- | --- |
| `TAB` | on a heading, cycle it: folded, its children's headings, all of it; elsewhere indent, to the next likely column each time |
| `S-TAB` | cycle the buffer: every heading, the top-level headings, everything |
| `C-c C-n`, `C-c C-p` | the next and previous heading that shows |
| `C-c C-f`, `C-c C-b` | the next and previous heading at the same level |
| `C-c C-u` | the heading this one is under |
| `C-c C--`, `C-c C-=` (or `C-c <left>`, `C-c <right>`) | promote or demote the heading or list item at point, a list item with what is under it |
| `C-c <up>`, `C-c <down>` | move the heading and its subtree, or the list item, past the one before or after |
| `M-RET`, `C-c C-j` | a new list item: the next number, the same bullet, an unticked checkbox after a checkbox; `C-u` a level out, `C-u C-u` a level in |
| `RET` | a new line, indented as the one before (with `markdown-indent-on-enter` `indent-and-new-item`, a new list item) |
| `DEL` | after a line's indentation, outdent it a step |
| `C-c C-s b`, `i`, `c`, `s`, `k` | bold, italic, inline code, strike-through, `<kbd>`: around the region or the word at point, or taken off the text at point |
| `C-c C-s h`, `H`, `1` to `6`, `!`, `@` | a heading at the level of the one before, or a setext heading, or one at a level |
| `C-c C-s C` | a fenced code block, asking for its language (with `` ` `` typed three times at a line's start in `gfm-mode`) |
| `C-c C-s q`, `p`, `-`, `[`, `f` | a block quote, preformatted text, a rule, a checkbox, a footnote |
| `C-c C-l`, `C-c C-i` | an inline link or image, asking for its URL, text and title |
| `C-c C-o` | follow the link at point: a URL in the browser, else the file it names; a reference link through its definition |
| `C-c C-d` | do what makes sense: tick a checkbox, follow a link, go between a footnote's marker and its definition |
| `M-n`, `M-p` | the next and previous link |
| `C-c C-x C-m` | hide markup, link URLs included, or show it again |
| `C-c C-x C-l` | show inline links' URLs as `∞` |
| `C-c C-x C-f` | style code blocks in their language's own faces |
| `C-c C-M-h`, `C-x n s` | mark or narrow to the heading at point and its subtree |

`M-x imenu` lists the headings, under their parents with `markdown-nested-imenu-heading-index`. `markdown-fontify-code-blocks-natively` styles a fenced block's code as the mode for its language does: `markdown-code-lang-modes` names modes for languages, else `LANG-ts-mode` is used when its grammar is installed, else `LANG-mode`. The faces are markdown-mode's: `markdown-header-face-1` to `-6`, `markdown-bold-face`, `markdown-inline-code-face`, `markdown-link-face`, `markdown-markup-face` and the rest, for a theme to style.

## Differences from markdown-mode.el

- There is no export or preview: none of `C-c C-c`'s commands, `markdown-command`, `markdown-live-preview-mode` or `markdown-open`.
- Tables are styled but not edited: no aligning on `TAB`, no `markdown-insert-table` and none of the row and column commands.
- No `C-c '` to edit a code block in its language's mode, which needs edit-indirect; no `C-c C-k`, `C-c C-]`, `markdown-cleanup-list-numbers`, `markdown-check-refs` or `markdown-unused-refs`; no block, page and paragraph commands of its own, as `markdown-forward-block`, nor `markdown-fill-paragraph`: filling uses the mode's `paragraph-start` and `paragraph-separate` with text-mode's filling.
- `C-c C-l` inserts inline links only, not reference links, and does not edit the link at point. Wiki links are styled and followed when `markdown-enable-wiki-links` is on, without the face for missing pages or the search in subdirectories.
- Not styled: mathematics, sub- and superscripts, Pandoc's `%` metadata and inline footnotes, inline attributes, Leanpub sections and includes. No inline images, scaled headings, headings in the margin, or rules drawn as a line.
- Markup is hidden with the `invisible` property, not composed into other characters, and a hidden URL is shown with a `display` string.
- E8 has no `browse-url`: a URL is opened with the system's opener, `shell-command-guess-open` (`open` on macOS, `xdg-open` elsewhere), unless a package defines `browse-url`.
- Where a block starts and ends is worked out from the lines of the buffer, kept until it changes, rather than with syntax properties, and inline markup with regular expressions over each paragraph, so unusual nesting may be styled differently.
- E8 reads `C-m` and `RET`, and `C-i` and `TAB`, as different keys, where Emacs and a terminal do not, so `C-c C-x C-m` is bound as `C-c C-x RET` too and `C-c C-i` as `C-c TAB`.
- There are no mouse bindings, no menu, no ElDoc, and nothing for flyspell, drag and drop or yanking images.

## Credit

This is a port to E8 of [markdown-mode](https://github.com/jrblevin/markdown-mode) 2.9-alpha (commit `e2e2bc75`), by Jason R. Blevins and the markdown-mode contributors, copyright 2007-2026, distributed in NonGNU ELPA and MELPA, under the GNU General Public License version 3 or later. It is not the upstream authors' work as published, and they do not endorse it: report problems with the port here, not upstream.

## Developing

With an E8 on your PATH (a [release](https://github.com/e8-editor/e8/releases), or built from source) and TypeScript 5.8 or newer:

```bash
make test
make types
```

The tests in `test/markdown-mode-tests.ts` style buffers of Markdown and check the faces, fold and move between headings, promote and move headings and list items, insert markup, list items, code blocks and links, tick checkboxes, follow links to files and go between footnotes.

## Licence

GPL-3.0-or-later: see `LICENSE`.
