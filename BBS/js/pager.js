'use strict';
// Shows long text one screen at a time: "-- Sivu 1/5 --".

/**
 * @returns {Promise<{link: string} | {back: true} | null>}  null = user quit
 */
async function page(term, { title, lines, links = [], canBack = false }) {
  let p = 0;
  for (;;) {
    const per = Math.max(5, term.rows - 3);
    const pages = Math.max(1, Math.ceil(lines.length / per));
    p = Math.min(p, pages - 1);

    term.clear();
    term.pipeln(`|17|15${noPipes(fit(' ' + title, term.cols))}|16|07`);
    for (const line of lines.slice(p * per, (p + 1) * per)) term.line(line);

    const help = [
      '|15Enter|07=seur',
      p > 0 ? '|15E|07=edell' : '',
      links.length ? '|15nro|07=linkki' : '',
      canBack ? '|15T|07=takaisin' : '',
      '|15Q|07=lopeta',
    ].filter(Boolean).join(' ');
    term.pipe(`|08-- |07Sivu |15${p + 1}|07/|15${pages} |08-- ${help} |08» |15`);

    const input = await term.readLine(6);
    if (input === null) return null;
    const v = input.trim().toUpperCase();

    if (v === '') {
      if (p < pages - 1) p++;
      else return null;
    } else if (v === 'E' || v === '-') {
      p = Math.max(0, p - 1);
    } else if (v === 'Q') {
      return null;
    } else if (v === 'T' && canBack) {
      return { back: true };
    } else if (/^\d+$/.test(v)) {
      const n = Number(v);
      if (n >= 1 && n <= links.length) return { link: links[n - 1] };
    }
  }
}
