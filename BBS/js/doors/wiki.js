'use strict';
// Wikipedia and Wikisource via the MediaWiki API (origin=* allows browser requests).

const WIKIPEDIA = {
  host: 'fi.wikipedia.org',
  name: 'Tietosanakirja',
  art: { seed: 2, moon: true, aurora: [9, 1, 11] },
  subtitle: 'fi.wikipedia.org',
  featured: [],
};

const WIKISOURCE = {
  host: 'fi.wikisource.org',
  name: 'Tekstitiedostot',
  art: { seed: 8, aurora: [10, 2, 15] },
  subtitle: 'fi.wikisource.org – suomalaisia klassikoita',
  featured: [
    ['Seitsemän veljestä', 'Aleksis Kivi, 1870'],
    ['Kalevala', 'Elias Lönnrot, 1849'],
    ['Nummisuutarit', 'Aleksis Kivi, 1864'],
  ],
};

// Parts of the page that are only noise as text
const REMOVE = [
  '.mw-editsection', 'sup.reference', '.mw-references-wrap', 'ol.references', '.reflist',
  '.navbox', '.vertical-navbox', '.metadata', '.noprint', '.mw-empty-elt', '.ambox',
  '.hatnote', '.toc', '#toc', '.infobox', 'figure', '.thumb', '.gallery', '.mw-cite-backlink',
];

async function api(host, params) {
  const url = new URL(`https://${host}/w/api.php`);
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2', origin: '*' })) {
    url.searchParams.set(k, v);
  }
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Article title from a link to the same wiki, otherwise null. */
function wikiTitle(link, host) {
  let u;
  try { u = new URL(link); } catch { return null; }
  if (u.hostname !== host) return null;
  if (u.pathname.startsWith('/wiki/')) {
    return decodeURIComponent(u.pathname.slice(6)).replace(/_/g, ' ');
  }
  if (u.pathname === '/w/index.php' && u.searchParams.get('title')) {
    return u.searchParams.get('title').replace(/_/g, ' ');
  }
  return null;
}

function plain(html) {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
}

async function wikiDoor(term, cfg) {
  for (;;) {
    term.clear();
    menuScreen(term, {
      title: cfg.name,
      items: [
        ...cfg.featured.map(([title], i) => ({ key: String(i + 1), label: title })),
        { key: 'H', label: 'Hae' },
        { key: 'S', label: 'Satunnainen sivu' },
        { key: 'Q', label: 'Päävalikko' },
      ],
      art: cfg.art,
      info: [
        ['Lähde', cfg.subtitle],
        ...cfg.featured.map(([title, desc], i) => [String(i + 1), `${title} – ${desc}`]),
      ],
    });
    term.pipe(' |07Valinta |08» |15');

    const keys = 'HSQ\x1b' + cfg.featured.map((_, i) => String(i + 1)).join('');
    const k = await term.readKey(keys);
    term.write(k === '\x1b' ? '\n' : k + '\n');

    if (k === 'Q' || k === '\x1b') return;
    if (k === 'H') await search(term, cfg);
    else if (k === 'S') await randomPage(term, cfg);
    else await read(term, cfg, cfg.featured[Number(k) - 1][0]);
  }
}

async function search(term, cfg) {
  term.pipe('\n |07Hakusana |08» |15');
  const q = await term.readLine(50);
  if (!q || !q.trim()) return;

  const limit = Math.max(3, Math.min(20, Math.floor((term.rows - 6) / 2)));
  const data = await loading(term, () => api(cfg.host, {
    action: 'query', list: 'search', srsearch: q.trim(), srlimit: String(limit), srprop: 'snippet',
  }));
  if (!data) return;
  const hits = data.query?.search || [];
  if (!hits.length) {
    await showError(term, 'Ei osumia');
    return;
  }

  header(term, cfg.name, `Haku: ${q.trim()}`);
  hits.forEach((h, i) => {
    term.pipeln(` |08[|14${String(i + 1).padStart(2)}|08] |15${noPipes(h.title)}`);
    const snippet = plain(h.snippet).replace(/\s+/g, ' ').trim();
    term.pipeln(`      |08${noPipes(snippet.slice(0, term.cols - 7))}`);
  });
  term.pipe('\n |07Numero |08(|07Enter = paluu|08) » |15');
  const n = Number((await term.readLine(3)) || 0);
  if (n >= 1 && n <= hits.length) await read(term, cfg, hits[n - 1].title);
}

async function randomPage(term, cfg) {
  const data = await loading(term, () => api(cfg.host, {
    action: 'query', list: 'random', rnnamespace: '0', rnlimit: '1',
  }));
  const title = data?.query?.random?.[0]?.title;
  if (title) await read(term, cfg, title);
}

/** Reads a page; wiki links open in the same view, others in the web browser. */
async function read(term, cfg, firstTitle) {
  const history = [firstTitle];
  let doc = null;
  while (history.length) {
    const title = history[history.length - 1];
    if (!doc) {
      const data = await loading(term, () => api(cfg.host, {
        action: 'parse', page: title, prop: 'text', redirects: '1',
        disableeditsection: '1', disabletoc: '1',
      }));
      if (!data) return;
      if (data.error) {
        await showError(term, data.error.code === 'missingtitle' ? 'Sivua ei löytynyt' : data.error.info || 'Virhe');
        history.pop();
        if (!history.length) return;
        continue;
      }
      doc = htmlToText(data.parse.text, `https://${cfg.host}/wiki/`, term.cols, { remove: REMOVE });
      doc.title = data.parse.title;
    }

    const r = await page(term, {
      title: `${cfg.name} » ${doc.title}`,
      lines: doc.lines,
      links: doc.links,
      canBack: history.length > 1,
    });
    if (!r) return;
    if (r.back) {
      history.pop();
      doc = null;
      continue;
    }
    const next = wikiTitle(r.link, cfg.host);
    if (next) {
      history.push(next);
      doc = null;
    } else {
      await openUrl(term, r.link);
    }
  }
}
