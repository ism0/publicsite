'use strict';
// Shared screen elements for the doors.

/** Screen header: block strip, "-=< Title >=-" and an optional subtitle. */
function header(term, title, subtitle = '') {
  term.clear();
  const cv = new Canvas(term.cols, subtitle ? 3 : 2);
  decoBar(cv, 0, titleSeed(title));
  titleLine(cv, 1, title);
  if (subtitle) cv.text(0, 2, center(subtitle, term.cols), 3, 0);
  cv.render(term);
}

async function showError(term, message) {
  term.pipeln('');
  term.pipeln(`|12*** ${noPipes(message)} ***|07`);
  await term.pause();
}

/** Shows a "connecting" message while fn runs. Returns null on error. */
async function loading(term, fn, text = 'Yhdistetään') {
  term.pipeln('');
  term.pipe(`|08${text}...|07`);
  try {
    const result = await fn();
    term.write('\n');
    return result;
  } catch (e) {
    const reason = e && e.name === 'AbortError' ? 'aikakatkaisu' : (e && e.message) || 'tuntematon virhe';
    await showError(term, `YHTEYSVIRHE: ${reason}`);
    return null;
  }
}

/** Menu item: [K] Name   description */
function item(term, key, name, desc = '', nameWidth = 18) {
  const d = desc && term.cols >= 60 ? `|03${noPipes(desc)}` : '';
  term.pipeln(` |08[|14${key}|08] |15${noPipes(name).padEnd(nameWidth)}${d}|07`);
}
