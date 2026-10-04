'use strict';
// Door game launcher: runs a DOS game in js-dos (DOSBox in WebAssembly) and starts it
// automatically. Game packages are fetched from archive.org's CORS path, which allows
// reading from any site (checked 2026-10-04). play.html?g=<key>

const PLAY_GAMES = {
  lord: {
    title: 'Legend of the Red Dragon',
    zip: 'https://archive.org/cors/msdos_Legend_of_the_Red_Dragon_1992/Legend_of_the_Red_Dragon_1992.zip',
    commands: ['cd legord', 'START 0'],
  },
  lord2: {
    title: 'LORD 2: New World',
    zip: 'https://archive.org/cors/msdos_Legend_of_the_Red_Dragon_2_-_New_World_1992/Legend_of_the_Red_Dragon_2_-_New_World_1992.zip',
    commands: ['cd legord2', 'LORD2'],
  },
  mbsim: {
    title: 'MBnet Simulaattori',
    zip: 'https://archive.org/cors/msdos_MBSIM076_shareware/msdos_MBSIM076_shareware.zip',
    commands: ['mbsimu.exe'],
  },
};

(function start() {
  const status = document.getElementById('status');
  const canvas = document.getElementById('dos');
  const key = new URLSearchParams(location.search).get('g');
  const game = Object.prototype.hasOwnProperty.call(PLAY_GAMES, key) ? PLAY_GAMES[key] : null;
  if (!game) {
    status.textContent = 'Tuntematon peli.';
    return;
  }
  document.title = `${game.title} – Arctic Express BBS`;
  if (location.protocol === 'file:') {
    // Browsers do not let a page opened from disk load the emulator's WebAssembly file.
    status.textContent = 'Pelit toimivat vain verkossa (esim. GitHub Pages), eivät levyltä avattuna.';
    return;
  }
  status.textContent = `Ladataan: ${game.title}...`;

  const args = [];
  for (const c of game.commands) args.push('-c', c);

  function run() {
    // Own progress handler, so js-dos does not draw its default loader (inline styles).
    window.Dos(canvas, {
      wdosboxUrl: 'vendor/js-dos/wdosbox.js',
      autolock: false,
      onprogress: (stage, total, loaded) => {
        const pct = total ? Math.round((loaded / total) * 100) : 0;
        status.textContent = `Ladataan: ${game.title}... ${pct}%`;
      },
    }).ready((fs, main) => {
      fs.extract(game.zip)
        .then(() => main(args))
        .then(() => {
          status.hidden = true;
          canvas.focus();
        })
        .catch(() => {
          status.textContent = 'Pelin lataus epäonnistui. Yritä myöhemmin uudelleen.';
        });
    });
  }

  // The DOSBox core (wdosbox.js) is already loaded as a normal script. Here its
  // WebAssembly part is compiled and handed to js-dos, which otherwise would load
  // the core with eval (blocked by this page's Content Security Policy).
  fetch('vendor/js-dos/wdosbox.wasm.js')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then(bytes => WebAssembly.compile(bytes))
    .then(wasmModule => {
      window.exports.instantiateWasm = (imports, done) => {
        imports.env.globalscall = () => {};
        return WebAssembly.instantiate(wasmModule, imports).then(instance => done(instance, wasmModule));
      };
      run();
    })
    .catch(() => {
      status.textContent = 'Emulaattorin lataus epäonnistui.';
    });

  // Keep the keyboard on the game when the window is clicked.
  document.addEventListener('mousedown', () => canvas.focus());
})();
