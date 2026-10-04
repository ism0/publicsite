'use strict';
// ANSI graphics: half-block pixel art (▀ = upper pixel in the foreground colour,
// lower pixel in the background colour), a character buffer for composing
// screens, and the shared menu layout.

// Colours by letter for sprites. '.' = transparent.
const PAL = {
  K: 0, b: 1, g: 2, c: 3, r: 4, m: 5, y: 6, L: 7,
  D: 8, B: 9, G: 10, C: 11, R: 12, M: 13, Y: 14, W: 15,
};

// 4×5 block letters for the logo
const FONT = {
  A: [' ██ ', '█  █', '████', '█  █', '█  █'],
  B: ['███ ', '█  █', '███ ', '█  █', '███ '],
  C: [' ███', '█   ', '█   ', '█   ', ' ███'],
  E: ['████', '█   ', '███ ', '█   ', '████'],
  I: ['███', ' █ ', ' █ ', ' █ ', '███'],
  P: ['███ ', '█  █', '███ ', '█   ', '█   '],
  R: ['███ ', '█  █', '███ ', '█ █ ', '█  █'],
  S: [' ███', '█   ', ' ██ ', '   █', '███ '],
  T: ['████', ' ██ ', ' ██ ', ' ██ ', ' ██ '],
  X: ['█  █', '█  █', ' ██ ', '█  █', '█  █'],
  ' ': ['  ', '  ', '  ', '  ', '  '],
};

const TRAIN = [
  '..LL....................................................',
  '.LWWL...LLL.............................................',
  '..LL...LWWWL............................................',
  '..DD....LL..............................................',
  '..DD.........RRRRRRRRR.....bbbbbbbbbbbbbb...bbbbbbbbbbbbbb',
  'YRRRRRRRRRRR.RYY.RYY.R....BYYBBYYBBYYBBB...BYYBBYYBBYYBBB',
  'RRRRRRRRRRRRRRYY.RYY.R....BBBBBBBBBBBBBB...BBBBBBBBBBBBBB',
  'RRRRRRRRRRRRRRRRRRRRRRDDDDBBBBBBBBBBBBBBDDDBBBBBBBBBBBBBB',
  'DDDDDDDDDDDDDDDDDDDDDD...DDDDDDDDDDDDDDD...DDDDDDDDDDDDDD',
  '.DD..DD..DD.....DD..DD.....DD......DD.......DD......DD...',
];

const BEAR = [
  '..WW...............',
  '.WWWW..WWWWWWWW....',
  'KWWKWWWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWWWWW.',
  '...WWWWWWWWWWWWWWWW',
  '....LWWWWWWWWWWWWW.',
  '....WW.WW....WW.WW.',
  '....WW.WW....WW.WW.',
];

function sprite(rows) {
  return rows.map(r => [...r].map(ch => (ch in PAL ? PAL[ch] : -1)));
}

/** Small seeded random number generator, so the pictures are the same every time. */
function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The logo as pixels: gradient from white to ice blue. */
function logoPixels(text) {
  const letters = [...text].map(ch => FONT[ch] || FONT[' ']);
  const rows = Array.from({ length: 5 }, (_, r) => letters.map(l => l[r]).join(' '));
  const w = rows[0].length + 1;
  const px = Array.from({ length: 12 }, () => Array(w).fill(-1));
  const GRAD = [15, 15, 15, 11, 11, 11, 3, 9, 9, 1];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < rows[0].length; x++) if (rows[y >> 1][x] === '█') px[y][x] = GRAD[y];
  }
  return px;
}

/**
 * Arctic landscape, w × h pixels.
 * opts: seed, aurora (three colours), moon, train, bear
 */
function scene(w, h, opts = {}) {
  const { seed = 1, aurora = [10, 2, 11], moon = true, train = false, bear = false } = opts;
  const rnd = rng(seed);
  const px = Array.from({ length: h }, () => Array(w).fill(0));
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < w && y < h) px[y][x] = c;
  };

  // Stars
  for (let i = 0; i < (w * h) / 22; i++) {
    set(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.6), rnd() < 0.35 ? 15 : 8);
  }

  // Northern lights: a wavy curtain with rays hanging down
  const p = rnd() * 6;
  const f = 0.12 + rnd() * 0.08;
  for (let x = 0; x < w; x++) {
    const yc = Math.round(h * 0.2 + Math.sin(x * f + p) * h * 0.09 + Math.sin(x * f * 2.7 + p * 2) * h * 0.04);
    const len = 3 + Math.round(2 + 2 * Math.sin(x * 0.37 + p));
    for (let d = 0; d < len; d++) {
      const c = d === 0 ? aurora[2] : d < 2 ? aurora[0] : (x + yc + d) % 2 ? aurora[0] : aurora[1];
      set(x, yc + d, c);
    }
    if (x % 3 === 0 && rnd() < 0.6) {
      for (let d = len; d < len + 2 + Math.floor(rnd() * 3); d++) if ((d + x) % 2) set(x, yc + d, aurora[1]);
    }
  }

  // Moon (crescent)
  if (moon) {
    const cx = w - 6;
    const cy = 3.5;
    for (let y = 0; y < 8; y++) {
      for (let x = w - 10; x < w; x++) {
        const inMoon = (x - cx) ** 2 + (y - cy) ** 2 <= 7.5;
        const inBite = (x - cx + 1.6) ** 2 + (y - cy + 0.8) ** 2 <= 6;
        if (inMoon && !inBite) set(x, y, (x - cx) ** 2 + (y - cy) ** 2 > 4 ? 14 : 15);
      }
    }
  }

  // Mountains with snowy peaks
  const groundY = h - 3;
  const p2 = rnd() * 6;
  for (let x = 0; x < w; x++) {
    const top = Math.round(h * 0.55 + Math.sin(x * 0.19 + p2) * h * 0.13 + Math.sin(x * 0.53 + p2 * 3) * h * 0.06);
    for (let y = top; y < groundY; y++) {
      const d = y - top;
      let c;
      if (d < 1) c = 15;
      else if (d < 3) c = (x + y) % 2 ? 15 : 7;
      else if (d < 5) c = (x + y) % 2 ? 7 : 8;
      else c = (x + y) % 3 ? 1 : 8;
      set(x, y, c);
    }
  }

  // Ground: sea with an ice floe when there is a bear, otherwise snowfield (and railway)
  for (let x = 0; x < w; x++) {
    if (bear) {
      set(x, groundY, (x + 1) % 4 ? 1 : 9);
      set(x, groundY + 1, x % 3 ? 1 : 9);
      set(x, groundY + 2, (x + 2) % 5 ? 1 : 3);
    } else {
      set(x, groundY, train ? (x % 3 ? 8 : 6) : 15);
      set(x, groundY + 1, (x % 2) ? 15 : 7);
      set(x, groundY + 2, (x % 4) ? 7 : 15);
    }
  }

  const draw = (spr, ox, oy, outline = -1) => {
    if (outline >= 0) {
      spr.forEach((row, y) => row.forEach((c, x) => {
        if (c < 0) return;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = spr[y + dy] && spr[y + dy][x + dx];
          if (n === undefined || n < 0) set(ox + x + dx, oy + y + dy, outline);
        }
      }));
    }
    spr.forEach((row, y) => row.forEach((c, x) => { if (c >= 0) set(ox + x, oy + y, c); }));
  };
  if (train) {
    const t = sprite(TRAIN);
    draw(t, Math.max(1, Math.floor(w * 0.08)), groundY - t.length);
  }
  if (bear) {
    const b = sprite(BEAR);
    const bx = w - b[0].length - 3;
    for (let x = bx - 2; x < bx + b[0].length + 2; x++) {
      set(x, groundY + 1, 15);
      set(x, groundY + 2, 11);
    }
    draw(b, bx, groundY + 1 - b.length, 8);
  }
  return px;
}

/** Character buffer: screens are composed here and then drawn line by line. */
class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => [' ', 7, 0]));
  }

  put(x, y, ch, fg, bg) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y][x] = [ch, fg, bg];
  }

  text(x, y, str, fg = 7, bg = 0) {
    const chars = [...str];
    chars.forEach((ch, i) => this.put(x + i, y, ch, fg, bg));
    return x + chars.length;
  }

  /** Text with pipe codes. Returns the x position after the text. */
  pipe(x, y, str) {
    let fg = 7;
    let bg = 0;
    const re = /\|(\d\d)/g;
    let last = 0;
    let m;
    while ((m = re.exec(str))) {
      x = this.text(x, y, str.slice(last, m.index), fg, bg);
      const n = Number(m[1]);
      if (n < 16) fg = n;
      else if (n < 24) bg = n - 16;
      last = re.lastIndex;
    }
    return this.text(x, y, str.slice(last), fg, bg);
  }

  /** Draws pixels, two pixel rows per text row. -1 = transparent. */
  pixels(x, y, px) {
    for (let r = 0; r < px.length; r += 2) {
      const cy = y + r / 2;
      if (cy < 0 || cy >= this.h) continue;
      for (let c = 0; c < px[r].length; c++) {
        const cx = x + c;
        if (cx < 0 || cx >= this.w) continue;
        const cell = this.cells[cy][cx];
        // A pixel cell is [null, top colour, bottom colour]; a text cell's background shows through.
        const underTop = cell[0] === null ? cell[1] : cell[2];
        const underBot = cell[2];
        const t = px[r][c];
        const b = px[r + 1] ? px[r + 1][c] : -1;
        if (t < 0 && !(b >= 0)) continue;
        this.cells[cy][cx] = [null, t >= 0 ? t : underTop, b >= 0 ? b : underBot];
      }
    }
  }

  render(term) {
    for (const row of this.cells) this._row(term, row);
  }

  /** Draws row by row like over a modem. A key press skips the wait. */
  async animate(term, ms = 40) {
    for (const row of this.cells) {
      this._row(term, row);
      await term.sleep(ms);
    }
  }

  _row(term, row) {
    let end = row.length;
    while (end > 0 && row[end - 1][0] === ' ' && row[end - 1][2] === 0) end--;
    let i = 0;
    while (i < end) {
      const [ch, fg, bg] = row[i];
      const isPx = ch === null;
      let s = '';
      let j = i;
      while (j < end && (row[j][0] === null) === isPx && row[j][1] === fg && row[j][2] === bg) {
        s += isPx ? ' ' : row[j][0];
        j++;
      }
      if (isPx) term.pixelRun(s.length, fg, bg);
      else term.write(s, fg, bg);
      i = j;
    }
    term.write('\n', 7, 0);
  }
}

/** A random strip of blocks in the given colours, like the edges of old ANSI screens. */
function decoBar(canvas, y, seed, colors = [1, 9, 3]) {
  const rnd = rng(seed);
  const chars = ['█', '▀', '▄', '▓', '▒', '░', ' ', ' '];
  for (let x = 0; x < canvas.w; x++) {
    const dense = Math.sin(x * 0.11 + seed) > -0.3;
    const ch = dense ? chars[Math.floor(rnd() * 6)] : chars[Math.floor(rnd() * chars.length)];
    canvas.put(x, y, ch, colors[Math.floor(rnd() * colors.length)], 0);
  }
}

const titleSeed = s => [...s].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) | 0, 7);

/** "-=< Title >=-" in the middle of the given row. */
function titleLine(canvas, y, title, x0 = 0, width = canvas.w) {
  const t = `-=< ${title} >=-`;
  const x = x0 + Math.max(0, Math.floor((width - t.length) / 2));
  canvas.pipe(x, y, `|09-=< |15${title} |09>=-`);
}

/** Big logo plus "BBS" line. Returns the number of rows used. */
function drawLogo(canvas, y) {
  const px = logoPixels(LOGO_TEXT);
  if (px[0].length > canvas.w) {
    canvas.pipe(Math.max(0, Math.floor((canvas.w - 24) / 2)), y, '|11▓▒░ |15ARCTIC EXPRESS |11░▒▓');
    return 1;
  }
  canvas.pixels(Math.floor((canvas.w - px[0].length) / 2), y, px);
  return px.length / 2;
}

/**
 * Menu screen in the style of 90s BBSes: logo, title, items in two columns and a
 * picture on the right. On narrow screens the picture is left out and items are in one column.
 * items: [{key, label}], info: [[label, value]], art: scene() options
 */
function menuScreen(term, { title, items, info = [], art = {} }) {
  const w = term.cols;
  const wide = w >= 78;
  const half = Math.ceil(items.length / 2);
  const listRows = wide ? half : items.length;
  const artRows = 9;
  const bodyRows = wide ? Math.max(listRows + 2, artRows) : listRows + 2;
  const height = 1 + 7 + bodyRows + (info.length ? info.length + 1 : 0) + 1;
  const cv = new Canvas(w, height);

  decoBar(cv, 0, titleSeed(title));
  let y = 1 + drawLogo(cv, 1) + 1;

  const leftW = wide ? 46 : w;
  titleLine(cv, y, title, 0, leftW);
  if (wide) cv.pixels(48, y - 1, scene(w - 48, artRows * 2, art));

  const itemText = it => `|03[|15${it.key}|03] |07${it.label}`;
  items.forEach((it, i) => {
    const col = wide && i >= half ? 1 : 0;
    const row = wide ? i % half : i;
    cv.pipe(1 + col * 23, y + 2 + row, itemText(it));
  });

  y += bodyRows;
  info.forEach(([label, value], i) => {
    cv.pipe(1, y + i, `|15${(label + '').padEnd(10, '.')}: |11${noPipes(String(value))}`);
  });
  cv.render(term);
}
