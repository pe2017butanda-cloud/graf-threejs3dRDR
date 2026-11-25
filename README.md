# graf-threejs3dScenario · Red Dead Redemption (Three.js)

Escenario 3D integral para la práctica 3.5 de Graficación. Controlas a John Marston por un
pueblo del Oeste con física, niebla gris clara, iluminación (sol, fogata y farol), cielo HDR y música.

## Estructura

```
graf-threejs3dScenario/
├── index.html
├── css/style.css
├── js/main.js                 <- toda la lógica (rutas y ajustes en CONFIG, arriba del archivo)
└── assets/
    ├── favicon.svg
    ├── models/JohnMarston.fbx          <- TÚ lo agregas
    ├── models/anims/Idle.fbx           <- TÚ los agregas (Mixamo)
    ├── models/anims/Walking.fbx
    ├── models/anims/Running.fbx
    ├── models/anims/Jump.fbx
    ├── hdr/sunset.hdr                  <- TÚ lo agregas (Poly Haven)
    ├── textures/ground.jpg             <- opcional (si falta, se genera una tierra procedural)
    └── audio/music.mp3                 <- TÚ lo agregas (si falta, suena una guitarra sintética)
```

Si falta algún archivo, la app **no se rompe**: usa un respaldo y te muestra en la pantalla de inicio
qué archivo no encontró.

## Archivos que debes colocar / reemplazar

| Qué | Dónde | Notas |
|---|---|---|
| Modelo de John Marston | `assets/models/JohnMarston.fbx` | Si tu archivo se llama distinto, cambia `CONFIG.model` en `js/main.js`. Si trae texturas, déjalas junto al FBX (misma ruta relativa que espera el archivo). |
| Animaciones | `assets/models/anims/` | Súbelo a mixamo.com, descarga **Idle**, **Walking**, **Running** y **Jump** como FBX **Without Skin** y con **In Place** marcado. Si los nombres difieren, cambia `CONFIG.anims`. |
| Cielo HDR | `assets/hdr/sunset.hdr` | polyhaven.com → HDRIs → categoría "Skies / Sunrise-Sunset", 1K o 2K en `.hdr`. Elige uno de atardecer para que combine con el piso. |
| Textura del piso | `assets/textures/ground.jpg` | Opcional. Poly Haven → Textures → tierra o arena (el color/diffuse). |
| Música | `assets/audio/music.mp3` | Usa una pista libre de derechos de estilo western, o la que tu maestro permita. Cambia `CONFIG.music` si usas otro nombre. |
| Integrantes | `index.html` (sección `<footer>`) | Reemplaza los nombres y números de control de ejemplo. |

Ajustes por si algo se ve raro (todos en `CONFIG`):
- El personaje se ve de espaldas al caminar → `modelYawOffset: Math.PI`.
- Se ve hundido o flotando al animar → `lockHipsY: true`.
- El sol del HDR no coincide con la sombra → mueve `sunPosition`.
- El modelo se escala solo a 1.8 m; cambia `characterHeight` si lo quieres distinto.

## Importante: ejecútalo con un servidor local

Los módulos ES y los FBX **no cargan abriendo `index.html` con doble clic** (file://). Usa cualquiera:

```bash
cd graf-threejs3dScenario
python -m http.server 8000      # luego abre http://localhost:8000
```
o la extensión **Live Server** de VS Code. Necesita internet (Three.js y Cannon-es vienen de jsDelivr).

## Controles

| Tecla | Acción |
|---|---|
| W / ↑ | Caminar (al soltar se detiene) |
| Shift + W | Correr |
| Espacio | Saltar |
| Q / ← | Giro 90° izquierda |
| E / → | Giro 90° derecha |
| Ratón | Arrastrar: orbitar · Rueda: zoom |
| M | Música sí/no |
| R | Reiniciar objetos |

## Cómo cumple cada regla de la práctica

1. Personaje con 3 secuencias (caminar, correr, saltar) + reposo y giro suave de 90°.
2. Piso con textura + cielo HDR 360°.
3. Teclado con transiciones suaves (crossfade) y sin desplazamiento de raíz del FBX; fronteras con cerca y muros físicos.
4. Cámara con ratón (OrbitControls) que sigue al personaje.
5. Iluminación: sol de atardecer, fogata parpadeante y farol que se balancea.
6. Niebla gris clara (`scene.fog`) que cubre todo lo lejano.
7. Física con Cannon-es: pirámide de 6 cajas, 4 barriles, 4 rocas, 1 pelota y una planta rodante; colisiones con saloon, molino, cactus, fogata y farol. Con movimiento propio: planta rodante (viento), aspas del molino, farol y fogata.
8. Pie de página con título H1 (Arial, negrita, dorado), equipo, números de control y tablero de teclas.
9. Título de pestaña y favicon (estrella de sheriff) acordes al tema.

## Git y GitHub Pages

```bash
cd graf-threejs3dScenario
git init
git add .
git commit -m "Escenario 3D Red Dead Redemption con Three.js"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/graf-threejs3dScenario.git
git push -u origin main
```
Luego en GitHub: **Settings → Pages → Deploy from a branch → main / (root)**.
La URL queda como `https://TU_USUARIO.github.io/graf-threejs3dScenario/`.

Ojo: GitHub Pages distingue mayúsculas (`JohnMarston.fbx` ≠ `johnmarston.fbx`) y rechaza archivos de
más de 100 MB; si tu FBX pesa mucho, comprímelo o redúcelo antes de subirlo.
