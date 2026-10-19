# LinkedIn Markdown Specs

A Chrome extension that automatically renders markdown formatting in LinkedIn feed posts.

LinkedIn doesn't support rich text formatting natively, but many people write posts using common markdown conventions. This extension detects those patterns and renders them visually as you browse your feed.

## Supported syntax

| You type | Renders as |
|---|---|
| `# Heading` | large heading |
| `## Sub-heading` | medium heading |
| `### Sub-sub` | small heading |
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `/italic/` | *italic (alt)* |
| `_underline_` | underlined text |
| `* item text` | bullet list |
| `- item text` | bullet list (dash) |
| `> quote text` | blockquote (consecutive `>` lines merge; a bare `>` adds a blank line inside) |

Markers can be nested: `*/bold italic/*`, `**_bold underlined_**`, etc.

## Installation

1. Download the latest zip from the [Releases page](https://github.com/DerailleurAgile/linkedin-markdown-styler/releases/latest).
2. Unzip it anywhere on your machine — the folder it creates is your extension folder.
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the unzipped folder.
6. Navigate to your LinkedIn feed — formatting renders automatically.

> **Note:** Chrome may show a warning about developer-mode extensions on startup. This is normal for extensions installed outside the Chrome Web Store. Click **Keep** to dismiss it.

## How it works

- A content script runs on every `linkedin.com` page. LinkedIn is a single-page app, so a tab that first loads on, say, `/notifications/` can move to the feed without a page load; matching every page means the script is already there. Only post and comment text containers are ever touched.
- A `MutationObserver` watches for new posts as the feed loads dynamically and processes newly added post text immediately. A full rescan also runs 500 ms after the page goes quiet, as a fallback for text that changes in place.
- Rather than modifying LinkedIn's React-managed DOM elements (which breaks reconciliation), the extension hides the original text node and injects a sibling `<span>` containing the rendered HTML. React never sees the sibling, so the UI stays stable.
- A `popstate` listener handles SPA navigation (browser Back/Forward).

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension manifest (MV3) |
| `content.js` | Markdown parser and DOM processor |
| `styles.css` | Styles for rendered output |
| `popup.html` | Toolbar popup with syntax reference |
| `icons/` | Extension icons (16 × 16, 48 × 48, 128 × 128) |

## Limitations

- Read-only rendering: the extension styles posts as you read them; it does not affect the LinkedIn composer.
- LinkedIn occasionally changes its CSS class names. If rendering stops working, check `POST_TEXT_SELECTORS` in `content.js` and update the selectors to match the current markup.