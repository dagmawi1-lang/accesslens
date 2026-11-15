// Runs the AccessLens rule engine and UI in headless Chromium.
// Usage: node test/run.mjs   (needs Playwright: npm i -D playwright && npx playwright install chromium)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
let failed = 0;
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failed++; };

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);

const audit = (html) => page.evaluate((h) => globalThis.AccessLens.auditHtml(h), html);
const rules = async (html) => (await audit(html)).issues.map((i) => i.rule);

// A clean, accessible page should produce no issues.
const clean = `<!DOCTYPE html><html lang="en"><head><title>Clean</title></head><body>
<h1>Title</h1><h2>Sub</h2><img src="a.png" alt="A chart of rainfall"><img src="d.png" alt="">
<label for="n">Name</label><input id="n"><label>Email <input type="email"></label>
<button aria-label="Close"><svg></svg></button><button>Save</button>
<a href="/r">Read the 2026 report</a><p style="color:#222;background-color:#fff">Readable</p>
<table><tr><th scope="col">Day</th></tr><tr><td>Sat</td></tr></table></body></html>`;
const c = await audit(clean);
ok(c.issues.length === 0, `clean page has no issues (got: ${c.issues.map((i) => i.rule).join(', ') || 'none'})`);
ok(c.score === 100, 'clean page scores 100');

ok((await rules('<html><head><title>x</title></head><body><h1>x</h1></body></html>')).includes('html-lang'), 'detects missing lang');
ok((await rules('<html lang="en"><body><h1>x</h1></body></html>')).includes('page-title'), 'detects missing title');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><img src="a.png"></body></html>')).includes('img-alt'), 'detects image without alt');
ok(!(await rules('<html lang="en"><title>t</title><body><h1>x</h1><img src="a.png" alt=""></body></html>')).includes('img-alt'), 'allows decorative alt=""');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><input placeholder="Name"></body></html>')).includes('form-label'), 'placeholder is not a label');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><input id="e"><label for="mail">Email</label></body></html>')).includes('form-label'), 'detects label pointing at wrong id');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><button><svg></svg></button></body></html>')).includes('button-name'), 'detects icon-only button');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><a href="/a">Click here</a></body></html>')).includes('link-name'), 'detects vague link text');
ok(!(await rules('<html lang="en"><title>t</title><body><h1>x</h1><a href="/a"><img src="i" alt="Home"></a></body></html>')).includes('link-name'), 'image alt names a link');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><h3>y</h3></body></html>')).includes('heading-order'), 'detects skipped heading level');
ok((await rules('<html lang="en"><title>t</title><body><h2>y</h2></body></html>')).includes('heading-order'), 'detects missing h1');

const low = await audit('<html lang="en"><title>t</title><body><h1>x</h1><p style="color:#aaaaaa">grey</p></body></html>');
ok(low.issues.some((i) => i.rule === 'color-contrast' && /2\.3\d:1/.test(i.message)), 'computes #aaa on white as ~2.32:1');
ok(!(await rules('<html lang="en"><title>t</title><body><h1>x</h1><p style="color:#767676">ok</p></body></html>')).includes('color-contrast'), '#767676 on white passes 4.5:1');
ok(!(await rules('<html lang="en"><title>t</title><body><h1>x</h1><p style="color:#949494;font-size:24px">big</p></body></html>')).includes('color-contrast'), 'large text uses 3:1 threshold');
ok((await rules('<html lang="en"><title>t</title><body style="background-color:#000"><h1>x</h1><p style="color:#333">dark</p></body></html>')).includes('color-contrast'), 'uses ancestor background colour');

ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><i id="a"></i><i id="a"></i></body></html>')).includes('duplicate-id'), 'detects duplicate ids');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><span tabindex="2">a</span></body></html>')).includes('positive-tabindex'), 'detects positive tabindex');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><audio autoplay src="a.mp3"></audio></body></html>')).includes('media-autoplay'), 'detects autoplay audio');
ok((await rules('<html lang="en"><title>t</title><body><h1>x</h1><table><tr><td>a</td></tr><tr><td>b</td></tr></table></body></html>')).includes('table-headers'), 'detects table without headers');

// Pasted HTML must never execute.
await page.evaluate(() => { window.__pwned = false; });
await audit('<html><body><img src=x onerror="window.__pwned=true"><script>window.__pwned=true</script></body></html>');
await page.waitForTimeout(200);
ok(!(await page.evaluate(() => window.__pwned)), 'pasted HTML scripts never run');

// UI flow: sample -> results, filters, markdown export.
await page.click('#sample');
const score = Number(await page.textContent('#score'));
const shown = await page.locator('#issues li').count();
ok((await page.evaluate(() => document.activeElement.id)) === 'out-h', 'focus moves to results heading');
ok(score < 60 && shown >= 10, `sample page shows issues in the UI (score ${score}, ${shown} issues)`);
await page.uncheck('input[value=moderate]');
const afterFilter = await page.locator('#issues li').count();
ok(afterFilter < shown && (await page.locator('#issues li.moderate').count()) === 0, 'severity filter hides moderate issues');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
ok(dl.suggestedFilename() === 'accessibility-report.md', 'report downloads as markdown');
const md = await page.evaluate(() => globalThis.AccessLens.toMarkdown(globalThis.AccessLens.auditHtml('<html><body><img src=a></body></html>')));
ok(md.includes('# Accessibility report') && md.includes('1.1.1'), 'markdown report includes WCAG references');

// Privacy: the app makes no network requests beyond its own files.
const external = [];
page.on('request', (r) => { if (!r.url().startsWith('file:')) external.push(r.url()); });
await page.click('#sample');
await page.waitForTimeout(300);
ok(external.length === 0, `no network requests while checking (${external.length})`);

ok(errors.length === 0, `no console/page errors (${errors.join(' | ')})`);
await page.screenshot({ path: path.join(root, 'docs', 'screenshot.png'), fullPage: false });
await browser.close();
console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
