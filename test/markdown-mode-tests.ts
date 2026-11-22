// SPDX-License-Identifier: GPL-3.0-or-later
//
// markdown-mode's tests, with ERT: how a buffer of Markdown is styled,
// headings folded and moved between, promoted and moved, markup and list
// items inserted, checkboxes ticked and links found. `make test` runs them
// in e8 --batch, as CI does.

import { ertDeftest, should, shouldEqual, shouldError } from "ert";
import { markdownCodeBlockAtPos, markdownCurListItem, markdownHeadings, markdownLinkAtPoint, markdownMode, markdownReferenceDefinition } from "markdown-mode";

/** A buffer of its own in markdown-mode holding text, with point at the first | in it, which is taken out. */
function setup(name: string, text: string, mode: e8.CommandName | e8.DefinedCommand = markdownMode, marksPoint = true): void {
  e8.call("switch-to-buffer", name);
  e8.deleteRegion(e8.pointMin(), e8.pointMax());
  const at = marksPoint ? text.indexOf("|") : -1;
  e8.insert(at < 0 ? text : text.slice(0, at) + text.slice(at + 1));
  e8.call(mode);
  e8.gotoChar(at < 0 ? e8.pointMin() : at);
  e8.call("font-lock-ensure");
}

/** The buffer's text, with | where point is. */
const withPoint = (): string => {
  const t = e8.bufferText();
  return t.slice(0, e8.point()) + "|" + t.slice(e8.point());
};

/** The faces at the start of the first occurrence of `what`, as a list. */
function facesAt(what: string, offset = 0): string[] {
  e8.call("font-lock-ensure");
  const at = e8.bufferText().indexOf(what);
  should(at >= 0, `the buffer has ${what}`);
  const f = e8.getTextProperty(at + offset, "face");
  return f === undefined || f === null ? [] : Array.isArray(f) ? (f as string[]) : [String(f)];
}

const hasFace = (what: string, face: string, offset = 0): boolean => facesAt(what, offset).includes(face);

/** The buffer's text as it shows, folded text left out. */
function visible(): string {
  const hidden = e8.overlaysIn(e8.pointMin(), e8.pointMax()).filter((o) => e8.overlayGet(o, "invisible") === "outline");
  let out = "";
  for (let p = e8.pointMin(); p < e8.pointMax(); p++) {
    if (!hidden.some((o) => (e8.overlayStart(o) ?? 0) <= p && p < (e8.overlayEnd(o) ?? 0))) out += e8.charAfter(p);
  }
  return out;
}

/** Keys that type text, for executeKbdMacro. */
const typed = (text: string): string => [...text].map((c) => (c === " " ? "SPC" : c)).join(" ");

const keys = (k: string): void => e8.executeKbdMacro(k);

ertDeftest("markdown-files-open-in-markdown-mode", () => {
  const alist = e8.defaultValue("auto-mode-alist") as e8.Value[][];
  const entry = alist.find((e) => e[1] === "markdown-mode");
  should(entry !== undefined, "auto-mode-alist names markdown-mode");
  for (const name of ["README.md", "notes.markdown", "a.mdx"]) should(e8.stringMatch(String(entry![0]), name) !== undefined, name);
  should(e8.stringMatch(String(entry![0]), "README.mdown.bak") === undefined);
  setup("md-mode", "# Hi\n");
  shouldEqual(e8.variable("major-mode"), "markdown-mode");
  should(e8.derivedModeP("text-mode"), "markdown-mode is built on text-mode");
  shouldEqual(e8.variable("comment-start"), "<!-- ");
  // Its settings are its buffer's own.
  const paragraphStart = e8.variable("paragraph-start");
  e8.call("switch-to-buffer", "md-mode-other");
  should(e8.variable("paragraph-start") !== paragraphStart, "paragraph-start is set in Markdown buffers only");
  should(e8.variable("comment-start") !== "<!-- ");
});

ertDeftest("markdown-headings-are-styled-by-level", () => {
  setup("md-head", "# One #\n\nText\n\n## Two\n\nSetext\n======\n\nSecond\n------\n\n#not a heading\n");
  should(hasFace("One", "markdown-header-face-1"));
  should(hasFace("# One", "markdown-header-delimiter-face"));
  should(hasFace(" #\n", "markdown-header-delimiter-face", 1), "the closing hashes are markup");
  should(hasFace("Two", "markdown-header-face-2"));
  should(hasFace("Setext", "markdown-header-face-1"));
  should(hasFace("======", "markdown-header-rule-face"));
  should(hasFace("Second", "markdown-header-face-2"));
  should(!hasFace("#not", "markdown-header-delimiter-face"), "a hash with no space after it starts no heading");
  shouldEqual(
    markdownHeadings().map((h) => [h.level, h.text, h.setext]),
    [[1, "One", false], [2, "Two", false], [1, "Setext", true], [2, "Second", true]],
  );
});

ertDeftest("markdown-emphasis-code-and-links-are-styled", () => {
  setup(
    "md-inline",
    "Some **bold** and *italic* and _under_ and ~~gone~~ text,\n`code with *no* emphasis`, a [link](http://e.x \"Title\"),\n" +
      "a [ref][id], <https://angle.example>, https://plain.example and snake_case_name.\n\n[id]: http://ref.example \"Ref\"\n",
  );
  should(hasFace("bold", "markdown-bold-face"));
  should(hasFace("**bold", "markdown-markup-face"));
  should(hasFace("italic", "markdown-italic-face"));
  should(hasFace("under", "markdown-italic-face"));
  should(hasFace("gone", "markdown-strike-through-face"));
  should(hasFace("code with", "markdown-inline-code-face"));
  should(!hasFace("no* emphasis", "markdown-italic-face"), "nothing is emphasised in code");
  should(hasFace("link]", "markdown-link-face"));
  should(hasFace("http://e.x", "markdown-url-face"));
  should(hasFace("\"Title\"", "markdown-link-title-face"));
  should(hasFace("ref]", "markdown-link-face"));
  should(hasFace("id]", "markdown-reference-face"));
  should(hasFace("https://angle", "markdown-plain-url-face"));
  should(hasFace("https://plain", "markdown-plain-url-face"));
  should(!hasFace("case_name", "markdown-italic-face"), "underscores inside words are not emphasis");
  should(hasFace("http://ref.example", "markdown-url-face"));
  should(hasFace("id]:", "markdown-reference-face"));
  shouldEqual(markdownReferenceDefinition("ID"), "http://ref.example");
});

ertDeftest("markdown-emphasis-runs-over-lines-of-a-paragraph", () => {
  setup("md-multi", "Some **bold that\ngoes on** here.\n\n**Not\n\nbold**\n");
  should(hasFace("goes on", "markdown-bold-face"));
  should(!hasFace("Not", "markdown-bold-face"), "emphasis stops at a blank line");
});

ertDeftest("markdown-code-blocks-are-styled-and-known", () => {
  setup("md-code", "Text\n\n```python {.x}\nx = '*not emphasis*'\n# not a heading\n```\n\n    indented *code*\n\nAfter\n");
  should(hasFace("```python", "markdown-markup-face"));
  should(hasFace("python", "markdown-language-keyword-face"));
  should(hasFace("x = ", "markdown-pre-face"));
  should(hasFace("x = ", "markdown-code-face"));
  should(!hasFace("not emphasis", "markdown-italic-face"));
  should(!hasFace("# not", "markdown-header-delimiter-face"));
  should(hasFace("indented", "markdown-pre-face"));
  should(!hasFace("After", "markdown-pre-face"));
  shouldEqual(markdownHeadings().length, 0, "a # in a code block starts no heading");
  should(markdownCodeBlockAtPos(e8.bufferText().indexOf("x =")));
  should(!markdownCodeBlockAtPos(e8.bufferText().indexOf("After")));
});

ertDeftest("markdown-code-blocks-are-styled-natively-in-their-language", () => {
  setup("md-native", "```elisp\n(defun f () 1)\n```\n");
  e8.letBind({ "markdown-fontify-code-blocks-natively": true }, () => {
    e8.call("font-lock-flush");
    should(hasFace("defun", "font-lock-keyword-face"), "elisp is styled as emacs-lisp-mode would");
    should(hasFace("defun", "markdown-code-face"));
  });
});

ertDeftest("markdown-quotes-lists-tables-rules-and-metadata-are-styled", () => {
  setup("md-blocks", "---\ntitle: Notes\n---\n\n> quoted\n\n- item\n- [x] done\n\n| a | b |\n\n* * *\n\n<!-- a\ncomment -->\n\nTwo spaces  \nbreak &amp; <b class=\"x\">tag</b>\n", markdownMode, false);
  should(hasFace("title", "markdown-metadata-key-face"));
  should(hasFace("Notes", "markdown-metadata-value-face"));
  should(hasFace("> q", "markdown-markup-face"));
  should(hasFace("quoted", "markdown-blockquote-face"));
  should(hasFace("- item", "markdown-list-face"));
  should(hasFace("[x]", "markdown-gfm-checkbox-face"));
  should(hasFace("| a", "markdown-table-face"));
  should(hasFace("* * *", "markdown-hr-face"));
  should(hasFace("comment -->", "markdown-comment-face"));
  should(hasFace("  \nbreak", "markdown-line-break-face"));
  should(hasFace("&amp;", "markdown-html-entity-face"));
  should(hasFace("b class", "markdown-html-tag-name-face"));
  should(hasFace("class", "markdown-html-attr-name-face"));
});

ertDeftest("markdown-markup-hiding-hides-markup", () => {
  setup("md-hide", "Some **bold** [link](http://x.y)\n");
  shouldEqual(e8.getTextProperty(e8.bufferText().indexOf("**"), "invisible"), "markdown-markup");
  should(!e8.invisibleP(e8.bufferText().indexOf("**")), "markup shows at first");
  keys("C-c C-x C-m");
  shouldEqual(e8.variable("markdown-hide-markup"), true);
  should(e8.invisibleP(e8.bufferText().indexOf("**")), "and is hidden after C-c C-x C-m");
  should(e8.invisibleP(e8.bufferText().indexOf("http")), "and so is a link's URL");
  keys("C-c C-x RET");
  should(!e8.invisibleP(e8.bufferText().indexOf("**")), "C-c C-x RET, which C-c C-x C-m is, shows it again");
  keys("C-c C-x C-l");
  e8.call("font-lock-ensure");
  shouldEqual(e8.getTextProperty(e8.bufferText().indexOf("(http"), "display"), "∞");
});

const OUTLINE = "# A\na\n## A1\na1\n## A2\na2\n# B\nb\n";

ertDeftest("markdown-tab-cycles-a-heading-and-s-tab-the-buffer", () => {
  setup("md-cycle", OUTLINE);
  keys("TAB");
  shouldEqual(visible(), "# A\n# B\nb\n");
  keys("TAB");
  shouldEqual(visible(), "# A\na\n## A1\n## A2\n# B\nb\n");
  keys("TAB");
  shouldEqual(visible(), OUTLINE);
  keys("TAB");
  shouldEqual(visible(), "# A\n# B\nb\n");
  keys("S-TAB");
  shouldEqual(visible(), "# A\n## A1\n## A2\n# B\n");
  keys("S-TAB");
  shouldEqual(visible(), "# A\n# B\n");
  keys("S-TAB");
  shouldEqual(visible(), OUTLINE);
  // TAB elsewhere indents, to the next of markdown-calc-indents' columns.
  e8.gotoChar(OUTLINE.indexOf("a1"));
  keys("TAB");
  shouldEqual(visible(), OUTLINE.replace("a1", "    a1"));
});

ertDeftest("markdown-moves-between-headings", () => {
  setup("md-move", OUTLINE);
  const line = (): string => e8.lineText(e8.lineOf(e8.point()));
  keys("C-c C-n");
  shouldEqual(line(), "## A1");
  keys("C-c C-f");
  shouldEqual(line(), "## A2");
  shouldEqual(shouldError(() => keys("C-c C-f"), { type: "user-error" }).message, "No following same-level heading");
  keys("C-c C-u");
  shouldEqual(line(), "# A");
  keys("C-c C-f");
  shouldEqual(line(), "# B");
  keys("C-c C-b");
  shouldEqual(line(), "# A");
  keys("C-c C-n C-c C-n C-c C-p");
  shouldEqual(line(), "## A1");
});

ertDeftest("markdown-promotes-demotes-and-moves-headings", () => {
  setup("md-promote", "# A #\n\nText\n|## B\nb\n## C\nc\n");
  keys("C-c C--");
  shouldEqual(e8.lineText(e8.lineOf(e8.point())), "# B");
  keys("C-c C-=");
  keys("C-c C-=");
  shouldEqual(e8.lineText(e8.lineOf(e8.point())), "### B");
  keys("C-c C--");
  keys("C-c <down>");
  shouldEqual(e8.bufferText(), "# A #\n\nText\n## C\nc\n## B\nb\n");
  shouldEqual(e8.lineText(e8.lineOf(e8.point())), "## B");
  keys("C-c <up>");
  shouldEqual(e8.bufferText(), "# A #\n\nText\n## B\nb\n## C\nc\n");
  shouldEqual(shouldError(() => keys("C-c <up>"), { type: "user-error" }).message, "Cannot move past superior level");
  setup("md-promote-setext", "Title\n=====\n");
  keys("C-c C-=");
  shouldEqual(e8.bufferText(), "Title\n-----\n");
  keys("C-c C-=");
  shouldEqual(e8.bufferText(), "### Title ###\n");
});

ertDeftest("markdown-inserts-emphasis-around-the-word-or-region", () => {
  setup("md-bold", "make wo|rd bold\n");
  keys("C-c C-s b");
  shouldEqual(withPoint(), "make **wo|rd** bold\n");
  keys("C-c C-s b");
  shouldEqual(withPoint(), "make wo|rd bold\n");
  keys("C-c C-s i");
  shouldEqual(withPoint(), "make *wo|rd* bold\n");
  keys("C-c C-s i");
  e8.gotoChar(e8.pointMax());
  keys("C-c C-s c");
  shouldEqual(withPoint(), "make word bold\n`|`");
  setup("md-region", "a long phrase\n");
  e8.pushMark(2, { activate: true });
  e8.gotoChar(8);
  keys("C-c C-s s");
  shouldEqual(e8.bufferText(), "a ~~long p~~hrase\n");
});

ertDeftest("markdown-inserts-headings-rules-and-code-blocks", () => {
  setup("md-insert", "Para\n\nTitle|\n");
  keys("C-c C-s 2");
  shouldEqual(withPoint(), "Para\n\n## Title| ##\n");
  setup("md-insert-dwim", "# Top\n\nsub|\n");
  keys("C-u C-c C-s h");
  shouldEqual(e8.bufferText(), "# Top\n\n# sub #\n");
  setup("md-insert-setext", "Para\nTitle|\n");
  keys("C-c C-s !");
  shouldEqual(e8.bufferText(), "Para\n\nTitle\n=====\n");
  setup("md-insert-hr", "Text|\n");
  keys("C-c C-s -");
  shouldEqual(e8.bufferText(), `Text\n\n${"-".repeat(79)}\n`);
  setup("md-insert-code", "Text|\n");
  keys(`C-c C-s C ${typed("rust")} RET`);
  shouldEqual(withPoint(), "Text\n\n``` rust\n|\n```\n");
  e8.gotoChar(e8.pointMax());
  keys("RET RET");
  keys(`C-c C-s C RET`);
  should(e8.bufferText().endsWith("\n\n``` rust\n\n```"), "an empty answer takes the language used last");
});

ertDeftest("markdown-gfm-mode-starts-a-code-block-at-three-backquotes", () => {
  setup("md-gfm", "", "gfm-mode" as e8.CommandName);
  shouldEqual(e8.variable("major-mode"), "gfm-mode");
  keys(`\` \` \` ${typed("js")} RET`);
  shouldEqual(withPoint(), "``` js\n|\n```");
  e8.gotoChar(e8.pointMax());
  keys("RET a ` b `");
  shouldEqual(e8.bufferText(), "``` js\n\n```\na`b`", "inline backquotes are themselves");
});

ertDeftest("markdown-inserts-links", () => {
  setup("md-link", "see th|is\n");
  keys(`C-c C-l ${typed("http://e.x")} RET RET RET`);
  shouldEqual(e8.bufferText(), "see [this](http://e.x)\n");
  e8.gotoChar(e8.pointMax());
  keys(`C-c C-i ${typed("a.png")} RET ${typed("Alt")} RET ${typed("T")} RET`);
  shouldEqual(e8.bufferText(), "see [this](http://e.x)\n![Alt](a.png \"T\")");
});

ertDeftest("markdown-m-ret-continues-a-list", () => {
  setup("md-list", "- one|\n");
  keys("M-RET");
  shouldEqual(withPoint(), "- one\n- |\n");
  keys(typed("two"));
  keys("C-u M-RET");
  shouldEqual(e8.bufferText(), "- one\n- two\n- \n");
  setup("md-list-numbered", "1. one\n2. two|\n");
  keys("M-RET");
  shouldEqual(withPoint(), "1. one\n2. two\n3. |\n");
  setup("md-list-nested", "- one\n    - [x] sub|\n");
  keys("M-RET");
  shouldEqual(withPoint(), "- one\n    - [x] sub\n    - [ ] |\n");
  keys("C-u M-RET");
  shouldEqual(withPoint(), "- one\n    - [x] sub\n    - [ ] \n- [ ] |\n");
  setup("md-list-none", "Text|\n");
  keys("M-RET");
  shouldEqual(withPoint(), "Text\n  * |\n");
  setup("md-list-ten", "8. a\n9. b|\n");
  keys("M-RET");
  shouldEqual(withPoint(), "8. a\n9. b\n10. |\n");
});

ertDeftest("markdown-ret-indents-under-a-list-item", () => {
  setup("md-ret", "- item|\n");
  // As the line before is indented, then TAB to the item's text, a tab stop, and back.
  keys("RET");
  shouldEqual(withPoint(), "- item\n|\n");
  keys("TAB");
  shouldEqual(withPoint(), "- item\n  |\n");
  keys("TAB");
  shouldEqual(withPoint(), "- item\n    |\n");
  keys("DEL");
  shouldEqual(withPoint(), "- item\n  |\n");
  keys("TAB TAB TAB");
  shouldEqual(withPoint(), "- item\n|\n");
  setup("md-ret-indented", "    - item|\n");
  keys("RET");
  shouldEqual(withPoint(), "    - item\n    |\n");
  e8.letBind({ "markdown-indent-on-enter": "indent-and-new-item" }, () => {
    setup("md-ret-item", "- item|\n");
    keys("RET");
    shouldEqual(withPoint(), "- item\n- |\n");
    keys("RET");
    shouldEqual(withPoint(), "- item\n\n|\n", "RET in an empty item ends the list");
  });
});

ertDeftest("markdown-promotes-and-moves-list-items", () => {
  setup("md-list-move", "- a\n- b|\n  more b\n    - b1\n- c\n");
  keys("C-c C-=");
  shouldEqual(e8.bufferText(), "- a\n    - b\n      more b\n        - b1\n- c\n");
  keys("C-c C--");
  shouldEqual(e8.bufferText(), "- a\n- b\n  more b\n    - b1\n- c\n");
  keys("C-c <up>");
  shouldEqual(e8.bufferText(), "- b\n  more b\n    - b1\n- a\n- c\n");
  shouldEqual(e8.lineText(e8.lineOf(e8.point())), "- b");
  keys("C-c <down> C-c <down>");
  shouldEqual(e8.bufferText(), "- a\n- c\n- b\n  more b\n    - b1\n");
  shouldEqual(markdownCurListItem(e8.lineOf(e8.bufferText().indexOf("more")))?.marker, "-");
});

ertDeftest("markdown-ticks-checkboxes", () => {
  setup("md-check", "- [ ] task|\n- plain\n");
  keys("C-c C-d");
  shouldEqual(e8.bufferText(), "- [x] task\n- plain\n");
  keys("C-c C-x C-x");
  shouldEqual(e8.bufferText(), "- [ ] task\n- plain\n");
  keys("C-n C-c C-s [");
  shouldEqual(e8.bufferText(), "- [ ] task\n- [ ] plain\n");
});

ertDeftest("markdown-finds-and-goes-between-links", () => {
  setup("md-links", "a [one](x.md) b [two][r] <http://t.x>\n\n```\n[not](a link)\n```\n\n[r]: other.md\n");
  keys("M-n");
  shouldEqual(e8.point(), 2);
  shouldEqual(markdownLinkAtPoint()?.url, "x.md");
  keys("M-n");
  shouldEqual(markdownLinkAtPoint()?.text, "two");
  shouldEqual(markdownLinkAtPoint()?.reference, true);
  keys("M-n");
  shouldEqual(markdownLinkAtPoint()?.url, "http://t.x");
  const last = e8.point();
  keys("M-n");
  shouldEqual(e8.point(), last, "links in code blocks are skipped, and a reference's definition is no link");
  shouldEqual(e8.currentMessage(), "No further links");
  keys("M-p");
  shouldEqual(markdownLinkAtPoint()?.text, "two");
  keys("M-p M-p");
  shouldEqual(e8.point(), 2);
  shouldEqual(shouldError(() => keys("M-p C-a C-c C-o"), { type: "user-error" }).message, "Point is not at a Markdown link or URL");
});

ertDeftest("markdown-follows-links-to-files", () => {
  const dir = e8.makeTempFile("markdown-follow", { dir: true });
  const target = e8.expandFileName("other.md", dir);
  e8.writeRegion("# Other\n", null, target, { quiet: true });
  e8.call("find-file", e8.expandFileName("index.md", dir));
  e8.insert("[go](other.md#top) and [ref][o]\n\n[o]: other.md\n");
  e8.gotoChar(1);
  keys("C-c C-o");
  shouldEqual(e8.bufferFileName(), target);
  e8.call("find-file", e8.expandFileName("index.md", dir));
  e8.gotoChar(e8.bufferText().indexOf("[ref]") + 1);
  keys("C-c C-o");
  shouldEqual(e8.bufferFileName(), target);
});

ertDeftest("markdown-imenu-lists-headings-under-their-parents", () => {
  setup("md-imenu", OUTLINE);
  const index = e8.funcall("markdown-imenu-create-nested-index") as unknown[];
  shouldEqual(index, [["A", [[".", 0], ["A1", OUTLINE.indexOf("## A1")], ["A2", OUTLINE.indexOf("## A2")]]], ["B", OUTLINE.indexOf("# B")]]);
  const flat = e8.funcall("markdown-imenu-create-flat-index") as unknown[];
  shouldEqual(flat.length, 4);
});

ertDeftest("markdown-footnotes-are-inserted-and-followed", () => {
  setup("md-footnote", "Claim|.\n");
  keys("C-c C-s f");
  keys(typed("Source."));
  shouldEqual(e8.bufferText(), "Claim[^1].\n\n[^1]: Source.");
  keys("C-c C-d");
  shouldEqual(e8.point(), "Claim[^1]".length, "C-c C-d on a definition goes back to its marker");
  keys("C-c C-d");
  shouldEqual(e8.point(), e8.bufferText().indexOf("Source."), "and on the marker to the definition's text");
});
