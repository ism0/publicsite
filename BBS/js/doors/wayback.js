'use strict';
// Time machine: old Finnish 90s sites from the Internet Archive's Wayback Machine.
// Archived pages open in the frame window (web.archive.org allows embedding).

const OLD_SITES = [
  ['MBnet', 'www.mbnet.fi', 1997, 'MikroBitin BBS-verkko'],
  ['Kolumbus', 'www.kolumbus.fi', 1998, 'Kotisivujen koti'],
  ['Saunalahti', 'www.saunalahti.fi', 1997, 'Internet-operaattori'],
  ['YLE', 'www.yle.fi', 1997, 'Yleisradio'],
  ['MTV3', 'www.mtv3.fi', 1998, 'Kanava'],
  ['Iltalehti', 'www.iltalehti.fi', 1998, 'Iltapäivälehti'],
  ['MikroBitti', 'www.mikrobitti.fi', 1998, 'Tietokonelehti'],
  ['Assembly', 'www.assembly.org', 1998, 'Demoparty'],
  ['Muropaketti', 'www.muropaketti.com', 2001, 'Ennen MuroBBS:ää'],
];

async function waybackDoor(term) {
  for (;;) {
    term.clear();
    menuScreen(term, {
      title: 'Aikakone',
      items: [
        ...OLD_SITES.map(([name, , year], i) => ({ key: String(i + 1), label: `${name} ${year}` })),
        { key: 'U', label: 'Oma osoite' },
        { key: 'Q', label: 'Päävalikko' },
      ],
      art: { seed: 21, train: true, moon: false },
      info: [
        ['Arkisto', 'Internet Archive – Wayback Machine'],
        ['Aika', '90-luvun Suomi-sivut'],
      ],
    });
    term.pipe(' |07Valinta |08» |15');

    const keys = 'UQ\x1b' + OLD_SITES.map((_, i) => String(i + 1)).join('');
    const k = await term.readKey(keys);
    term.write(k === '\x1b' ? '\n' : k + '\n');

    if (k === 'Q' || k === '\x1b') return;
    if (k === 'U') {
      term.pipe('\n |07Osoite |08» |15');
      const host = await term.readLine(100);
      if (!host || !host.trim()) continue;
      term.pipe(' |07Vuosi |08(1996–2010) » |15');
      const year = Number(await term.readLine(4));
      await visit(term, host.trim(), year >= 1996 && year <= 2010 ? year : 1999);
    } else {
      const [, host, year] = OLD_SITES[Number(k) - 1];
      await visit(term, host, year);
    }
  }
}

async function visit(term, host, year) {
  // The Wayback Machine redirects /web/<year>/<address> to the nearest snapshot itself.
  // (The availability API would allow showing the date first, but it is rate-limited
  // and its error responses have no CORS header, so it is not used.)
  const target = safeUrl(host);
  if (!target) {
    await showError(term, 'Virheellinen osoite');
    return;
  }
  const url = `https://web.archive.org/web/${year}/${target.href.replace(/^https:/, 'http:')}`;
  term.pipeln(`|10Aikakone: |15${noPipes(target.host)} |07– |14${year}`);
  term.pipeln('|08Arkisto valitsee lähimmän tallenteen. Päiväys näkyy arkiston yläpalkissa.');
  term.pipeln('');
  item(term, 'I', 'Avaa ikkunaan', 'oletus (Enter)');
  item(term, 'O', 'Uusi välilehti');
  item(term, 'Q', 'Paluu');
  term.pipe('\n |07Valinta |08» |15');
  const k = await term.readKey('IOQ\n\x1b');
  term.write('\n');
  if (k === 'I' || k === '\n') await frameWindow(term, url, `${target.host} ${year}`);
  else if (k === 'O') window.open(url, '_blank', 'noopener,noreferrer');
}
