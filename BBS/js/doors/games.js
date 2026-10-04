'use strict';
// Door games. The built-in doors run in this site's own DOS emulator (play.html, js-dos)
// and start automatically. Search results open in the Internet Archive's emulator
// (archive.org/embed allows framing, checked 2026-10-04). No account or password needed.
// Game state is not saved between visits.

const DOOR_GAMES = [
  { label: 'LORD', play: 'lord', desc: 'Legend of the Red Dragon (1992)' },
  { label: 'LORD 2', play: 'lord2', desc: 'LORD 2: New World' },
  { label: 'MBnet Simulaattori', play: 'mbsim', desc: 'Suomalainen MBnet-simulaatio (1997)' },
];

async function gamesDoor(term) {
  for (;;) {
    term.clear();
    menuScreen(term, {
      title: 'Ovipelit',
      items: [
        ...DOOR_GAMES.map((g, i) => ({ key: String(i + 1), label: g.label })),
        { key: 'H', label: 'Hae DOS-peliä' },
        { key: 'Q', label: 'Päävalikko' },
      ],
      art: { seed: 51, aurora: [12, 4, 14], moon: true },
      info: [
        ...DOOR_GAMES.map((g, i) => [String(i + 1), g.desc]),
        ['Emulaattori', 'DOSBox selaimessa (js-dos)'],
      ],
    });
    term.pipe(' |07Valinta |08» |15');
    const keys = 'HQ\x1b' + DOOR_GAMES.map((_, i) => String(i + 1)).join('');
    const k = await term.readKey(keys);
    term.write(k === '\x1b' ? '\n' : k + '\n');
    if (k === 'Q' || k === '\x1b') return;
    if (k === 'H') await searchGames(term);
    else await openDoor(term, DOOR_GAMES[Number(k) - 1]);
  }
}

/** Built-in door: starts automatically in play.html. */
async function openDoor(term, game) {
  header(term, 'Ovi avautuu', game.label);
  term.pipeln('');
  term.pipeln(' |07Peli latautuu ja käynnistyy itsestään ikkunaan.');
  term.pipeln(' |07Peli kysyy vain nimeä – salasanaa ei tarvita.');
  term.pipeln('');
  term.pipeln(' |14Huom: |07pelitilanne ei tallennu. Sulje ikkuna |15[X] Sulje|07 -painikkeesta.');
  term.pipeln('');
  await term.pause('Paina näppäintä avataksesi oven');
  await frameWindow(term, `play.html?g=${encodeURIComponent(game.play)}`, game.label, { local: true });
}

/** Search result: Internet Archive's own emulator (started by hand). */
async function launchGame(term, id, title) {
  header(term, 'Ovi avautuu', title);
  term.pipeln('');
  term.pipeln(' |07Peli avautuu Internet Archiven DOS-emulaattoriin ikkunaan.');
  term.pipeln(' |07Käynnistä peli emulaattorin |15►|07-painikkeesta ja klikkaa peliruutua.');
  term.pipeln('');
  await term.pause('Paina näppäintä avataksesi oven');
  await frameWindow(term, `https://archive.org/embed/${encodeURIComponent(id)}`, title);
}

async function searchGames(term) {
  term.pipe('\n |07Pelin nimi |08» |15');
  const input = await term.readLine(40);
  // Only letters, numbers and spaces go into the search query.
  const words = (input || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  if (!words) return;

  const u = new URL('https://archive.org/advancedsearch.php');
  u.searchParams.set('q', `collection:softwarelibrary_msdos AND title:(${words})`);
  for (const f of ['identifier', 'title', 'year']) u.searchParams.append('fl[]', f);
  u.searchParams.set('sort[]', 'downloads desc');
  u.searchParams.set('rows', String(Math.max(5, Math.min(18, term.rows - 8))));
  u.searchParams.set('output', 'json');

  const data = await loading(term, () => getJson(u), 'Haetaan arkistosta');
  const docs = (data && data.response && data.response.docs) || [];
  if (!data) return;
  if (!docs.length) {
    await showError(term, 'Ei osumia');
    return;
  }
  header(term, 'Ovipelit', `Haku: ${words}`);
  docs.forEach((d, i) => {
    const year = d.year ? ` (${d.year})` : '';
    term.pipeln(` |08[|15${String(i + 1).padStart(2)}|08] |07${noPipes(fit(String(d.title) + year, term.cols - 7))}`);
  });
  term.pipe('\n |07Numero |08(|07Enter = paluu|08) » |15');
  const n = Number((await term.readLine(3)) || 0);
  if (n >= 1 && n <= docs.length) await launchGame(term, docs[n - 1].identifier, String(docs[n - 1].title));
}
