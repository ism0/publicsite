'use strict';
// Web browser door. First tries to read the page straight from the browser (works
// only if the site allows it, i.e. CORS). Otherwise offers a framed window or a new tab.

// How each site opens, based on header checks on 2026-10-04:
// frame = cannot be read as text, but embedding is allowed
// tab   = embedding is blocked, so it opens in a new tab
// auto  = not checked: try text first, then offer the alternatives
const BOOKMARK_GROUPS = [
  ['Tiedostoalueet', [
    ['FUNET-arkisto', 'https://ftp.funet.fi/pub/', 'Legendaarinen tiedostoarkisto', 'frame'],
    ['Gutenberg', 'https://www.gutenberg.org/browse/languages/fi', 'Suomenkieliset e-kirjat', 'frame'],
    ['scene.org', 'https://files.scene.org/', 'Demoskenen tiedostot', 'tab'],
    ['download.fi', 'https://www.download.fi/', 'Ohjelmatiedostot', 'auto'],
  ]],
  ['Uutiset ja foorumit', [
    ['Iltalehti', 'https://www.iltalehti.fi/', 'Uutiset', 'tab'],
    ['MuroBBS', 'https://bbs.io-tech.fi/', 'Muropaketin ja io-techin foorumi', 'tab'],
    ['io-tech', 'https://www.io-tech.fi/', 'Tekniikkauutiset', 'frame'],
  ]],
  ['Skene', [
    ['Assembly', 'https://www.assembly.org/', 'Demopartyt', 'auto'],
    ['Skrolli', 'https://skrolli.fi/', 'Tietokonekulttuurilehti', 'auto'],
  ]],
];
const BOOKMARKS = BOOKMARK_GROUPS.flatMap(([, list]) => list);
const MODE_MARK = { frame: ' ■', tab: ' »', auto: '' };

async function webDoor(term) {
  for (;;) {
    term.clear();
    menuScreen(term, {
      title: 'Webbiselain',
      items: [
        ...BOOKMARKS.map(([name, , , mode], i) => ({ key: String(i + 1), label: name + MODE_MARK[mode] })),
        { key: 'U', label: 'Oma osoite' },
        { key: 'Q', label: 'Päävalikko' },
      ],
      art: { seed: 11, aurora: [13, 5, 12] },
      info: [
        ['Merkit', '■ = ikkuna, » = uusi välilehti'],
        ['Muut', 'tekstinä, jos sivusto sallii'],
      ],
    });
    term.pipe(' |07Valinta |08» |15');

    const keys = 'UQ\x1b' + BOOKMARKS.map((_, i) => String(i + 1)).join('');
    const k = await term.readKey(keys);
    term.write(k === '\x1b' ? '\n' : k + '\n');

    if (k === 'Q' || k === '\x1b') return;
    if (k === 'U') {
      term.pipe('\n |07Osoite |08» |15');
      const input = await term.readLine(200);
      if (input && input.trim()) await openUrl(term, input);
    } else {
      const [name, url, , mode] = BOOKMARKS[Number(k) - 1];
      if (mode === 'frame') await frameWindow(term, url, name);
      else if (mode === 'tab') await openTab(term, url, name);
      else await openUrl(term, url);
    }
  }
}

async function openTab(term, url, name) {
  term.pipeln('');
  term.pipeln(`|07${noPipes(name)} ei salli upottamista – avataan uuteen välilehteen.`);
  window.open(url, '_blank', 'noopener,noreferrer');
  await term.pause();
}

/** Opens an address. Followed links stay in the same browser view. */
async function openUrl(term, address) {
  const history = [];
  let next = address;
  while (next) {
    const u = safeUrl(next);
    if (!u) {
      await showError(term, 'Virheellinen osoite (vain http/https)');
      return;
    }
    history.push(u.href);

    term.clear();
    term.pipeln(`|07ATDT |15${noPipes(u.host)}`);
    term.pipe('|08Yhdistetään...|07');
    let doc = null;
    try {
      doc = await fetchPage(u.href, term.cols);
    } catch {
      doc = null;
    }
    term.write('\n');

    if (!doc) {
      await carrierLost(term, u.href);
      // If this was a followed link, go back to the previous page.
      history.pop();
      next = history.pop();
      continue;
    }

    const r = await page(term, {
      title: doc.title || u.host,
      lines: doc.lines.length ? doc.lines : [[[8, '(tyhjä sivu)']]],
      links: doc.links,
      canBack: history.length > 1,
    });
    if (!r) return;
    if (r.back) {
      history.pop();
      next = history.pop();
    } else {
      next = r.link;
    }
  }
}

async function fetchPage(url, width) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const size = Number(res.headers.get('content-length') || 0);
  if (size > MAX_BYTES) throw new Error('liian suuri');
  const type = (res.headers.get('content-type') || '').toLowerCase();
  const text = (await res.text()).slice(0, MAX_BYTES);
  if (type.includes('html') || (!type && /^\s*</.test(text))) {
    return htmlToText(text, res.url || url, width);
  }
  if (type.startsWith('text/') || type.includes('json') || type.includes('xml')) {
    return textToLines(text, width);
  }
  throw new Error('tiedostotyyppiä ei voi näyttää');
}

async function carrierLost(term, url) {
  term.pipeln('');
  term.pipeln('|12*** NO CARRIER ***');
  term.pipeln('');
  term.pipeln('|07Etäpää ei salli sivun lukemista suoraan selaimesta.');
  term.pipeln('');
  item(term, 'I', 'Avaa ikkunaan', 'toimii, jos sivusto sallii upottamisen');
  item(term, 'O', 'Uusi välilehti', 'avaa sivun normaalisti');
  item(term, 'Q', 'Paluu');
  term.pipe('\n |07Valinta |08» |15');
  const k = await term.readKey('IOQ\x1b');
  term.write(k === '\x1b' ? '\n' : k + '\n');
  if (k === 'I') await frameWindow(term, url);
  else if (k === 'O') window.open(url, '_blank', 'noopener,noreferrer');
}

/** Shows the page in a framed window over the BBS. Closes with the button or Esc. */
function frameWindow(term, url, title = url, opts = {}) {
  // opts.local = a page of this site (e.g. play.html?g=lord), given as a relative path
  const src = opts.local ? url : safeUrl(url) && safeUrl(url).href;
  if (!src) return Promise.resolve();
  const box = document.getElementById('frame');
  const view = document.getElementById('frame-view');
  const close = document.getElementById('frame-close');
  document.getElementById('frame-title').textContent = opts.local
    ? `${title}  –  sulje [X]-painikkeesta`
    : `${title}  –  Esc sulkee. Jos ikkuna jää tyhjäksi, sivusto estää upotuksen.`;
  view.src = src;
  box.hidden = false;
  if (opts.local) view.addEventListener('load', () => view.focus(), { once: true });
  else close.focus();

  return new Promise(resolve => {
    const done = () => {
      close.removeEventListener('click', done);
      document.removeEventListener('keydown', onKey, true);
      view.src = 'about:blank';
      box.hidden = true;
      term.focus();
      resolve();
    };
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done();
      }
    };
    close.addEventListener('click', done);
    document.addEventListener('keydown', onKey, true);
  });
}
