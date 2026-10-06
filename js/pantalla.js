const H = 600, TIEMPO = 60;
const ANCHO_MAX = 1500;   // cielo, lluvia y suelo se dibujan así de anchos para cubrir cualquier pantalla

// El juego siempre mide 600 de alto; el ancho se adapta a la forma de tu pantalla
function calcularAncho() {
  return Math.max(640, Math.min(ANCHO_MAX, Math.round(H * window.innerWidth / window.innerHeight)));
}
let W = calcularAncho();
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
    const tam = Math.max(200, Math.min(300, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.35)));
    new QRCode(qr, { text: url, width: tam, height: tam });
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
      palette: { 1: '#ffd23f', 2: '#8a4b00', 3: '#fff6b0' },
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

    // Sol pixelado
    const sol = [];
    for (let y = 0; y < 24; y++) {
      let fila = '';
      for (let x = 0; x < 24; x++) {
        const d = Math.hypot(x - 11.5, y - 11.5);
        fila += d <= 11.5 ? (y % 6 < 3 ? '1' : '2') : '.';
      }
      sol.push(fila);
    }
    T.generate('sol', { pixelWidth: 6, palette: { 1: '#ffe27a', 2: '#ffc857' }, data: sol });

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
    lluvia('lluviaA', 14, '#ffd6e8', '#ffffff');
    lluvia('lluviaB', 8, '#ffd6e8', '#ffffff');
  }

  create() {
    this.cameras.main.setBackgroundColor('#2a1a5e');
    this.crearTexturas();

    // Cielo de atardecer en franjas (de arriba hacia el horizonte)
    const cielo = [0x2a1a5e, 0x4a2275, 0x7a2b87, 0xa93a86, 0xd4507a, 0xee6b5e, 0xf58a5a];
    const alto = Math.ceil(H / cielo.length);
    cielo.forEach((c, i) => this.add.rectangle(0, i * alto, ANCHO_MAX, alto, c).setOrigin(0, 0));

    // Sol que se esconde detrás del suelo
    this.sol = this.add.image(W * 0.72, H - 120, 'sol');

    // Fondo: lluvia que cae (clara y semitransparente)
    this.fondoA = this.add.tileSprite(ANCHO_MAX / 2, H / 2, ANCHO_MAX, H, 'lluviaA').setAlpha(0.25);
    this.fondoB = this.add.tileSprite(ANCHO_MAX / 2, H / 2, ANCHO_MAX, H, 'lluviaB').setAlpha(0.5);

    // Suelo oscuro: tapa lo que cae al fondo
    this.add.rectangle(0, H - 70, ANCHO_MAX, 70, 0x1d0f3a).setOrigin(0, 0).setDepth(3);
    this.add.rectangle(0, H - 73, ANCHO_MAX, 6, 0x4b2a7a).setOrigin(0, 0).setDepth(3);

    // Jugadores
    this.jug = [0, 1].map((i) => {
      const p = this.physics.add.sprite(W * (i ? 0.75 : 0.25), H - 88, 'j' + i);
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

        // Si los dos cestos tocan el objeto a la vez, se lo queda el que lo tenga más cerca
        const miIndice = this.jug.indexOf(jugador);
        const otro = this.jug[1 - miIndice];
        if (this.physics.overlap(otro, o)) {
          const yo = Math.abs(jugador.x - o.x);
          const el = Math.abs(otro.x - o.x);
          // En un empate exacto de distancia gana el Jugador 1
          if (el < yo || (el === yo && miIndice === 1)) return;
        }

        const mala = o.esBomba;
        jugador.puntos += mala ? -1 : 1;
        this.popup(o.x, o.y, mala ? '-1' : '+1', mala ? '#ff3b3b' : '#ffd23f');
        if (mala) this.cameras.main.shake(120, 0.006);
        o.destroy();
        this.actualizarMarcador();
      });
    });

    // Textos
    const f = (px, color) => ({
      fontFamily: FUENTE,
      fontSize: px + 'px',
      color,
      stroke: '#14143a',
      strokeThickness: Math.max(3, Math.round(px / 5)),
    });
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

    // F = pantalla completa
    this.input.keyboard.on('keydown-F', () => this.scale.toggleFullscreen());

    // Si cambia el tamaño de la ventana, el juego se acomoda
    let temporizador = null;
    window.addEventListener('resize', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => this.reajustar(), 150);
    });

    this.actualizarMarcador();
    escena = this;
    revisar();
  }

  reajustar() {
    const viejo = W;
    W = calcularAncho();
    if (W === viejo) return;

    this.scale.setGameSize(W, H);
    this.cameras.main.setSize(W, H);
    this.physics.world.setBounds(0, 0, W, H);
    this.jug.forEach((p) => { p.x = (p.x / viejo) * W; });

    this.sol.setX(W * 0.72);
    this.t[1].setX(W - 16);
    this.reloj.setX(W / 2);
    this.msg.setX(W / 2);
    this.sub.setX(W / 2);
  }

  mostrar(texto, tam) {
    this.msg.setFontSize(tam || 28);
    this.msg.setText(texto);
  }

  popup(x, y, texto, color) {
    const t = this.add
      .text(x, y, texto, { fontFamily: FUENTE, fontSize: '16px', color, stroke: '#14143a', strokeThickness: 4 })
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
    backgroundColor: '#2a1a5e',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, fullscreenTarget: 'caja' },
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
