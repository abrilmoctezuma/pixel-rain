const H = 600, TIEMPO = 60, MAX = 4;     // MAX = jugadores como máximo
const ANCHO_MAX = 1500;   // cielo, lluvia y suelo se dibujan así de anchos para cubrir cualquier pantalla

// El juego siempre mide 600 de alto; el ancho se adapta a la forma de tu pantalla
function calcularAncho() {
  return Math.max(640, Math.min(ANCHO_MAX, Math.round(H * window.innerWidth / window.innerHeight)));
}
let W = calcularAncho();

const COLORES = ['#2ec4b6', '#ff6b35', '#ff4fa3', '#9be564'];   // turquesa, naranja, rosa, verde
const FUENTE = '"Press Start 2P", monospace';

let estado = 'esperando';          // esperando | cuenta | jugando | fin
const conns = Array(MAX).fill(null);        // conexión de cada celular
const conectados = Array(MAX).fill(false);
let escena = null;
const espera = document.getElementById('espera');
const aviso = document.getElementById('aviso');
const btnEmpezar = document.getElementById('empezar');

function actualizarBoton() {
  const n = conectados.filter(Boolean).length;
  btnEmpezar.disabled = n < 2;
  btnEmpezar.textContent = n < 2 ? 'FALTAN JUGADORES (MIN. 2)' : 'EMPEZAR (' + n + ' JUGADORES)';
}

function pintarEstado() {
  for (let i = 0; i < MAX; i++) {
    const el = document.getElementById('j' + i);
    el.textContent = 'Jugador ' + (i + 1) + ': ' + (conectados[i] ? 'LISTO' : 'esperando...');
    el.style.opacity = conectados[i] ? 1 : 0.45;
  }
  actualizarBoton();
}
pintarEstado();

btnEmpezar.addEventListener('click', () => {
  if (estado === 'esperando' && escena) escena.iniciar();
});

// Manda un mensaje a todos los celulares
function enviarATodos(msg) {
  conns.forEach((c) => { if (c && c.open) c.send(msg); });
}

// ---------- Sala con PeerJS ----------
function crearSala() {
  const id = 'esq-' + Math.random().toString(36).slice(2, 7);
  const peer = new Peer(id);

  peer.on('open', (idSala) => {
    const url = new URL('control.html?sala=' + idSala, location.href).href;
    const qr = document.getElementById('qr');
    qr.innerHTML = '';
    const tam = Math.max(200, Math.min(280, Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.3)));
    new QRCode(qr, { text: url, width: tam, height: tam });
    document.getElementById('url').textContent = url;
    aviso.textContent = 'Escanea el QR con tu celular (hasta ' + MAX + ' jugadores)';
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
    // Solo se puede entrar en el lobby o entre partidas
    if (estado === 'cuenta' || estado === 'jugando') {
      conn.send({ t: 'enCurso' });
      setTimeout(() => conn.close(), 300);
      return;
    }
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
    if (escena) escena.jugadorSalio(s);
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

    // Jugadores: se crean los 4, pero solo aparecen los que están conectados al empezar
    this.jug = COLORES.map((c, i) => {
      const p = this.physics.add.sprite(W * (i + 1) / (MAX + 1), H - 88, 'j' + i);
      p.setCollideWorldBounds(true);
      p.indice = i;
      p.dir = 0;
      p.puntos = 0;
      p.activo = false;     // está jugando ahora mismo
      p.participo = false;  // jugó en esta ronda (sale en el ranking)
      p.salio = false;      // se desconectó a media partida
      return p;
    });

    // Objetos que caen
    this.objetos = this.physics.add.group();
    this.jug.forEach((p) => {
      this.physics.add.overlap(p, this.objetos, (jugador, o) => {
        if (estado !== 'jugando' || !o.active || !jugador.activo) return;

        // Si varios cestos tocan el objeto a la vez, le cuenta a todos los que lo tocan
        const tocan = this.jug.filter((j) => j.activo && (j === jugador || this.physics.overlap(j, o)));

        const mala = o.esBomba;
        tocan.forEach((j) => {
          j.puntos += mala ? -1 : 1;
          this.popup(j.x, o.y, mala ? '-1' : '+1', mala ? '#ff3b3b' : '#ffd23f');
        });
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

    // Marcadores en una fila, uno por jugador
    this.t = COLORES.map((c, i) =>
      this.add.text(W * (2 * i + 1) / (2 * MAX), 52, '', f(14, c)).setOrigin(0.5, 0).setDepth(5)
    );
    this.reloj = this.add.text(W / 2, 10, '', f(24, '#ffffff')).setOrigin(0.5, 0).setDepth(5);
    this.msg = this.add
      .text(W / 2, H / 2 - 20, '', { ...f(28, '#ffd23f'), align: 'center', lineSpacing: 16 })
      .setOrigin(0.5)
      .setDepth(8);

    // Pantalla de ranking
    this.panel = this.add.rectangle(W / 2, H / 2, 560, 430, 0x14143a, 0.88).setDepth(7);
    this.titulo = this.add
      .text(W / 2, H / 2 - 165, '', { ...f(24, '#ffd23f'), align: 'center' })
      .setOrigin(0.5)
      .setDepth(8);
    this.rank = COLORES.map((c, k) =>
      this.add.text(W / 2, H / 2 - 95 + k * 50, '', f(20, c)).setOrigin(0.5).setDepth(8)
    );
    this.sub = this.add
      .text(W / 2, H / 2 + 150, '', { ...f(12, '#ffffff'), align: 'center', lineSpacing: 10 })
      .setOrigin(0.5)
      .setDepth(8);

    // Generador de objetos
    this.time.addEvent({ delay: 650, loop: true, callback: this.crearObjeto, callbackScope: this });

    // ESPACIO o ENTER = empezar (en el lobby, con 2 o más) / jugar de nuevo
    const empezar = () => {
      const listos = conectados.filter(Boolean).length;
      if (estado === 'fin' || (estado === 'esperando' && listos >= 2)) this.iniciar();
    };
    this.input.keyboard.on('keydown-SPACE', empezar);
    this.input.keyboard.on('keydown-ENTER', empezar);

    // F = pantalla completa
    this.input.keyboard.on('keydown-F', () => this.scale.toggleFullscreen());

    // Si cambia el tamaño de la ventana, el juego se acomoda
    let temporizador = null;
    window.addEventListener('resize', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => this.reajustar(), 150);
    });

    this.reiniciar();
    escena = this;
  }

  // Coloca los textos y el sol según el ancho actual de la pantalla
  acomodar() {
    this.sol.setX(W * 0.72);
    this.t.forEach((t, i) => t.setX(W * (2 * i + 1) / (2 * MAX)));
    [this.reloj, this.msg, this.panel, this.titulo, this.sub].forEach((o) => o.setX(W / 2));
    this.rank.forEach((r) => r.setX(W / 2));
  }

  reajustar() {
    const viejo = W;
    W = calcularAncho();
    if (W === viejo) return;

    this.scale.setGameSize(W, H);
    this.cameras.main.setSize(W, H);
    this.physics.world.setBounds(0, 0, W, H);
    this.jug.forEach((p) => { p.x = (p.x / viejo) * W; });
    this.acomodar();
  }

  popup(x, y, texto, color) {
    const t = this.add
      .text(x, y, texto, { fontFamily: FUENTE, fontSize: '16px', color, stroke: '#14143a', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(6);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  mostrar(texto, tam) {
    this.msg.setFontSize(tam || 28);
    this.msg.setText(texto);
  }

  limpiar() {
    [...this.objetos.getChildren()].forEach((o) => o.destroy());
  }

  // Deja todo en blanco: sin objetos, sin jugadores en pantalla, sin ranking
  reiniciar() {
    if (this.cuenta) this.cuenta.remove();
    this.limpiar();
    this.jug.forEach((p) => {
      p.puntos = 0;
      p.dir = 0;
      p.activo = false;
      p.participo = false;
      p.salio = false;
      p.disableBody(true, true);
    });
    this.mostrar('');
    this.sub.setText('');
    this.titulo.setText('');
    this.rank.forEach((r) => r.setVisible(false));
    this.panel.setVisible(false);
    this.reloj.setText('');
    this.actualizarMarcador();
  }

  iniciar() {
    this.reiniciar();

    const idx = [];
    conectados.forEach((c, i) => { if (c) idx.push(i); });

    if (idx.length < 2) {            // sin suficientes jugadores: regresamos al lobby
      estado = 'esperando';
      espera.style.display = 'flex';
      enviarATodos({ t: 'lobby' });
      return;
    }

    estado = 'cuenta';
    espera.style.display = 'none';

    // Los cestos se reparten parejo en el suelo
    idx.forEach((i, k) => {
      const p = this.jug[i];
      p.enableBody(true, W * (k + 1) / (idx.length + 1), H - 88, true, true);
      p.activo = true;
      p.participo = true;
    });
    this.actualizarMarcador();
    enviarATodos({ t: 'inicio' });

    let n = 3;
    this.mostrar(String(n), 72);
    this.cuenta = this.time.addEvent({
      delay: 1000,
      repeat: 2,
      callback: () => {
        if (estado !== 'cuenta') return;
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

  // Un celular se desconectó
  jugadorSalio(s) {
    const p = this.jug[s];
    if ((estado !== 'cuenta' && estado !== 'jugando') || !p.activo) return;

    p.activo = false;
    p.salio = true;
    p.dir = 0;
    p.disableBody(true, true);
    this.actualizarMarcador();

    // Si ya no quedan al menos 2 jugadores, se cancela la partida
    if (this.jug.filter((j) => j.activo).length < 2) {
      estado = 'esperando';
      espera.style.display = 'flex';
      this.reiniciar();
      enviarATodos({ t: 'lobby' });
    }
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
    this.jug.forEach((p, i) => {
      this.t[i].setVisible(p.participo);
      this.t[i].setAlpha(p.salio ? 0.4 : 1);
      this.t[i].setText('J' + (i + 1) + ': ' + p.puntos);
    });
  }

  terminar() {
    estado = 'fin';
    this.limpiar();
    this.reloj.setText('0');
    this.mostrar('');

    // Ranking: de más a menos puntos; si empatan, comparten lugar
    const lista = this.jug.filter((p) => p.participo).sort((a, b) => b.puntos - a.puntos);
    let lugar = 0;
    let previo = null;
    lista.forEach((p, k) => {
      if (p.puntos !== previo) { lugar = k + 1; previo = p.puntos; }
      p.lugar = lugar;
    });

    const primeros = lista.filter((p) => p.lugar === 1);
    this.titulo.setText(
      primeros.length === 1
        ? 'GANA EL JUGADOR ' + (primeros[0].indice + 1) + '!'
        : 'EMPATE!'
    );

    lista.forEach((p, k) => {
      this.rank[k]
        .setText(p.lugar + '. JUGADOR ' + (p.indice + 1) + '  ' + p.puntos + (p.salio ? ' (salio)' : ''))
        .setColor(COLORES[p.indice])
        .setVisible(true);
    });

    this.panel.setVisible(true);
    this.sub.setText('Toca JUGAR DE NUEVO en tu celular\no pulsa ESPACIO');

    // Cada celular recibe su lugar
    conns.forEach((c, i) => {
      if (c && c.open) {
        const p = this.jug[i];
        c.send({ t: 'fin', lugar: p.participo ? p.lugar : null, puntos: p.puntos });
      }
    });
  }

  update() {
    // La lluvia del fondo siempre cae
    this.fondoA.tilePositionY -= 1.5;
    this.fondoB.tilePositionY -= 3;

    if (estado === 'jugando') {
      this.jug.forEach((p) => { if (p.activo) p.body.setVelocityX(p.dir * 420); });

      const restante = Math.max(0, TIEMPO - (this.time.now - this.inicio) / 1000);
      this.reloj.setText(String(Math.ceil(restante)));
      if (restante <= 0) this.terminar();
    } else {
      this.jug.forEach((p) => { if (p.activo) p.body.setVelocityX(0); });
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
