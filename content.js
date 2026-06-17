/**
 * LinkedIn Markdown Renderer — content.js
 *
 * Supported syntax:
 *   **bold**           → <strong>
 *   _underline_        → <u>
 *   /italics/          → <em>
 *   * item             → <ul><li>  (bullet list)
 *   - item             → <ul><li>  (dash list)
 */

'use strict';

// ─── Selectors ────────────────────────────────────────────────────────────────
// LinkedIn occasionally changes class names; list multiple fallbacks.
const POST_TEXT_SELECTORS = [
  // Permalink / post detail page — stable data-testid, text lives directly in this span.
  '[data-testid="expandable-text-box"]',

  // Main feed — post body text is in:
  //   div.update-components-update-v2__commentary
  //     span.break-words.tvm-parent-container
  //       span[dir="ltr"]   ← text here
  // Scoping to __commentary ensures we only hit post bodies, not comment wrappers
  // (comments use div.break-words inside translation-container-* elements).
  '.update-components-update-v2__commentary .break-words',
];

// Attribute stamped on processed nodes to prevent double-processing.
const PROCESSED_ATTR = 'data-md-rendered';

// ─── Markdown → HTML conversion ───────────────────────────────────────────────

/**
 * Escape HTML special chars in a raw string so we don't accidentally
 * interpret any pre-existing angle brackets as markup.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Apply inline markdown rules to a single line of (HTML-escaped) text.
 *
 * Rule order matters:
 *   1. **bold** first — consumes double-asterisks so they don't bleed into italic rule
 *   2. *italic* (single asterisk, not at line start — that's a list)
 *   3. /italic/  alternative italic syntax
 *   4. _underline_  — requires non-word chars on both sides to avoid "snake_case" hits
 */
function applyInlineRules(line) {
  const tokens = [];

  // Stash rendered HTML as a null-byte-delimited token index.
  // Null bytes never appear in LinkedIn post text, so there is no collision risk.
  // This prevents HTML injected by one rule (e.g. the "/" in "</em>")
  // from being matched by a subsequent rule.
  function tokenize(html) {
    const id = `\x00${tokens.length}\x00`;
    tokens.push(html);
    return id;
  }

  // Recursively render any nested markers inside a captured group,
  // enabling combinations like */bold italic/* or *_bold underline_*
  function inner(c) { return applyInlineRules(c); }

  // 1. **bold** — double asterisk takes priority over single
  line = line.replace(/\*\*(.+?)\*\*/g,
    (_, c) => tokenize(`<strong>${inner(c)}</strong>`));

  // 2. *italic* — single asterisk (standard GitHub markdown)
  line = line.replace(/(?<!\*)\*(?!\*)(?!\s)(.+?)(?<!\s)\*(?!\*)/g,
    (_, c) => tokenize(`<em>${inner(c)}</em>`));

  // 3. /italic/ — skip :// so URLs stay intact; trailing / must not precede \w
  line = line.replace(/(?<!:)\/(?!\/)(.+?)(?<![\s:])\/(?!\w)/g,
    (_, c) => tokenize(`<em>${inner(c)}</em>`));

  // 4. _underline_ — requires non-word boundary on both sides
  line = line.replace(/(?<![_\w])_([^_]+?)_(?![_\w])/g,
    (_, c) => tokenize(`<u>${inner(c)}</u>`));

  // Restore all tokens to actual HTML
  tokens.forEach((html, i) => {
    line = line.split(`\x00${i}\x00`).join(html);
  });

  return line;
}

/**
 * Convert a block of plain text containing markdown to an HTML string.
 * Handles bullet lists (both * and -) as well as inline styles.
 */
function markdownToHtml(text) {
  const lines = text.split('\n');
  const output = [];
  let listItems = [];

  let justFlushedList = false;

  function flushList() {
    if (listItems.length) {
      output.push(`<ul class="lmr-list">${listItems.join('')}</ul>`);
      listItems = [];
      justFlushedList = true;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const listMatch = raw.match(/^([*\-])\s+(.+)$/);

    if (listMatch) {
      justFlushedList = false;
      const itemContent = applyInlineRules(escapeHtml(listMatch[2]));
      listItems.push(`<li>${itemContent}</li>`);
    } else {
      flushList();
      // Swallow the first blank line after a list — the <ul> block already
      // creates a line break, so the blank would otherwise double-space.
      if (raw.trim() === '') {
        if (!justFlushedList) output.push('');
        justFlushedList = false;
      } else {
        justFlushedList = false;
        output.push(applyInlineRules(escapeHtml(raw)));
      }
    }
  }

  flushList();

  return output.join('\n');
}

// ─── DOM processing ───────────────────────────────────────────────────────────

/**
 * Return true if the element's text contains any markdown syntax we recognise.
 */
function containsMarkdown(text) {
  return (
    /\*\*.+?\*\*/.test(text) ||                         // **bold**
    /(?<!\*)\*(?!\*)(?!\s).+?(?<!\s)\*(?!\*)/.test(text) || // *italic*
    /(?<!:)\/(?!\/).+?(?<![\s:])\/(?!\w)/.test(text) || // /italic/
    /(?<![_\w])_[^_]+?_(?![_\w])/.test(text) ||         // _underline_
    /^[*\-]\s+.+/m.test(text)                            // * or - list items
  );
}

/**
 * Process a single LinkedIn post text container element.
 */
function processElement(el) {
  
  if (el.hasAttribute(PROCESSED_ATTR)) return;
  if (el.hasAttribute('data-lmr-sibling')) return;

  const originalText = el.innerText;
  if (!originalText || !containsMarkdown(originalText)) return;

  el.setAttribute(PROCESSED_ATTR, '1');

  const rendered = markdownToHtml(originalText);

  // IMPORTANT: Do not mutate el's children — LinkedIn's React reconciler holds
  // references to those nodes and will unmount the entire post component if it
  // finds them missing on re-render (e.g. after closing a dialog).
  //
  // Instead: hide the original element and inject a sibling with our HTML.
  // React never touches the sibling, so reconciliation is unaffected.
  const wrapper = document.createElement('span');
  wrapper.className = 'lmr-rendered';
  wrapper.setAttribute('data-lmr-sibling', '1');
  wrapper.innerHTML = rendered;

  el.style.display = 'none';
  el.insertAdjacentElement('afterend', wrapper);
}

/**
 * Scan the document for all matching post text containers and process them.
 */
function processAllPosts() {
  const selector = POST_TEXT_SELECTORS.join(', ');
  document.querySelectorAll(selector).forEach(processElement);
}

// ─── MutationObserver for dynamic feed loading ────────────────────────────────

// 3. Improve the Observer to catch SPA (Single Page App) navigation
let timeout = null;
const observer = new MutationObserver(() => {
  clearTimeout(timeout);
  timeout = setTimeout(processAllPosts, 500); // 500ms allows React to finish
});

// Start observing
observer.observe(document.body, { childList: true, subtree: true });

// Also catch browser 'Back/Forward' navigation
window.addEventListener('popstate', () => setTimeout(processAllPosts, 500));

// Initial pass
if (document.readyState === 'complete') {
  processAllPosts();
} else {
  window.addEventListener('load', processAllPosts);
}