'use strict';
// Chat door: IRC in BBS style. Browsers cannot open raw IRC connections, only
// WebSocket, and only to networks that accept connections from any site.
// Checked 2026-10-04: Ergo testnet accepts; Libera.Chat refuses; IRCnet has no WebSocket.

const IRC_SERVER = { name: 'Ergo testnet', ws: 'wss://testnet.ergo.chat/webirc' };
const CHAT_CHANNELS = ['#arcticexpress', '#suomi', '#chat'];

/** Turns a BBS handle into a valid IRC nick (ä → a, no spaces, max 15). */
function ircNick(handle) {
  let n = String(handle).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_\-[\]\\`^{}|]/g, '');
  if (!/^[A-Za-z_[\]\\`^{}|]/.test(n)) n = 'AE_' + n;
  return n.slice(0, 15);
}

/** Splits an IRC line into prefix, nick, command and parameters. */
function parseIrc(line) {
  let rest = line;
  let prefix = '';
  if (rest.startsWith('@')) {
    const i = rest.indexOf(' ');
    rest = i < 0 ? '' : rest.slice(i + 1);
  }
  if (rest.startsWith(':')) {
    const i = rest.indexOf(' ');
    prefix = i < 0 ? rest.slice(1) : rest.slice(1, i);
    rest = i < 0 ? '' : rest.slice(i + 1);
  }
  const params = [];
  while (rest) {
    if (rest.startsWith(':')) { params.push(rest.slice(1)); break; }
    const i = rest.indexOf(' ');
    if (i < 0) { params.push(rest); break; }
    params.push(rest.slice(0, i));
    rest = rest.slice(i + 1).replace(/^ +/, '');
  }
  const command = (params.shift() || '').toUpperCase();
  const nick = prefix.includes('!') ? prefix.slice(0, prefix.indexOf('!')) : '';
  return { prefix, nick, command, params };
}

/** Removes IRC colour and formatting codes and other control characters. */
function ircClean(text) {
  return String(text)
    .replace(/\x03(\d{1,2}(,\d{1,2})?)?/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '');
}

/** IRC channel name: starts with #, no spaces or commas, max 32 characters. */
function ircChannel(input) {
  const c = String(input || '').trim().replace(/[\s,\x00-\x1f]/g, '');
  if (!c) return null;
  return (c.startsWith('#') ? c : '#' + c).slice(0, 32);
}

async function chatDoor(term, handle) {
  const nick = ircNick(handle);
  for (;;) {
    term.clear();
    menuScreen(term, {
      title: 'Chat',
      items: [
        ...CHAT_CHANNELS.map((c, i) => ({ key: String(i + 1), label: c })),
        { key: 'U', label: 'Oma kanava' },
        { key: 'Q', label: 'Päävalikko' },
      ],
      art: { seed: 31, aurora: [11, 3, 15], bear: true },
      info: [
        ['Verkko', `IRC – ${IRC_SERVER.name}`],
        ['Nimimerkki', nick],
        ['Huom', 'IRC on julkinen: viestit näkyvät kaikille'],
      ],
    });
    term.pipe(' |07Valinta |08(|07Enter = 1|08) » |15');

    const keys = 'UQ\n\x1b' + CHAT_CHANNELS.map((_, i) => String(i + 1)).join('');
    const k = await term.readKey(keys);
    term.write('\n');
    if (k === 'Q' || k === '\x1b') return;

    let channel = CHAT_CHANNELS[0];
    if (k === 'U') {
      term.pipe(' |07Kanava |08» |15#');
      channel = ircChannel(await term.readLine(31));
      if (!channel) continue;
    } else if (k !== '\n') {
      channel = CHAT_CHANNELS[Number(k) - 1];
    }
    await ircClient(term, channel, nick);
  }
}

const time = () => new Date().toTimeString().slice(0, 5);

async function ircClient(term, startChannel, startNick) {
  let channel = startChannel;
  header(term, 'Chat', `${IRC_SERVER.name} – /help = ohjeet, Esc tai /quit = poistu`);
  term.pipeln(`|08Yhdistetään ${noPipes(IRC_SERVER.ws)}...`);

  let ws;
  try {
    ws = new WebSocket(IRC_SERVER.ws);
  } catch {
    await showError(term, 'Yhteys epäonnistui');
    return;
  }

  let me = startNick;
  let registered = false;
  let closed = false;
  const say = segs => term.above(() => term.line([[8, `${time()} `], ...segs]));
  const send = line => {
    if (ws.readyState === WebSocket.OPEN) ws.send(line.replace(/[\r\n]/g, ' ').slice(0, 480));
  };

  ws.addEventListener('open', () => {
    send(`NICK ${me}`);
    send(`USER ${me} 0 * :Arctic Express BBS`);
  });
  ws.addEventListener('close', () => {
    if (closed) return;
    closed = true;
    say([[12, '*** NO CARRIER – yhteys katkesi']]);
    term.cancelInput();
  });
  ws.addEventListener('message', e => {
    for (const raw of String(e.data).split(/\r?\n/)) if (raw) onLine(parseIrc(raw));
  });

  function onLine(m) {
    const p = m.params;
    const text = ircClean(p[p.length - 1] || '');
    switch (m.command) {
      case 'PING':
        send(`PONG :${p[0] || ''}`);
        break;
      case '001':
        registered = true;
        me = p[0] || me;
        say([[10, `*** Yhdistetty nimellä ${me}, liitytään kanavalle ${channel}`]]);
        send(`JOIN ${channel}`);
        break;
      case '433': // nick in use
        if (!registered) {
          me = me.slice(0, 14) + '_';
          send(`NICK ${me}`);
        } else {
          say([[12, '*** Nimimerkki on jo käytössä']]);
        }
        break;
      case 'PRIVMSG': {
        const raw = p[1] || '';
        if (raw.startsWith('\x01ACTION ')) {
          say([[13, `* ${m.nick} ${ircClean(raw.slice(8))}`]]);
        } else if (!raw.startsWith('\x01')) {
          const priv = p[0] === me;
          say([[priv ? 14 : 15, priv ? `*${m.nick}* ` : `<${m.nick}> `], [7, text]]);
        }
        break;
      }
      case 'NOTICE':
        if (m.nick) say([[6, `-${m.nick}- `], [7, text]]);
        break;
      case 'JOIN':
        if (m.nick === me) say([[10, `*** Olet kanavalla ${p[0]}`]]);
        else say([[8, `--> ${m.nick} liittyi`]]);
        break;
      case 'PART':
        say([[8, `<-- ${m.nick} poistui`]]);
        break;
      case 'QUIT':
        say([[8, `<-- ${m.nick} lopetti${text ? ` (${text})` : ''}`]]);
        break;
      case 'NICK':
        if (m.nick === me) me = p[0];
        say([[8, `--- ${m.nick} on nyt ${p[0]}`]]);
        break;
      case '332':
        say([[3, 'Aihe: '], [7, text]]);
        break;
      case '353':
        say([[3, 'Paikalla: '], [7, text]]);
        break;
      case 'ERROR':
        say([[12, `*** ${text}`]]);
        break;
      default:
        if (/^[45]\d\d$/.test(m.command)) say([[12, `*** ${text}`]]);
    }
  }

  const help = () => {
    say([[11, 'Komennot:']]);
    say([[7, '  /me <teksti>   toiminto']]);
    say([[7, '  /nick <nimi>   vaihda nimimerkki']]);
    say([[7, '  /join #kanava  vaihda kanavaa']]);
    say([[7, '  /names         kuka on paikalla']]);
    say([[7, '  /quit          poistu (myös Esc)']]);
  };

  for (;;) {
    const line = await term.readLine(400, { prompt: `|08[|11${channel}|08] |15`, erase: true });
    if (line === null) break;
    const t = line.trim();
    if (!t) continue;
    if (!t.startsWith('/')) {
      send(`PRIVMSG ${channel} :${t}`);
      say([[11, `<${me}> `], [7, t]]);
      continue;
    }
    const [rawCmd, ...args] = t.slice(1).split(' ');
    const cmd = rawCmd.toLowerCase();
    const arg = args.join(' ').trim();
    if (cmd === 'quit' || cmd === 'q') break;
    switch (cmd) {
      case 'me':
        send(`PRIVMSG ${channel} :\x01ACTION ${arg}\x01`);
        say([[13, `* ${me} ${arg}`]]);
        break;
      case 'nick':
        if (arg) send(`NICK ${ircNick(arg)}`);
        break;
      case 'join': {
        const next = ircChannel(arg);
        if (next) {
          send(`PART ${channel}`);
          channel = next;
          send(`JOIN ${channel}`);
        }
        break;
      }
      case 'names':
        send(`NAMES ${channel}`);
        break;
      case 'help':
        help();
        break;
      default:
        say([[12, `*** Tuntematon komento /${rawCmd} – kirjoita /help`]]);
    }
  }

  if (!closed) {
    closed = true;
    send('QUIT :Arctic Express BBS');
    ws.close();
  }
  term.pipeln('');
  term.pipeln('|07Poistuit chatista.');
  await term.pause();
}
