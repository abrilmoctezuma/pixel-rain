const W = 800, H = 600, TIEMPO = 60;
const COLORES = ['#2ec4b6', '#ff6b35'];
const FUENTE = '"Press Start 2P", monospace';

let estado = 'esperando';          // esperando | cuenta | jugando | fin
const conns = [null, null];        // conexión de cada celular
const conectados = [false, false];
let escena = null;
const espera = document.getElementById('espera');
const aviso = document.getElementById('aviso');

function pintarEstado() {
  [0, 1].forEach((i) => {
    const el = document.getElementById('j' + i);
    el.textContent = 'Jugador ' + (i + 1) + ': ' + (conectados[i] ? 'LISTO' : 'esperando...');
    el.style.opacity = conectados[i] ? 1 : 0.5;
  });
}
pintarEstado();

// Manda un mensaje a los dos celulares
function enviarATodos(msg) {
  conns.forEach((c) => { if (c && c.open) c.send(msg); });
}

function revisar() {
  if (estado === 'esperando' && conectados[0] && conectados[1] && escena && escena.jug) {
    escena.iniciar();
  }
}

// ---------- Sala con PeerJS ----------
function crearSala() {
  const id = 'esq-' + Math.random().toString(36).slice(2, 7);
  const peer = new Peer(id);

  peer.on('open', (idSala) => {
    const url = new URL('control.html?sala=' + idSala, location.href).href;
    const qr = document.getElementById('qr');
    qr.innerHTML = '';
    new QRCode(qr, { text: url, width: 200, height: 200 });
    document.getElementById('url').textContent = url;
    aviso.textContent = 'Escanea el QR con tu celular';
  });

  peer.on('connection', alUnirse);
  peer.on('disconnected', () => peer.reconnect());
  peer.on('error', (e) => {
    if (e.type === 'unavailable-id') crearSala();   // código repetido: probamos otro
    else aviso.textContent = 'Error de conexión (' + e.type + '). Recarga la página.';
  });
}

function alUnirse(conn) {
  conn.on('open', () => {
    const i = conns.indexOf(null);
    if (i === -1) {
      conn.send({ t: 'lleno' });
      setTimeout(() => conn.close(), 300);
      return;
    }
    conns[i] = conn;
    conn.slot = i;
    conectados[i] = true;
    conn.send({ t: 'asignado', slot: i });
    pintarEstado();
    revisar();
  });

  conn.on('data', (m) => {
    if (conn.slot === undefined) return;
    if (m.t === 'mover' && escena && escena.jug) {
      escena.jug[conn.slot].dir = Math.sign(m.dir) || 0;
    } else if (m.t === 'otravez' && estado === 'fin' && escena) {
      escena.iniciar();
    }
  });

  const salir = () => {
    const s = conn.slot;
    if (s === undefined || conns[s] !== conn) return;
    conns[s] = null;
    conectados[s] = false;
    pintarEstado();
    if (estado !== 'esperando') {
      estado = 'esperando';
      espera.style.display = 'flex';
      if (escena) escena.reiniciar();
    }
  };
  conn.on('close', salir);
  conn.on('error', salir);
}

crearSala();

// ---------- Phaser ----------
class Escena extends Phaser.Scene {
  // Dibuja los sprites con letras: cada letra es un color de la paleta, el punto es transparente
  crearTexturas() {
    const T = this.textures;

    T.generate('moneda', {
      pixelWidth: 4,
      palette: { 1: '#ffd23f', 2: '#e08a00', 3: '#fff6b0' },
      data: [
        '..2222..',
        '.211112.',
        '21133112',
        '21311112',
        '21311112',
        '21111112',
        '.211112.',
        '..2222..',
      ],
    });

    T.generate('bomba', {
      pixelWidth: 4,
      palette: { 5: '#2b2d42', 6: '#8d99ae', 7: '#ff3b3b', 8: '#ffd23f' },
      data: [
        '.....78.',
        '....8...',
        '..5555..',
        '.555555.',
        '55655555',
        '55555555',
        '.555555.',
        '..5555..',
      ],
    });

    // Un "cesto" para cada jugador, del color de su celular
    COLORES.forEach((color, i) => {
      T.generate('j' + i, {
        pixelWidth: 5,
        palette: { 1: '#14143a', 2: color },
        data: [
          '1..............1',
          '12............21',
          '122..........221',
          '1222222222222221',
          '.12222222222221.',
          '..111111111111..',
        ],
      });
    });

    // Dos capas de lluvia de píxeles para el fondo
    const lluvia = (key, gotas, c1, c2) => {
      const filas = Array.from({ length: 32 }, () => Array(32).fill('.'));
      for (let k = 0; k < gotas; k++) {
        const x = Phaser.Math.Between(0, 31);
        const y = Phaser.Math.Between(0, 28);
        filas[y][x] = '1';
        filas[y + 1][x] = '1';
        filas[y + 2][x] = '2';
      }
      T.generate(key, {
        pixelWidth: 3,
        palette: { 1: c1, 2: c2 },
        data: filas.map((f) => f.join('')),
      });
    };
    lluvia('lluviaA', 14, '#2a2a6a', '#3d3d9a');
    lluvia('lluviaB', 8, '#4a4aa8', '#8a8af0');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1038');
    this.crearTexturas();

    // Fondo: lluvia que cae
    this.fondoA = this.add.tileSprite(W / 2, H / 2, W, H, 'lluviaA');
    this.fondoB = this.add.tileSprite(W / 2, H / 2, W, H, 'lluviaB');

    // Suelo
    this.add.rectangle(W / 2, H - 6, W, 12, 0x0b0b1e);
    this.add.rectangle(W / 2, H - 12, W, 4, 0xffd23f);

    // Jugadores
    this.jug = [0, 1].map((i) => {
      const p = this.physics.add.sprite(i ? 600 : 200, H - 44, 'j' + i);
      p.setCollideWorldBounds(true);
      p.dir = 0;
      p.puntos = 0;
      return p;
    });

    // Objetos que caen
    this.objetos = this.physics.add.group();
    this.jug.forEach((p) => {
      this.physics.add.overlap(p, this.objetos, (jugador, o) => {
        if (estado !== 'jugando' || !o.active) return;
        const mala = o.esBomba;
        jugador.puntos += mala ? -1 : 1;
        this.popup(o.x, o.y, mala ? '-1' : '+1', mala ? '#ff3b3b' : '#ffd23f');
        if (mala) this.cameras.main.shake(120, 0.006);
        o.destroy();
        this.actualizarMarcador();
      });
    });

    // Textos
    const f = (px, color) => ({ fontFamily: FUENTE, fontSize: px + 'px', color });
    this.t = [0, 1].map((i) =>
      this.add.text(i ? W - 16 : 16, 16, '', f(16, COLORES[i])).setOrigin(i, 0).setDepth(5)
    );
    this.reloj = this.add.text(W / 2, 14, '', f(24, '#ffffff')).setOrigin(0.5, 0).setDepth(5);
    this.msg = this.add
      .text(W / 2, H / 2 - 20, '', { ...f(28, '#ffd23f'), align: 'center', lineSpacing: 16 })
      .setOrigin(0.5)
      .setDepth(8);
    this.sub = this.add.text(W / 2, H / 2 + 100, '', { ...f(12, '#ffffff'), align: 'center' })
      .setOrigin(0.5)
      .setDepth(8);

    // Generador de objetos
    this.time.addEvent({ delay: 650, loop: true, callback: this.crearObjeto, callbackScope: this });

    // Barra espaciadora = jugar de nuevo (por si no quieres usar el celular)
    this.input.keyboard.on('keydown-SPACE', () => {
      if (estado === 'fin') this.iniciar();
    });

    this.actualizarMarcador();
    escena = this;
    revisar();
  }

  mostrar(texto, tam) {
    this.msg.setFontSize(tam || 28);
    this.msg.setText(texto);
  }

  popup(x, y, texto, color) {
    const t = this.add
      .text(x, y, texto, { fontFamily: FUENTE, fontSize: '16px', color })
      .setOrigin(0.5)
      .setDepth(6);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  limpiar() {
    [...this.objetos.getChildren()].forEach((o) => o.destroy());
  }

  reiniciar() {
    this.limpiar();
    this.jug.forEach((p) => { p.puntos = 0; p.dir = 0; });
    this.mostrar('');
    this.sub.setText('');
    this.reloj.setText('');
    this.actualizarMarcador();
  }

  iniciar() {
    this.reiniciar();
    estado = 'cuenta';
    espera.style.display = 'none';
    enviarATodos({ t: 'inicio' });

    let n = 3;
    this.mostrar(String(n), 72);
    this.time.addEvent({
      delay: 1000,
      repeat: 2,
      callback: () => {
        n--;
        if (n > 0) {
          this.mostrar(String(n), 72);
        } else {
          this.mostrar('YA!', 56);
          estado = 'jugando';
          this.inicio = this.time.now;
          this.time.delayedCall(700, () => { if (estado === 'jugando') this.mostrar(''); });
        }
      },
    });
  }

  crearObjeto() {
    if (estado !== 'jugando') return;
    const t = (this.time.now - this.inicio) / 1000;   // segundos jugados
    const bomba = Math.random() < 0.3;
    const x = Phaser.Math.Between(30, W - 30);

    const o = this.physics.add.sprite(x, -20, bomba ? 'bomba' : 'moneda');
    this.objetos.add(o);
    // La velocidad va DESPUÉS de agregarlo al grupo y aumenta con el tiempo
    o.body.setVelocityY(Phaser.Math.Between(150, 260) + t * 3);
    o.body.setSize(24, 24);
    o.esBomba = bomba;
  }

  actualizarMarcador() {
    this.jug.forEach((p, i) => this.t[i].setText('J' + (i + 1) + ': ' + p.puntos));
  }

  terminar() {
    estado = 'fin';
    this.limpiar();
    this.reloj.setText('0');
    const [a, b] = [this.jug[0].puntos, this.jug[1].puntos];
    const ganador = a === b ? 'EMPATE!' : 'GANA EL\nJUGADOR ' + (a > b ? 1 : 2) + '!';
    this.mostrar(ganador + '\n\n' + a + ' - ' + b, 28);
    this.sub.setText('Toca JUGAR DE NUEVO en tu celular\no pulsa ESPACIO');
    enviarATodos({ t: 'fin' });
  }

  update() {
    // La lluvia del fondo siempre cae
    this.fondoA.tilePositionY -= 1.5;
    this.fondoB.tilePositionY -= 3;

    if (estado === 'jugando') {
      this.jug.forEach((p) => p.body.setVelocityX(p.dir * 420));

      const restante = Math.max(0, TIEMPO - (this.time.now - this.inicio) / 1000);
      this.reloj.setText(String(Math.ceil(restante)));
      if (restante <= 0) this.terminar();
    } else {
      this.jug.forEach((p) => p.body.setVelocityX(0));
    }

    // Borrar lo que ya salió de la pantalla
    [...this.objetos.getChildren()].forEach((o) => { if (o.y > H + 30) o.destroy(); });
  }
}

function arrancarPhaser() {
  new Phaser.Game({
    type: Phaser.AUTO,
    width: W,
    height: H,
    parent: 'juego',
    pixelArt: true,
    backgroundColor: '#1a1038',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
    scene: Escena,
  });
}

// Esperamos a que cargue la fuente pixelada para que Phaser la pueda usar
if (document.fonts && document.fonts.load) {
  document.fonts.load('16px "Press Start 2P"').then(arrancarPhaser, arrancarPhaser);
} else {
  arrancarPhaser();
}
