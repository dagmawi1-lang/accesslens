(function () {
// AccessLens rule engine.
// Runs entirely in the browser on a parsed Document. Nothing is uploaded anywhere.
// Each rule returns issues: { rule, wcag, severity, message, fix, snippet }

const VAGUE_LINK_TEXT = [
  'click here', 'here', 'read more', 'more', 'learn more', 'link', 'this', 'go', 'details', 'click',
];

function snippet(el) {
  if (!el || !el.outerHTML) return '';
  const html = el.outerHTML.replace(/\s+/g, ' ').trim();
  return html.length > 140 ? html.slice(0, 137) + '...' : html;
}

function text(el) {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

// Simplified accessible-name calculation (covers the common cases).
function accessibleName(el, doc) {
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const name = labelledby.split(/\s+/).map((id) => doc.getElementById(id)).filter(Boolean).map(text).join(' ').trim();
    if (name) return name;
  }
  const aria = (el.getAttribute('aria-label') || '').trim();
  if (aria) return aria;
  const tag = el.tagName.toLowerCase();
  if (['input', 'select', 'textarea'].includes(tag)) {
    if (el.id) {
      const lab = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab && text(lab)) return text(lab);
    }
    const wrap = el.closest('label');
    if (wrap && text(wrap)) return text(wrap);
    if (tag === 'input' && ['submit', 'button', 'reset'].includes((el.type || '').toLowerCase())) {
      return (el.getAttribute('value') || '').trim();
    }
    if (tag === 'input' && (el.type || '').toLowerCase() === 'image') return (el.getAttribute('alt') || '').trim();
    return (el.getAttribute('title') || '').trim();
  }
  // Content: text plus alt text of images inside.
  let name = text(el);
  if (!name) {
    name = [...el.querySelectorAll('img[alt], svg[aria-label]')]
      .map((i) => i.getAttribute('alt') || i.getAttribute('aria-label') || '').join(' ').trim();
  }
  return name || (el.getAttribute('title') || '').trim();
}

// ---------- colour contrast helpers (WCAG 2.x formula) ----------
const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', yellow: '#ffff00', orange: '#ffa500', navy: '#000080', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', gainsboro: '#dcdcdc', whitesmoke: '#f5f5f5' };

function parseColor(value) {
  if (!value) return null;
  let v = value.trim().toLowerCase();
  if (NAMED[v]) v = NAMED[v];
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16));
  m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return [m[1], m[2], m[3]].map(Number);
  return null;
}

function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function inlineStyle(el, prop) {
  const style = el.getAttribute && el.getAttribute('style');
  if (!style) return null;
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'));
  return m ? m[1].trim() : null;
}

function effectiveBackground(el) {
  for (let n = el; n && n.getAttribute; n = n.parentElement) {
    const bg = inlineStyle(n, 'background-color') || inlineStyle(n, 'background');
    const c = parseColor(bg && bg.split(/\s+/)[0]);
    if (c) return c;
  }
  return [255, 255, 255];
}

// ---------- rules ----------
const RULES = [
  {
    id: 'html-lang', wcag: '3.1.1 Language of Page', severity: 'serious',
    run(doc) {
      const lang = doc.documentElement.getAttribute('lang');
      return lang && lang.trim() ? [] : [{ message: 'The <html> element has no lang attribute, so screen readers may use the wrong pronunciation.', fix: 'Add a language, for example <html lang="en">.', snippet: '<html>' }];
    },
  },
  {
    id: 'page-title', wcag: '2.4.2 Page Titled', severity: 'moderate',
    run(doc) {
      const t = doc.querySelector('title');
      return t && text(t) ? [] : [{ message: 'The page has no <title>, so users cannot tell tabs or windows apart.', fix: 'Add a short, descriptive <title> inside <head>.', snippet: '<head>' }];
    },
  },
  {
    id: 'img-alt', wcag: '1.1.1 Non-text Content', severity: 'critical',
    run(doc) {
      return [...doc.querySelectorAll('img')].filter((img) => !img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation' && img.getAttribute('aria-hidden') !== 'true')
        .map((img) => ({ el: img, message: 'Image has no alt attribute. Screen readers may read out the file name instead.', fix: 'Describe the image in alt="...". If it is purely decorative, use alt="".' }));
    },
  },
  {
    id: 'form-label', wcag: '1.3.1 Info and Relationships / 4.1.2 Name, Role, Value', severity: 'critical',
    run(doc) {
      const fields = doc.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea');
      return [...fields].filter((f) => !accessibleName(f, doc))
        .map((f) => ({ el: f, message: 'Form field has no label, so screen reader users do not know what to enter. (A placeholder is not a label.)', fix: 'Add <label for="id">, wrap the field in a <label>, or add aria-label.' }));
    },
  },
  {
    id: 'button-name', wcag: '4.1.2 Name, Role, Value', severity: 'critical',
    run(doc) {
      const btns = doc.querySelectorAll('button, [role=button], input[type=submit], input[type=button], input[type=image]');
      return [...btns].filter((b) => !accessibleName(b, doc))
        .map((b) => ({ el: b, message: 'Button has no accessible name (often an icon-only button).', fix: 'Add visible text, or aria-label="What this button does".' }));
    },
  },
  {
    id: 'link-name', wcag: '2.4.4 Link Purpose', severity: 'serious',
    run(doc) {
      const out = [];
      doc.querySelectorAll('a[href]').forEach((a) => {
        const name = accessibleName(a, doc);
        if (!name) out.push({ el: a, message: 'Link has no text, so it is announced only as "link".', fix: 'Add link text, or aria-label for icon links.' });
        else if (VAGUE_LINK_TEXT.includes(name.toLowerCase().replace(/[.!…]+$/, ''))) out.push({ el: a, severity: 'moderate', message: `Link text "${name}" does not say where the link goes.`, fix: 'Use descriptive text, e.g. "Read the 2026 safety report" instead of "click here".' });
      });
      return out;
    },
  },
  {
    id: 'heading-order', wcag: '1.3.1 Info and Relationships', severity: 'moderate',
    run(doc) {
      const hs = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')];
      const out = [];
      if (doc.body && doc.body.children.length && !hs.some((h) => h.tagName === 'H1')) out.push({ message: 'The page has no <h1>, so there is no main heading to jump to.', fix: 'Add one <h1> describing the page.', snippet: '<body>' });
      let prev = 0;
      hs.forEach((h) => {
        const lvl = Number(h.tagName[1]);
        if (prev && lvl > prev + 1) out.push({ el: h, message: `Heading jumps from h${prev} to h${lvl}, which breaks the outline screen reader users navigate by.`, fix: `Use h${prev + 1} here, or restructure the headings.` });
        if (!text(h) && !h.querySelector('img[alt]')) out.push({ el: h, message: 'Heading is empty.', fix: 'Add heading text or remove the empty heading.' });
        prev = lvl;
      });
      return out;
    },
  },
  {
    id: 'color-contrast', wcag: '1.4.3 Contrast (Minimum)', severity: 'serious',
    run(doc) {
      const out = [];
      doc.querySelectorAll('[style]').forEach((el) => {
        const fg = parseColor(inlineStyle(el, 'color'));
        if (!fg || !text(el)) return;
        const bg = effectiveBackground(el);
        const ratio = contrastRatio(fg, bg);
        const size = parseFloat(inlineStyle(el, 'font-size') || '16');
        const bold = /bold|[6-9]00/.test(inlineStyle(el, 'font-weight') || '') || /^(B|STRONG|H1|H2|H3)$/.test(el.tagName);
        const large = size >= 24 || (bold && size >= 18.66);
        const need = large ? 3 : 4.5;
        if (ratio < need) out.push({ el, message: `Text contrast is ${ratio.toFixed(2)}:1. It needs at least ${need}:1 to be readable for people with low vision.`, fix: 'Darken the text or lighten the background until the ratio passes.' });
      });
      return out;
    },
  },
  {
    id: 'duplicate-id', wcag: '4.1.1 Parsing / 1.3.1', severity: 'moderate',
    run(doc) {
      const seen = new Map();
      doc.querySelectorAll('[id]').forEach((el) => seen.set(el.id, (seen.get(el.id) || []).concat(el)));
      return [...seen].filter(([, els]) => els.length > 1)
        .map(([id, els]) => ({ el: els[1], message: `The id "${id}" is used ${els.length} times, so labels and ARIA references can point to the wrong element.`, fix: 'Give every element a unique id.' }));
    },
  },
  {
    id: 'positive-tabindex', wcag: '2.4.3 Focus Order', severity: 'moderate',
    run(doc) {
      return [...doc.querySelectorAll('[tabindex]')].filter((el) => Number(el.getAttribute('tabindex')) > 0)
        .map((el) => ({ el, message: 'tabindex greater than 0 changes the keyboard order in confusing ways.', fix: 'Use tabindex="0" (or none) and order elements correctly in the HTML.' }));
    },
  },
  {
    id: 'media-autoplay', wcag: '1.4.2 Audio Control', severity: 'serious',
    run(doc) {
      return [...doc.querySelectorAll('video[autoplay]:not([muted]), audio[autoplay]')]
        .map((el) => ({ el, message: 'Media plays sound automatically, which interferes with screen readers.', fix: 'Remove autoplay, or mute it and provide visible controls.' }));
    },
  },
  {
    id: 'table-headers', wcag: '1.3.1 Info and Relationships', severity: 'moderate',
    run(doc) {
      return [...doc.querySelectorAll('table')].filter((t) => t.getAttribute('role') !== 'presentation' && t.querySelectorAll('tr').length > 1 && !t.querySelector('th'))
        .map((t) => ({ el: t, message: 'Data table has no header cells, so each cell is read without context.', fix: 'Use <th scope="col"> / <th scope="row"> for header cells.' }));
    },
  },
];

const WEIGHT = { critical: 10, serious: 6, moderate: 3 };

function audit(doc) {
  const issues = [];
  for (const rule of RULES) {
    for (const r of rule.run(doc)) {
      issues.push({
        rule: rule.id,
        wcag: rule.wcag,
        severity: r.severity || rule.severity,
        message: r.message,
        fix: r.fix,
        snippet: r.snippet || snippet(r.el),
      });
    }
  }
  const penalty = issues.reduce((s, i) => s + WEIGHT[i.severity], 0);
  const score = Math.max(0, Math.round(100 - penalty));
  const counts = { critical: 0, serious: 0, moderate: 0 };
  issues.forEach((i) => counts[i.severity]++);
  return { score, counts, issues, rulesChecked: RULES.length };
}

function auditHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return audit(doc);
}

function toMarkdown(result, title = 'Accessibility report') {
  const lines = [`# ${title}`, '', `**Score:** ${result.score}/100  `, `**Issues:** ${result.issues.length} (critical ${result.counts.critical}, serious ${result.counts.serious}, moderate ${result.counts.moderate})`, '', '_Generated locally by AccessLens. Automated checks catch some, not all, accessibility problems. Test with a keyboard and a screen reader too._', ''];
  ['critical', 'serious', 'moderate'].forEach((sev) => {
    const list = result.issues.filter((i) => i.severity === sev);
    if (!list.length) return;
    lines.push(`## ${sev[0].toUpperCase() + sev.slice(1)} (${list.length})`, '');
    list.forEach((i, n) => {
      lines.push(`${n + 1}. **${i.message}**  `, `   WCAG ${i.wcag}  `, `   Fix: ${i.fix}  `);
      if (i.snippet) lines.push('   `' + i.snippet.replace(/`/g, "'") + '`');
      lines.push('');
    });
  });
  return lines.join('\n');
}

globalThis.AccessLens = { RULES, audit, auditHtml, toMarkdown, accessibleName, parseColor, contrastRatio };
})();
