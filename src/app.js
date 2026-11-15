(function () {
  const { auditHtml, toMarkdown } = globalThis.AccessLens;
  const $ = (id) => document.getElementById(id);
  let last = null;

  const SAMPLE = `<!DOCTYPE html>
<html>
<head><title></title></head>
<body>
  <h2>Community Garden Signup</h2>
  <img src="garden.jpg">
  <h4>Join us this spring</h4>
  <p style="color:#aaaaaa">Volunteers meet every Saturday at 9am.</p>
  <form>
    <input type="text" placeholder="Your name">
    <input type="email" id="email"><label for="mail">Email</label>
    <button><svg width="16" height="16"></svg></button>
  </form>
  <a href="/details">Click here</a>
  <a href="/photos"><img src="cam.png"></a>
  <div id="note">Note</div><div id="note">Another note</div>
  <span tabindex="3">Skip ahead</span>
  <table><tr><td>Day</td><td>Time</td></tr><tr><td>Sat</td><td>9am</td></tr></table>
</body>
</html>`;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function render() {
    const show = new Set([...document.querySelectorAll('input[name=sev]:checked')].map((c) => c.value));
    const list = last.issues.filter((i) => show.has(i.severity));
    $('issues').innerHTML = list.map((i) => `
      <li class="issue ${i.severity}">
        <p class="msg"><span class="badge ${i.severity}">${i.severity}</span> ${esc(i.message)}</p>
        <p class="meta">WCAG ${esc(i.wcag)}</p>
        <p class="fix"><b>How to fix:</b> ${esc(i.fix)}</p>
        ${i.snippet ? `<pre><code>${esc(i.snippet)}</code></pre>` : ''}
      </li>`).join('');
    $('none').hidden = last.issues.length !== 0;
  }

  function run() {
    const html = $('html').value.trim();
    if (!html) { $('status').textContent = ''; $('html').focus(); alertMsg('Paste some HTML or open a file first.'); return; }
    last = auditHtml(html);
    $('results').hidden = false;
    $('score').textContent = last.score;
    ['critical', 'serious', 'moderate'].forEach((s) => { $('c-' + s).textContent = last.counts[s]; });
    render();
    $('out-h').focus();
  }

  function alertMsg(msg) { $('html-help').textContent = msg; $('html-help').classList.add('warn'); }

  $('run').addEventListener('click', run);
  $('sample').addEventListener('click', () => { $('html').value = SAMPLE; run(); });
  $('file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('html').value = await f.text();
    run();
  });
  document.querySelectorAll('input[name=sev]').forEach((c) => c.addEventListener('change', () => last && render()));

  $('export').addEventListener('click', () => {
    if (!last) return;
    const blob = new Blob([toMarkdown(last)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'accessibility-report.md';
    a.click();
    URL.revokeObjectURL(a.href);
    $('status').textContent = 'Report downloaded.';
  });
  $('copy').addEventListener('click', async () => {
    if (!last) return;
    try { await navigator.clipboard.writeText(toMarkdown(last)); $('status').textContent = 'Report copied.'; }
    catch { $('status').textContent = 'Copy failed. Use Download instead.'; }
  });
})();
