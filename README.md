# Pixel Rain 

Juego de 2 jugadores hecho con HTML, CSS, JavaScript y Phaser, con estilo pixel art.
La pantalla principal muestra un código QR y cada jugador lo escanea con su celular, que se convierte en su control (conexión con PeerJS, sin servidor propio).

## Cómo jugar
1. Abre la página principal en una computadora o proyector.
2. Escanea el QR con dos celulares.
3. Usa las flechas para atrapar monedas (+1) y esquivar bombas (-1).
4. Gana quien tenga más puntos al terminar los 60 segundos.

## Estructura
- `index.html`: pantalla principal (QR + juego)
- `control.html`: control del celular
- `css/`: estilos de cada pantalla
- `js/pantalla.js`: lógica del juego, sprites pixel art y sala PeerJS
- `js/control.js`: botones táctiles del celular
- `lib/`: Phaser 3.80.1, PeerJS 1.5.4 y la fuente Press Start 2P (licencia OFL)
