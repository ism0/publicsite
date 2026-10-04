'use strict';
// Message areas: Finnish discussions shown like a BBS message base. Read only, no login.
// Checked 2026-10-04: these Lemmy and Mastodon APIs allow reading from any site (CORS),
// including GitHub Pages and a page opened from disk.

const MESSAGE_AREAS = [
  { label: 'Suomi', type: 'lemmy', host: 'sopuli.xyz', community: 'suomi', desc: 'sopuli.xyz/c/suomi (Lemmy)' },
  { label: 'Arkisuomi', type: 'lemmy', host: 'sopuli.xyz', community: 'arkisuomi', desc: 'sopuli.xyz/c/arkisuomi (Lemmy)' },
  { label: 'Amiga', type: 'lemmy', host: 'sopuli.xyz', community: 'amiga', desc: 'sopuli.xyz/c/amiga (Lemmy, englanniksi)' },
  { label: 'Mementomori', type: 'mastodon', host: 'mementomori.social', desc: 'mementomori.social – paikallinen aikajana (Mastodon)' },
];

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lemmy Markdown → simple HTML. Everything is escaped first, so only these tags can appear. */
function mdToHtml(md) {
  const inline = s => esc(s)
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">[kuva: $1]</a>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  return String(md || '').replace(/\r/g, '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    if (block.startsWith('```')) return `<pre>${esc(block.replace(/^```.*\n?|```$/g, ''))}</pre>`;
    if (/^#{1,6}\s/.test(block)) return `<h3>${inline(block.replace(/^#+\s*/, ''))}</h3>`;
    if (lines.every(l => l.startsWith('>'))) {
      return `<blockquote><p>${lines.map(l => inline(l.replace(/^>\s?/, ''))).join('<br>')}</p></blockquote>`;
    }
    if (lines.every(l => /^\s*[-*]\s/.test(l))) {
      return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('');
}

function parseDate(iso) {
  const s = String(iso || '');
  return new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
}

const shortDate = iso => {
  const d = parseDate(iso);
  return Number.isNaN(d.getTime()) ? '?' : `${d.getDate()}.${d.getMonth() + 1}.`;
};

const longDate = iso => {
  const d = parseDate(iso);
  return Number.isNaN(d.getTime()) ? '?' : d.toLocaleString('fi-FI', {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

async function getJson(url) {
  const res = await fetchWithTimeout(url, 20000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---- Lemmy ----

function lemmyAuthor(creator) {
  if (creator.local) return creator.name;
  try { return `${creator.name}@${new URL(creator.actor_id).hostname}`; } catch { return creator.name; }
}

async function lemmyList(area, page) {
  const u = new URL(`https://${area.host}/api/v3/post/list`);
  for (const [k, v] of Object.entries({ community_name: area.community, sort: 'New', limit: '20', page: String(page), type_: 'All' })) {
    u.searchParams.set(k, v);
  }
  const data = await getJson(u);
  const posts = data.posts || [];
  return {
    items: posts
      .filter(p => !p.post.nsfw && !p.post.removed && !p.post.deleted)
      .map(p => ({
        id: p.post.id,
        title: p.post.name,
        author: lemmyAuthor(p.creator),
        date: p.post.published,
        html: (p.post.url ? `<p>Linkki: <a href="${esc(p.post.url)}">${esc(p.post.url)}</a></p>` : '') + mdToHtml(p.post.body),
        link: p.post.ap_id,
        comments: p.counts.comments,
      })),
    next: page + 1,
    end: posts.length === 0,
  };
}

async function lemmyComments(area, postId) {
  const u = new URL(`https://${area.host}/api/v3/comment/list`);
  for (const [k, v] of Object.entries({ post_id: String(postId), sort: 'Old', max_depth: '6', limit: '50', type_: 'All' })) {
    u.searchParams.set(k, v);
  }
  const data = await getJson(u);
  return (data.comments || [])
    .filter(c => !c.comment.removed && !c.comment.deleted)
    .sort((a, b) => (a.comment.path < b.comment.path ? -1 : 1))
    .map(c => ({
      author: lemmyAuthor(c.creator),
      date: c.comment.published,
      html: mdToHtml(c.comment.content),
      depth: Math.max(0, c.comment.path.split('.').length - 2),
    }));
}

// ---- Mastodon ----

function mastoHtml(s) {
  if (s.sensitive || s.spoiler_text) {
    return `<p>[Sisältövaroitus: ${esc(s.spoiler_text || 'arkaluonteinen')}] Viesti piilotettu – avaa alkuperäinen linkistä.</p>`;
  }
  const media = (s.media_attachments || [])
    .filter(m => /^https:\/\//.test(m.url || ''))
    .map(m => `<a href="${esc(m.url)}">[liite: ${esc(m.description || m.type)}]</a>`)
    .join(' ');
  return s.content + (media ? `<p>${media}</p>` : '');
}

function mastoTitle(s) {
  if (s.spoiler_text) return `[CW] ${s.spoiler_text}`;
  const text = (new DOMParser().parseFromString(s.content, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  return text || '(liite)';
}

async function mastoList(area, maxId) {
  const u = new URL(`https://${area.host}/api/v1/timelines/public`);
  u.searchParams.set('local', 'true');
  u.searchParams.set('limit', '20');
  if (maxId) u.searchParams.set('max_id', maxId);
  const data = await getJson(u);
  const list = Array.isArray(data) ? data : [];
  return {
    items: list.filter(s => s.visibility === 'public').map(s => ({
      id: s.id,
      title: mastoTitle(s),
      author: s.account.acct,
      date: s.created_at,
      html: mastoHtml(s),
      link: s.url,
      comments: s.replies_count,
    })),
    next: list.length ? list[list.length - 1].id : maxId,
    end: list.length === 0,
  };
}

async function mastoComments(area, id) {
  const data = await getJson(`https://${area.host}/api/v1/statuses/${encodeURIComponent(id)}/context`);
  const depth = new Map([[id, -1]]);
  return (data.descendants || []).map(s => {
    const d = (depth.get(s.in_reply_to_id) ?? -1) + 1;
    depth.set(s.id, d);
    return { author: s.account.acct, date: s.created_at, html: mastoHtml(s), depth: Math.min(d, 6) };
  });
}

// ---- Screens ----

async function messageDoor(term) {
  for (;;) {
    term.clear();
    menuScreen(term, {
      title: 'Viestialueet',
      items: [
        ...MESSAGE_AREAS.map((a, i) => ({ key: String(i + 1), label: a.label })),
        { key: 'Q', label: 'Päävalikko' },
      ],
      art: { seed: 41, aurora: [10, 2, 14], moon: true },
      info: [
        ['Lähteet', 'sopuli.xyz (Lemmy), mementomori.social'],
        ['Tila', 'vain luku – vastaa avaamalla viesti selaimessa'],
      ],
    });
    term.pipe(' |07Valinta |08» |15');
    const keys = 'Q\x1b' + MESSAGE_AREAS.map((_, i) => String(i + 1)).join('');
    const k = await term.readKey(keys);
    term.write(k === '\x1b' ? '\n' : k + '\n');
    if (k === 'Q' || k === '\x1b') return;
    await messageList(term, MESSAGE_AREAS[Number(k) - 1]);
  }
}

async function messageList(term, area) {
  const items = [];
  let cursor = area.type === 'lemmy' ? 1 : null;
  let end = false;

  const more = async () => {
    const r = await loading(term, () => (area.type === 'lemmy' ? lemmyList(area, cursor) : mastoList(area, cursor)), 'Haetaan viestejä');
    if (!r) return false;
    items.push(...r.items);
    cursor = r.next;
    end = r.end;
    return true;
  };
  if (!(await more())) return;

  let top = 0;
  for (;;) {
    header(term, `Viestialue: ${area.label}`, area.desc);
    const per = Math.max(5, term.rows - 6);
    const titleW = Math.max(10, term.cols - 30);
    if (!items.length) term.pipeln(' |08(ei viestejä)');
    items.slice(top, top + per).forEach((m, i) => {
      const n = String(top + i + 1).padStart(3);
      term.pipeln(` |08[|15${n}|08] |03${shortDate(m.date).padEnd(6)} |11${noPipes(fit(m.author, 12))} |07${noPipes(fit(m.title, titleW))} |08${m.comments ? `(${m.comments})` : ''}`);
    });
    const last = Math.min(items.length, top + per);
    term.pipe(`|08-- |07Viestit ${top + 1}–${last}/${items.length}${end ? '' : '+'} |08-- |15nro|07=lue |15Enter|07=lisää |15E|07=edell |15Q|07=paluu |08» |15`);

    const input = await term.readLine(4);
    if (input === null) return;
    const v = input.trim().toUpperCase();
    if (v === 'Q') return;
    if (v === 'E') {
      top = Math.max(0, top - per);
    } else if (v === '') {
      if (top + per < items.length) top += per;
      else if (!end && (await more()) && top + per < items.length) top += per;
    } else if (/^\d+$/.test(v)) {
      const n = Number(v);
      if (n >= 1 && n <= items.length) await readMessage(term, area, items, n - 1);
    }
  }
}

async function readMessage(term, area, items, index) {
  const m = items[index];
  let comments = [];
  if (m.comments) {
    comments = (await loading(term, () => (area.type === 'lemmy' ? lemmyComments(area, m.id) : mastoComments(area, m.id)), 'Haetaan kommentteja')) || [];
  }

  // One HTML document so that links in the message and comments are numbered together.
  const quote = (depth, inner) => '<blockquote>'.repeat(depth) + inner + '</blockquote>'.repeat(depth);
  const html = m.html
    + (comments.length ? `<hr><h3>Kommentit (${comments.length})</h3>` : '')
    + comments.map(c => quote(Math.max(1, c.depth + 1),
      `<p><b>${esc(c.author)}</b> · ${esc(longDate(c.date))}</p>${c.html}`)).join('')
    + `<hr><p>Alkuperäinen (vastaa tätä kautta): <a href="${esc(m.link)}">${esc(m.link)}</a></p>`;
  const doc = htmlToText(html, `https://${area.host}/`, term.cols);

  const field = (label, value, color = 15) => [[3, `${label.padEnd(10, '.')}: `], [color, String(value)]];
  const head = [
    field('Alue', `${area.label} (${area.host})`, 11),
    field('Viesti', `${index + 1}/${items.length}`),
    field('Lähettäjä', m.author, 14),
    ...wrap(String(m.title).split(/\s+/).map((t, i) => ({ t, c: 15, glue: false, i })), term.cols - 12)
      .map((segs, i) => (i === 0 ? [[3, 'Aihe......: '], ...segs] : [[3, ' '.repeat(12)], ...segs])),
    field('Päiväys', longDate(m.date)),
    [[9, '─'.repeat(term.cols)]],
  ];

  for (;;) {
    const r = await page(term, {
      title: `${area.label} » viesti ${index + 1}/${items.length}`,
      lines: [...head, ...doc.lines],
      links: doc.links,
    });
    if (!r) return;
    if (r.link) await openUrl(term, r.link);
  }
}
