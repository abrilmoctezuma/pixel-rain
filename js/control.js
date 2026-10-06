const info = document.getElementById('info');
const botones = document.getElementById('botones');
const otra = document.getElementById('otra');
const COLORES = ['#2ec4b6', '#ff6b35', '#ff4fa3', '#9be564'];
let miNumero = 0;
const apretado = { izq: false, der: false };

// Flecha de 8x8 píxeles (la derecha es la misma volteada con CSS)
const FLECHA = [
  '...X....',
  '..XX....',
  '.XXXXXXX',
  'XXXXXXXX',
  'XXXXXXXX',
  '.XXXXXXX',
  '..XX....',
  '...X....',
];
const cuadros = [];
FLECHA.forEach((fila, y) => {
  [...fila].forEach((c, x) => {
    if (c === 'X') cuadros.push('<rect x="' + x + '" y="' + y + '" width="1" height="1"/>');
  });
});
const svg = '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">' + cuadros.join('') + '</svg>';
document.getElementById('izq').innerHTML = svg;
document.getElementById('der').innerHTML = svg;

// El código de la sala viene en la URL del QR: control.html?sala=esq-xxxxx
const sala = new URLSearchParams(location.search).get('sala');
let peer = null;
let conn = null;

function perdida(texto) {
  info.textContent = texto;
  botones.style.display = 'none';
  otra.style.display = 'none';
}

function alRecibir(m) {
  if (m.t === 'asignado') {
    miNumero = m.slot + 1;
    document.documentElement.style.setProperty('--c', COLORES[m.slot]);
    info.textContent = 'Eres el Jugador ' + miNumero;
    botones.style.display = 'flex';
  } else if (m.t === 'lleno') {
    perdida('La sala ya está llena (4 jugadores)');
  } else if (m.t === 'enCurso') {
    perdida('La partida ya empezó. Recarga cuando termine');
  } else if (m.t === 'inicio') {
    info.textContent = 'Jugador ' + miNumero + ' - A jugar!';
    otra.style.display = 'none';
  } else if (m.t === 'lobby') {
    info.textContent = 'Jugador ' + miNumero + ' - esperando jugadores';
    otra.style.display = 'none';
  } else if (m.t === 'fin') {
    info.textContent = m.lugar ? 'Lugar ' + m.lugar + ' con ' + m.puntos + ' pts' : 'Fin de la partida';
    otra.style.display = 'block';
  }
}

function conectar() {
  info.textContent = 'Conectando...';
  peer = new Peer();

  peer.on('open', () => {
    conn = peer.connect(sala, { reliable: true });
    conn.on('data', alRecibir);
    conn.on('close', () => perdida('Se perdió la conexión. Recarga la página.'));
    conn.on('error', () => perdida('Error de conexión. Recarga la página.'));
  });

  peer.on('error', (e) => {
    perdida('No se pudo conectar (' + e.type + '). Revisa que la pantalla principal siga abierta y recarga.');
  });
}

if (!sala) {
  info.textContent = 'Escanea el QR de la pantalla principal';
} else {
  conectar();
}

otra.addEventListener('click', () => {
  otra.style.display = 'none';
  if (conn && conn.open) conn.send({ t: 'otravez' });
});

function enviar() {
  const dir = (apretado.der ? 1 : 0) - (apretado.izq ? 1 : 0);
  if (conn && conn.open) conn.send({ t: 'mover', dir });
}

['izq', 'der'].forEach((nombre) => {
  const b = document.getElementById(nombre);

  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    apretado[nombre] = true;
    b.classList.add('on');
    enviar();
    if (navigator.vibrate) navigator.vibrate(10);
  });

  const soltar = () => {
    apretado[nombre] = false;
    b.classList.remove('on');
    enviar();
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, soltar));
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
