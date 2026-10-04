'use strict';
// HTML → BBS text, Lynx-style: wraps to the screen width, links get [n] numbers.
// DOMParser does not run the page's scripts or load its images, and the result
// is handled only as text.

const COLOR = {
  text: 7, strong: 15, h1: 14, h2: 14, h3: 10, link: 11, num: 3,
  quote: 6, rule: 8, bullet: 9, pre: 2, img: 5, cell: 8,
};

const SKIP = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'CANVAS',
  'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'HEAD', 'META', 'LINK', 'AUDIO', 'VIDEO', 'MATH',
]);
const BLOCK = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FORM',
  'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'TABLE', 'TR', 'THEAD', 'TBODY', 'TFOOT', 'CAPTION',
  'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'CENTER', 'ADDRESS', 'DETAILS', 'SUMMARY',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'HR',
]);
// Paragraph types that get a blank line before them
const SPACED = new Set(['p', 'h1', 'h2', 'h3', 'pre']);

/**
 * @param {string} html
 * @param {string} baseUrl  base address for relative links
 * @param {number} width    line width in characters
 * @param {{remove?: string[]}} opts  CSS selectors removed before conversion
 * @returns {{title: string, lines: Array<Array<[number, string]>>, links: string[]}}
 */
function htmlToText(html, baseUrl, width, opts = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const sel of opts.remove || []) {
    doc.querySelectorAll(sel).forEach(n => n.remove());
  }
  const title = (doc.querySelector('title')?.textContent || '').trim();
  return { title, ...render(doc.body || doc.documentElement, baseUrl, width) };
}

/** Plain text (.txt): line breaks are kept, long lines are cut to the width. */
function textToLines(text, width) {
  const lines = [];
  for (const raw of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    if (!raw) { lines.push([]); continue; }
    for (let i = 0; i < raw.length; i += width) lines.push([[COLOR.text, raw.slice(i, i + width)]]);
  }
  return { title: '', lines, links: [] };
}

function render(root, baseUrl, width) {
  const out = [];
  const links = [];
  const linkNumbers = new Map();
  const st = { color: COLOR.text, kind: 'p', indent: 0, pre: false, ordinal: 0 };
  let prefix = null; // list bullet, used by the next paragraph
  let para = null;
  let space = true;
  let noBlank = false;

  const blank = () => {
    if (out.length && out[out.length - 1].length) out.push([]);
  };

  const start = () => {
    if (!para) {
      para = { kind: st.pre ? 'pre' : st.kind, indent: st.indent, prefix, tokens: [], raw: '' };
      prefix = null;
    }
    return para;
  };

  const flush = () => {
    if (para) emit(para);
    para = null;
    space = true;
  };

  const addText = (str, color) => {
    const p = start();
    if (p.kind === 'pre') { p.raw += str; return; }
    for (const part of str.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { space = true; continue; }
      p.tokens.push({ t: part, c: color, glue: !space });
      space = false;
    }
  };

  const emit = p => {
    if (p.kind === 'pre') {
      const text = p.raw.replace(/^\n|\n$/g, '');
      if (!text.trim()) return;
      blank();
      for (const raw of text.replace(/\t/g, '    ').split('\n')) {
        if (!raw) { out.push([]); continue; }
        for (let i = 0; i < raw.length; i += width) out.push([[COLOR.pre, raw.slice(i, i + width)]]);
      }
      return;
    }
    if (!p.tokens.length) return;
    if (SPACED.has(p.kind) && !noBlank) blank();
    noBlank = false;

    const prefixLen = p.prefix ? p.prefix[1].length : 0;
    const avail = Math.max(10, width - p.indent - prefixLen);
    const wrapped = wrap(p.tokens, avail);
    wrapped.forEach((segs, i) => {
      const lead = [];
      if (p.indent) lead.push([COLOR.text, ' '.repeat(p.indent)]);
      if (prefixLen) lead.push(i === 0 ? p.prefix : [COLOR.text, ' '.repeat(prefixLen)]);
      out.push([...lead, ...segs]);
    });
    if (p.kind === 'h1' || p.kind === 'h2') {
      const len = Math.min(avail, Math.max(...wrapped.map(l => l.reduce((n, [, t]) => n + t.length, 0))));
      out.push([[COLOR.rule, ' '.repeat(p.indent) + '─'.repeat(len)]]);
    }
  };

  const resolveLink = href => {
    if (!href || href.startsWith('#')) return null;
    try {
      const u = new URL(href, baseUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      u.hash = '';
      return u.href;
    } catch {
      return null;
    }
  };

  const walk = node => {
    if (node.nodeType === 3) {
      addText(node.data, st.color);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    const tag = el.tagName;
    if (SKIP.has(tag) || el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return;

    if (tag === 'BR') {
      if (st.pre) addText('\n', st.color);
      else { flush(); noBlank = true; }
      return;
    }
    if (tag === 'HR') {
      flush();
      blank();
      out.push([[COLOR.rule, '─'.repeat(width)]]);
      return;
    }
    if (tag === 'IMG') {
      const alt = (el.getAttribute('alt') || '').trim();
      if (alt) {
        start().tokens.push({ t: `[kuva: ${alt}]`, c: COLOR.img, glue: !space });
        space = true;
      }
      return;
    }
    if (tag === 'TD' || tag === 'TH') {
      if (para && para.tokens.length) {
        para.tokens.push({ t: '│', c: COLOR.cell, glue: false });
        space = true;
      }
    }

    if (tag === 'LI' && el.parentElement?.tagName === 'OL') st.ordinal++;
    const saved = { ...st };
    const block = BLOCK.has(tag);
    if (block) flush();

    switch (tag) {
      case 'H1': st.kind = 'h1'; st.color = COLOR.h1; break;
      case 'H2': st.kind = 'h2'; st.color = COLOR.h2; break;
      case 'H3': case 'H4': case 'H5': case 'H6': st.kind = 'h3'; st.color = COLOR.h3; break;
      case 'P': case 'DIV': case 'SECTION': case 'ARTICLE': case 'TABLE': case 'DL': case 'FIGURE':
        st.kind = 'p'; break;
      case 'UL': case 'OL':
        st.kind = 'li'; st.indent += saved.kind === 'li' ? 2 : 0; st.ordinal = 0; break;
      case 'LI':
        st.kind = 'li';
        prefix = [COLOR.bullet, el.parentElement?.tagName === 'OL' ? `${st.ordinal}. ` : '■ '];
        break;
      case 'TR': st.kind = 'li'; break;
      case 'DT': st.kind = 'p'; st.color = COLOR.strong; break;
      case 'DD': st.kind = 'li'; st.indent += 4; break;
      case 'BLOCKQUOTE': st.kind = 'p'; st.indent += 2; st.color = COLOR.quote; break;
      case 'PRE': st.pre = true; break;
      case 'B': case 'STRONG': case 'TH': if (st.color === COLOR.text) st.color = COLOR.strong; break;
      case 'CODE': case 'KBD': case 'TT': if (st.color === COLOR.text) st.color = COLOR.pre; break;
      case 'A': st.color = COLOR.link; break;
    }

    const before = para ? para.tokens.length : 0;
    for (const child of el.childNodes) walk(child);

    if (tag === 'A') {
      const url = resolveLink(el.getAttribute('href'));
      if (url) {
        let n = linkNumbers.get(url);
        if (!n) {
          links.push(url);
          n = links.length;
          linkNumbers.set(url, n);
        }
        const hadText = para && para.tokens.length > before;
        start().tokens.push({ t: `[${n}]`, c: COLOR.num, glue: hadText || !space });
        space = false;
      }
    }

    if (block) flush();
    Object.assign(st, saved);
    if (tag === 'LI') prefix = null;
  };

  walk(root);
  flush();
  while (out.length && !out[out.length - 1].length) out.pop();
  while (out.length && !out[0].length) out.shift();
  return { lines: out, links };
}

/** Wraps tokens into lines of at most width characters. Glued tokens stay together. */
function wrap(tokens, width) {
  const words = [];
  for (const tok of tokens) {
    if (tok.glue && words.length) words[words.length - 1].push(tok);
    else words.push([tok]);
  }
  const lines = [];
  let cur = [];
  let len = 0;
  const newLine = () => { lines.push(cur); cur = []; len = 0; };

  for (const word of words) {
    const wl = word.reduce((n, t) => n + t.t.length, 0);
    if (wl > width) {
      // Too long for one line: split it hard.
      if (len) newLine();
      for (const { t, c } of word) {
        let rest = t;
        while (rest) {
          const piece = rest.slice(0, width - len);
          cur.push([c, piece]);
          len += piece.length;
          rest = rest.slice(piece.length);
          if (len >= width) newLine();
        }
      }
      continue;
    }
    if (len && len + 1 + wl > width) newLine();
    if (len) { cur.push([word[0].c, ' ']); len++; }
    for (const { t, c } of word) { cur.push([c, t]); len += t.length; }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
