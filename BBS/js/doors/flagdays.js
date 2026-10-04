'use strict';
// Finnish flag days (liputuspäivät). Computed locally – no network needed.
// Source: the Ministry of the Interior's list of official and established flag days.
// Election days and other one-off flag days are not included.

const FIXED = [
  [2, 5, 'J. L. Runebergin päivä'],
  [2, 6, 'Saamelaisten kansallispäivä'],
  [2, 28, 'Kalevalan päivä, suomalaisen kulttuurin päivä'],
  [3, 19, 'Minna Canthin päivä, tasa-arvon päivä'],
  [4, 9, 'Mikael Agricolan päivä, suomen kielen päivä'],
  [4, 27, 'Kansallinen veteraanipäivä'],
  [5, 1, 'Vappu, suomalaisen työn päivä'],
  [5, 9, 'Eurooppa-päivä'],
  [5, 12, 'J. V. Snellmanin päivä, suomalaisuuden päivä'],
  [6, 4, 'Puolustusvoimain lippujuhlan päivä'],
  [7, 6, 'Eino Leinon päivä, runon ja suven päivä'],
  [10, 10, 'Aleksis Kiven päivä, suomalaisen kirjallisuuden päivä'],
  [10, 24, 'YK:n päivä'],
  [11, 6, 'Ruotsalaisuuden päivä, Kustaa Aadolfin päivä'],
  [12, 6, 'Itsenäisyyspäivä'],
  [12, 8, 'Jean Sibeliuksen päivä, suomalaisen musiikin päivä'],
];

/** The n-th Sunday of the month (month 1–12). */
function nthSunday(year, month, n) {
  const first = new Date(year, month - 1, 1);
  const offset = (7 - first.getDay()) % 7;
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7);
}

/** Midsummer Day: the Saturday between 20 and 26 June. */
function midsummer(year) {
  const d = new Date(year, 5, 20);
  d.setDate(20 + ((6 - d.getDay() + 7) % 7));
  return d;
}

function flagDays(year) {
  const days = FIXED.map(([m, d, name]) => ({ date: new Date(year, m - 1, d), name }));
  days.push(
    { date: nthSunday(year, 5, 2), name: 'Äitienpäivä' },
    { date: nthSunday(year, 5, 3), name: 'Kaatuneitten muistopäivä' },
    { date: midsummer(year), name: 'Juhannuspäivä, Suomen lipun päivä' },
    { date: nthSunday(year, 11, 2), name: 'Isänpäivä' },
  );
  return days.sort((a, b) => a.date - b.date);
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const fmt = d => `${d.getDate()}.${d.getMonth() + 1}.`;

/** Bulletin for the login screen: today's or the next flag day. */
function flagBulletin(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const all = [...flagDays(today.getFullYear()), ...flagDays(today.getFullYear() + 1)];
  const hit = all.find(f => sameDay(f.date, today));
  if (hit) return `|14Tänään liputetaan: |15${hit.name}`;
  const next = all.find(f => f.date > today);
  const daysLeft = Math.round((next.date - today) / 86400000);
  return `|07Seuraava liputuspäivä: |15${fmt(next.date)} ${next.name} |08(${daysLeft} pv)`;
}

async function flagDoor(term) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = flagDays(today.getFullYear());
  const nextIdx = days.findIndex(f => f.date >= today);

  header(term, `LIPUTUSPÄIVÄT ${today.getFullYear()}`, 'Tiedotteet');
  days.forEach((f, i) => {
    const color = sameDay(f.date, today) ? '|14' : i === nextIdx ? '|11' : f.date < today ? '|08' : '|07';
    const mark = sameDay(f.date, today) ? ' ◄ TÄNÄÄN' : i === nextIdx ? ' ◄ seuraava' : '';
    term.pipeln(` ${color}${fmt(f.date).padStart(6)}  ${f.name}${mark}`);
  });
  term.pipeln('');
  await term.pause();
}
