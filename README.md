# AccessLens

**A private accessibility checker for web pages. Everything runs in your browser, and nothing is uploaded.**

Built for **NorCal Hacks 27** (Social Impact / Education).

## The problem

About 1 in 4 US adults has a disability, and most websites still have basic accessibility problems such as images without descriptions, form fields without labels, and text that is too faint to read. Student makers, clubs and small nonprofits often don't know what to check. Many online checkers also require you to upload your page or give a public URL, which doesn't work for private, unreleased or school-internal pages.

## What AccessLens does

1. **Paste HTML or open an `.html` file.**
2. AccessLens runs **12 checks based on WCAG 2.2**:
   - images without alt text (1.1.1)
   - form fields without labels, including the "placeholder isn't a label" mistake (1.3.1 / 4.1.2)
   - icon-only buttons with no name (4.1.2)
   - empty links and vague link text like "click here" (2.4.4)
   - missing `<h1>`, skipped heading levels and empty headings (1.3.1)
   - **colour contrast**, using the real WCAG formula, with 4.5:1 for normal text and 3:1 for large text (1.4.3)
   - missing page language (3.1.1) and page title (2.4.2)
   - duplicate ids, positive `tabindex`, autoplaying audio, and tables without headers
3. Each issue shows **why it matters**, the **WCAG criterion**, **how to fix it**, and the offending code.
4. You get a **score out of 100**, severity filters, and a **Markdown report** to download or copy into a GitHub issue.

## Privacy by design

- No server, no account, no analytics.
- The page's Content-Security-Policy sets `connect-src 'none'`, so the app *cannot* send your HTML anywhere.
- Pasted HTML is parsed with `DOMParser`, which never runs its scripts. A test checks this.

## Run it

No install needed: open `index.html` in any modern browser, or use the GitHub Pages link.

## Tests

29 automated tests run the rule engine and the UI in headless Chromium. They check every rule, the contrast maths, that pasted scripts never execute, that no network requests are made, and the keyboard/focus flow.

```bash
npm install
npx playwright install chromium
npm test
```

AccessLens also checks itself: its own page scores 100/100.

## How it's built

- Plain HTML, CSS and JavaScript, with no framework and no build step.
- `src/checks.js`: the rule engine, including an accessible-name calculation and the WCAG contrast formula.
- `src/app.js`: the UI, filters and report export.
- `test/run.mjs`: Playwright tests.

## Limitations

Automated checks catch only part of accessibility problems. AccessLens reads inline `style` colours, not external stylesheets, and it can't judge whether alt text is *good*. Always test with a keyboard and a screen reader too.

## What's next

- A browser extension that checks the live page, including computed styles
- Before/after fix previews
- Checks for ARIA misuse and focus traps

## AI disclosure

AI coding assistance (Claude) was used to help write and test the code and documentation.

## License

MIT
