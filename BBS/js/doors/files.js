'use strict';
// MBnet file areas: original MBnet programs (MikroBitti CD collections 1994–1996 and
// MBnet Apaja) from the Internet Archive. The file lists come from archive.org's
// metadata API, which allows reading from any site (CORS). Downloads open in a new tab.

const FILE_AREAS = [
  { label: "MBnet '94/'95", id: 'mbcd9495', desc: "MikroBitti '94/'95 – MBnet-ohjelmat" },
  { label: 'MBnet 1996', id: 'mbnet1996', desc: 'MikroBitti 1996 – MBnet-ohjelmat' },
  { label: 'Oudot pelit', id: 'mbnet_oudot', desc: 'MBnet Apaja – DOS – Oudot/pilapelit' },
];

const kb = bytes => `${Math.max(1, Math.round(Number(bytes || 0) / 1024))}k`;

async function filesDoor(term) {
  for (;;) {
    term.clear();
    menuScreen(term, {
      title: 'Tiedostoalueet',
      items: [
        ...FILE_AREAS.map((a, i) => ({ key: String(i + 1), label: a.label })),
        { key: 'Q', label: 'Päävalikko' },
      ],
      art: { seed: 61, train: true },
      info: [
        ...FILE_AREAS.map((a, i) => [String(i + 1), a.desc]),
        ['Lähde', 'Internet Archive (archive.org)'],
      ],
    });
    term.pipe(' |07Valinta |08» |15');
    const keys = 'Q\x1b' + FILE_AREAS.map((_, i) => String(i + 1)).join('');
    const k = await term.readKey(keys);
    term.write(k === '\x1b' ? '\n' : k + '\n');
    if (k === 'Q' || k === '\x1b') return;
    await fileList(term, FILE_AREAS[Number(k) - 1]);
  }
}

async function fileList(term, area) {
  const data = await loading(term, () => getJson(`https://archive.org/metadata/${encodeURIComponent(area.id)}`), 'Haetaan tiedostolistaa');
  if (!data) return;
  const files = (data.files || [])
    .filter(f => f.source === 'original' && !/(_meta\.|_files\.xml|\.sqlite|__ia_thumb|_reviews)/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  let top = 0;
  for (;;) {
    header(term, `Tiedostoalue: ${area.label}`, area.desc);
    const per = Math.max(5, term.rows - 6);
    const cols = term.cols >= 78 ? 2 : 1;
    const colW = Math.floor((term.cols - 1) / cols);
    const shown = files.slice(top, top + per * cols);
    for (let r = 0; r < per; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const i = c * per + r;
        const f = shown[i];
        if (!f) continue;
        // Cell width is exactly colW: "[nnnn] " + name + " " + size + " "
        const n = String(top + i + 1).padStart(4);
        line += `|08[|15${n}|08] |11${noPipes(fit(f.name, colW - 15))} |03${kb(f.size).padStart(6)} `;
      }
      if (line) term.pipeln(' ' + line);
    }
    const last = Math.min(files.length, top + per * cols);
    term.pipe(`|08-- |07Tiedostot ${top + 1}–${last}/${files.length} |08-- |15nro|07=lataa |15Enter|07=seur |15E|07=edell |15Q|07=paluu |08» |15`);

    const input = await term.readLine(5);
    if (input === null) return;
    const v = input.trim().toUpperCase();
    if (v === 'Q') return;
    if (v === 'E') top = Math.max(0, top - per * cols);
    else if (v === '') {
      if (top + per * cols < files.length) top += per * cols;
      else return;
    } else if (/^\d+$/.test(v)) {
      const n = Number(v);
      if (n >= 1 && n <= files.length) await downloadFile(term, area, files[n - 1]);
    }
  }
}

async function downloadFile(term, area, file) {
  const url = `https://archive.org/download/${encodeURIComponent(area.id)}/${encodeURIComponent(file.name)}`;
  term.pipeln('');
  term.pipeln(`|07Tiedosto: |15${noPipes(file.name)} |08(${kb(file.size)})`);
  if (/\.zip$/i.test(file.name)) {
    item(term, 'S', 'Sisältö', 'näytä ZIP-paketin tiedostot');
  }
  item(term, 'L', 'Lataa', 'avaa latauksen uuteen välilehteen');
  item(term, 'Q', 'Paluu');
  term.pipe('\n |07Valinta |08» |15');
  const k = await term.readKey('SLQ\x1b');
  term.write('\n');
  if (k === 'L') window.open(url, '_blank', 'noopener,noreferrer');
  else if (k === 'S' && /\.zip$/i.test(file.name)) window.open(url + '/', '_blank', 'noopener,noreferrer');
}
