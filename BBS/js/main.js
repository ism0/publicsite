'use strict';
// Arctic Express BBS – login, main menu and status bar.

const BBS_NAME = 'Arctic Express BBS';
const LOGO_TEXT = 'ARCTIC EXPRESS';
const SHORT_NAME = 'ARCTIC';
const SESSION_MINUTES = 60;

// Saved only in the visitor's own browser.
const store = {
  get(key) { try { return localStorage.getItem('arctic.' + key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem('arctic.' + key, value); } catch { /* storage blocked */ } },
};

const term = new Terminal(document.getElementById('screen'), document.getElementById('kbd'));
const statusEl = document.getElementById('status');
let handle = 'Vieras';
let sessionStart = Date.now();

const minutesLeft = () => Math.max(0, SESSION_MINUTES - Math.floor((Date.now() - sessionStart) / 60000));

function updateStatus() {
  statusEl.textContent = `${BBS_NAME} │ ${handle} │ Aikaa jäljellä: ${minutesLeft()} min │ 9600 bps`;
}

async function connect() {
  term.clear();
  await term.slowPipe('|07ATZ\n|10OK\n|07ATDT ARCTIC\n', 60);
  await term.sleep(700);
  await term.slowPipe('|08RINGING...\n', 60);
  await term.sleep(900);
  await term.slowPipe('|14CONNECT 9600/ARQ/V32\n', 120);
  await term.sleep(400);

  // Welcome screen: logo, "BBS" title and an arctic landscape with a train
  term.clear();
  const w = term.cols;
  const cv = new Canvas(w, 18);
  decoBar(cv, 0, 1977);
  const y = 1 + drawLogo(cv, 1);
  titleLine(cv, y, 'B · B · S');
  cv.pixels(0, y + 1, scene(w, 16, { seed: 5, train: true }));
  decoBar(cv, y + 9, 2026);
  await cv.animate(term, 45);
  term.pipeln(`|03${center('Suomalainen BBS selaimessa – est. 2026', w)}`);
  term.pipeln(`|08${center('Paina mitä tahansa ohittaaksesi animaatiot', w)}`);
}

async function login() {
  const saved = store.get('handle');
  term.pipe(` |07Nimimerkki${saved ? ` |08(Enter = ${noPipes(saved)})` : ' |08(Enter = Vieras)'}|07: |15`);
  const input = ((await term.readLine(20)) || '').trim().replace(/[\x00-\x1f]/g, '');
  handle = input || saved || 'Vieras';
  store.set('handle', handle);

  const last = store.get('lastVisit');
  store.set('lastVisit', new Date().toISOString());
  sessionStart = Date.now();
  updateStatus();

  term.pipeln(` |10Tervetuloa, |15${noPipes(handle)}|10!`);
  if (last && !Number.isNaN(Date.parse(last))) {
    term.pipeln(` |07Edellinen käynti: |15${new Date(last).toLocaleString('fi-FI')}`);
  }
  term.pipeln(' ' + flagBulletin());
  await term.pause();
}

const MAIN_ITEMS = [
  { key: 'T', label: 'Tietosanakirja' },
  { key: 'K', label: 'Tekstitiedostot' },
  { key: 'W', label: 'Webbiselain' },
  { key: 'A', label: 'Aikakone' },
  { key: 'V', label: 'Viestialueet' },
  { key: 'F', label: 'Tiedostoalueet' },
  { key: 'P', label: 'Ovipelit' },
  { key: 'C', label: 'Chat (IRC)' },
  { key: 'L', label: 'Liputuspäivät' },
  { key: 'I', label: 'Tietoja' },
  { key: 'G', label: 'Lopeta' },
];

async function mainMenu() {
  for (;;) {
    term.clear();
    menuScreen(term, {
      title: 'Päävalikko',
      items: MAIN_ITEMS,
      art: { seed: 3, bear: true },
      info: [
        ['Käyttäjä', handle],
        ['Aikaa', `${minutesLeft()} min`],
        ['Tiedote', flagBulletin().replace(/\|\d\d/g, '')],
      ],
    });
    term.pipe(` |07${noPipes(handle)}@${SHORT_NAME} |08» |15`);

    const k = await term.readKey(MAIN_ITEMS.map(i => i.key).join(''));
    term.write(k + '\n');
    updateStatus();
    if (k === 'T') await wikiDoor(term, WIKIPEDIA);
    else if (k === 'K') await wikiDoor(term, WIKISOURCE);
    else if (k === 'W') await webDoor(term);
    else if (k === 'A') await waybackDoor(term);
    else if (k === 'V') await messageDoor(term);
    else if (k === 'F') await filesDoor(term);
    else if (k === 'P') await gamesDoor(term);
    else if (k === 'C') await chatDoor(term, handle);
    else if (k === 'L') await flagDoor(term);
    else if (k === 'I') await info();
    else if (k === 'G') return;
    updateStatus();
  }
}

async function info() {
  header(term, 'Tietoja', BBS_NAME);
  term.pipeln('');
  term.pipeln('|07Tämä BBS on staattinen verkkosivu. Ei palvelinta, ei modeemia.');
  term.pipeln('');
  term.pipeln('|15Miten Internet toimii täällä?');
  term.pipeln('|07Selaimesi hakee sisällön suoraan lähteestä. Selain sallii sen vain,');
  term.pipeln('|07jos sivusto itse antaa luvan (CORS). Wikipedia ja Wikisource antavat,');
  term.pipeln('|07joten ne näkyvät tekstinä. Muut sivut avataan ikkunaan tai uuteen');
  term.pipeln('|07välilehteen.');
  term.pipeln('');
  term.pipeln('|15Yksityisyys');
  term.pipeln('|07Nimimerkki ja edellinen käyntiaika tallentuvat vain omaan selaimeesi.');
  term.pipeln('|07Kun luet artikkelia, selaimesi ottaa yhteyden kyseiseen palveluun');
  term.pipeln('|07(esim. fi.wikipedia.org), joka näkee IP-osoitteesi kuten tavallisessa');
  term.pipeln('|07selailussa. Tämä BBS ei kerää tietoja eikä käytä evästeitä.');
  term.pipeln('|07IRC-chat on julkinen: nimimerkkisi ja viestisi näkyvät kanavalla, ja');
  term.pipeln('|07IRC-palvelin näkee IP-osoitteesi. Viestialueet luetaan suoraan');
  term.pipeln('|07sopuli.xyz- ja mementomori.social-palveluista (vain luku).');
  term.pipeln('');
  await term.pause();
}

async function goodbye() {
  term.clear();
  const cv = new Canvas(term.cols, 9);
  decoBar(cv, 0, 404);
  cv.pixels(0, 1, scene(term.cols, 14, { seed: 9, aurora: [13, 5, 12], moon: true }));
  cv.render(term);
  await term.slowPipe(`\n|07Kiitos käynnistä, |15${noPipes(handle)}|07! Tervetuloa uudelleen.\n\n`);
  await term.sleep(600);
  await term.slowPipe('|07+++\n', 30);
  await term.sleep(500);
  await term.slowPipe('|12NO CARRIER\n\n', 60);
  await term.pause('Paina näppäintä soittaaksesi uudelleen');
}

async function run() {
  term.focus();
  updateStatus();
  setInterval(updateStatus, 30000);
  for (;;) {
    await connect();
    await login();
    await mainMenu();
    await goodbye();
  }
}

run();
