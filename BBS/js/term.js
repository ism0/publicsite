'use strict';
// Terminal: 16-colour text display and keyboard.
// Colours use BBS pipe codes: |00–|15 foreground, |16–|23 background.
// All text goes in as text nodes, never as HTML.

const SENTINEL = '  ';
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_NODES = 8000;

const nextFrame = () => new Promise(r => requestAnimationFrame(r));

class Terminal {
  constructor(screenEl, kbdEl) {
    this.el = screenEl;
    this.kbd = kbdEl;
    this.fg = 7;
    this.bg = 0;
    this.cols = 80;
    this.rows = 24;
    this.waiter = null;
    this.skip = false;

    this.cursor = document.createElement('span');
    this.cursor.className = 'cursor';
    this.cursor.textContent = ' ';
    this.el.appendChild(this.cursor);

    this._bindKeys();
    this.measure();
    window.addEventListener('resize', () => this.measure());
    this.el.addEventListener('click', () => this.focus());
  }

  focus() {
    this.kbd.focus({ preventScroll: true });
    this._resetKbd();
  }

  /** Works out how many characters fit across and down the screen. */
  measure() {
    const probe = document.createElement('span');
    probe.textContent = 'M'.repeat(10);
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    this.el.appendChild(probe);
    const charWidth = probe.getBoundingClientRect().width / 10;
    probe.remove();

    const cs = getComputedStyle(this.el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const w = this.el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = this.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (charWidth > 0) this.cols = Math.max(32, Math.min(80, Math.floor(w / charWidth)));
    if (lineHeight > 0) this.rows = Math.max(12, Math.floor(h / lineHeight));
  }

  clear() {
    while (this.el.firstChild !== this.cursor) this.el.firstChild.remove();
    this.fg = 7;
    this.bg = 0;
  }

  /** Plain text in the given colour. Pipe codes are NOT interpreted. */
  write(text, fg = this.fg, bg = this.bg) {
    if (!text) return;
    const cls = `f${fg} b${bg}`;
    const prev = this.cursor.previousSibling;
    if (prev && prev.className === cls && prev.firstChild) {
      prev.firstChild.appendData(text);
    } else {
      const span = document.createElement('span');
      span.className = cls;
      span.appendChild(document.createTextNode(text));
      this.el.insertBefore(span, this.cursor);
      if (this.el.childNodes.length > MAX_NODES) this.el.firstChild.remove();
    }
    this._scroll();
  }

  /** n pixel cells: upper half top colour, lower half bottom colour (see .px in the CSS). */
  pixelRun(n, top, bottom) {
    const span = document.createElement('span');
    span.className = `px t${top} u${bottom}`;
    span.textContent = ' '.repeat(n);
    this.el.insertBefore(span, this.cursor);
  }

  /** Text containing pipe codes – only for the BBS's own strings. */
  pipe(str) {
    const re = /\|(\d\d)/g;
    let last = 0;
    let m;
    while ((m = re.exec(str))) {
      this.write(str.slice(last, m.index));
      this._code(Number(m[1]));
      last = re.lastIndex;
    }
    this.write(str.slice(last));
  }

  pipeln(str = '') {
    this.pipe(str + '\n');
  }

  /** One line made of [colour, text] segments (from html2text). */
  line(segs) {
    for (const [c, t] of segs) this.write(t, c, 0);
    this.write('\n', 7, 0);
  }

  /** Writes text slowly like a modem (cps = characters per second). Any key skips it. */
  async slowPipe(str, cps = 960) {
    this.skip = false;
    const ops = [];
    const re = /\|(\d\d)/g;
    let last = 0;
    let m;
    const pushText = s => { for (const ch of s) ops.push(ch); };
    while ((m = re.exec(str))) {
      pushText(str.slice(last, m.index));
      ops.push(Number(m[1]));
      last = re.lastIndex;
    }
    pushText(str.slice(last));

    const perFrame = Math.max(1, Math.round(cps / 60));
    let i = 0;
    while (i < ops.length) {
      const budget = this.skip || REDUCED_MOTION ? Infinity : perFrame;
      for (let n = 0; i < ops.length && n < budget; i++) {
        const op = ops[i];
        if (typeof op === 'number') this._code(op);
        else { this.write(op); n++; }
      }
      await nextFrame();
    }
  }

  /** Waits for ms milliseconds, or less if a key is pressed. */
  async sleep(ms) {
    const end = performance.now() + ms;
    while (!this.skip && !REDUCED_MOTION && performance.now() < end) await nextFrame();
  }

  /** Waits for one key. valid = allowed keys (upper case), '\n' = Enter, '\x1b' = Esc. */
  readKey(valid) {
    this.skip = false;
    return new Promise(resolve => {
      this.waiter = k => {
        const key = k.length === 1 ? k.toUpperCase() : k;
        if (valid && !valid.includes(key)) return;
        this.waiter = null;
        resolve(key);
      };
    });
  }

  /**
   * Reads a line of text. Returns null if the user presses Esc or cancelInput() is called.
   * opts.prompt = prompt with pipe codes, kept on the input line (see above()).
   * opts.erase = remove the prompt and the text from the screen when done (chat).
   */
  readLine(maxLen = 60, opts = {}) {
    this.skip = false;
    const promptEl = document.createElement('span');
    promptEl.className = 'prompt';
    if (opts.prompt) this._pipeInto(promptEl, opts.prompt);
    const span = document.createElement('span');
    span.className = 'f15 b0 typed';
    this.el.insertBefore(promptEl, this.cursor);
    this.el.insertBefore(span, this.cursor);
    this.inputEls = [promptEl, span];
    let buf = '';
    return new Promise(resolve => {
      const finish = value => {
        this.waiter = null;
        this._cancel = null;
        this.inputEls = null;
        if (opts.erase) { promptEl.remove(); span.remove(); }
        else this.write('\n', 7, 0);
        resolve(value);
      };
      this._cancel = () => finish(null);
      this.waiter = k => {
        if (k === '\n' || k === '\x1b') {
          finish(k === '\n' ? buf : null);
          return;
        }
        if (k === '\b') buf = buf.slice(0, -1);
        else if (k >= ' ' && buf.length < maxLen) buf += k;
        span.textContent = buf;
        this._scroll();
      };
    });
  }

  /** Ends an active readLine() as if Esc had been pressed. */
  cancelInput() {
    if (this._cancel) this._cancel();
  }

  /** Writes output above the active input line, so typing is not interrupted (chat). */
  above(fn) {
    const els = this.inputEls;
    if (els) els.forEach(e => e.remove());
    fn();
    if (els) els.forEach(e => this.el.insertBefore(e, this.cursor));
    this._scroll();
  }

  async pause(text = 'Paina näppäintä') {
    this.pipe(`|08[|15${text}|08]|07`);
    await this.readKey();
    this.write('\n');
  }

  /** Draws pipe-coded text inside a container element (for prompts). */
  _pipeInto(container, str) {
    let fg = 7;
    let bg = 0;
    const add = text => {
      if (!text) return;
      const s = document.createElement('span');
      s.className = `f${fg} b${bg}`;
      s.textContent = text;
      container.appendChild(s);
    };
    const re = /\|(\d\d)/g;
    let last = 0;
    let m;
    while ((m = re.exec(str))) {
      add(str.slice(last, m.index));
      const n = Number(m[1]);
      if (n < 16) fg = n;
      else if (n < 24) bg = n - 16;
      last = re.lastIndex;
    }
    add(str.slice(last));
  }

  _code(n) {
    if (n < 16) this.fg = n;
    else if (n < 24) this.bg = n - 16;
  }

  _scroll() {
    this.el.scrollTop = this.el.scrollHeight;
  }

  _bindKeys() {
    const special = { Enter: '\n', Backspace: '\b', Escape: '\x1b' };
    this.kbd.addEventListener('keydown', e => {
      const k = special[e.key];
      if (k) {
        e.preventDefault();
        this._key(k);
      }
    });
    // Mobile keyboards send characters and deletions as input events.
    this.kbd.addEventListener('input', e => {
      if (e.inputType && e.inputType.startsWith('delete')) this._key('\b');
      else if (e.inputType === 'insertLineBreak') this._key('\n');
      else for (const ch of this.kbd.value.slice(SENTINEL.length)) this._key(ch);
      this._resetKbd();
    });
    document.addEventListener('keydown', e => {
      if (document.activeElement !== this.kbd && !e.ctrlKey && !e.metaKey && !e.altKey) this.focus();
    }, true);
  }

  _resetKbd() {
    this.kbd.value = SENTINEL;
    try { this.kbd.setSelectionRange(SENTINEL.length, SENTINEL.length); } catch { /* not supported */ }
  }

  _key(k) {
    if (this.waiter) this.waiter(k);
    else this.skip = true;
  }
}

/** Pads or truncates text to exactly the given width. */
function fit(text, width) {
  return text.length > width ? text.slice(0, Math.max(0, width - 1)) + '…' : text.padEnd(width);
}

function center(text, width) {
  const t = text.length > width ? text.slice(0, width) : text;
  const left = Math.floor((width - t.length) / 2);
  return ' '.repeat(left) + t + ' '.repeat(width - t.length - left);
}

/** Prevents user text from being interpreted as pipe codes. */
function noPipes(text) {
  return String(text).replace(/\|/g, '¦');
}
