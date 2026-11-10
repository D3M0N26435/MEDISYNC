# AGENTS.md — MEDISYNC

Plataforma médica por roles: Flask + Firebase Auth/Firestore (cliente) + Socket.IO + bot de Telegram/Gemini.
UI y textos en español. No hay bundler, build, tests, lint ni CI.

## Comandos

```sh
python -m pip install -r requirements.txt      # app web
python -m pip install -r requirements-bot.txt  # solo bot
python app.py                                  # http://localhost:5000 (PORT opcional)
python bot.py                                  # proceso aparte; hace polling de Telegram
python -m py_compile app.py bot.py             # sintaxis Python
node --input-type=module --check < static/js/pharmacist.js  # sintaxis de un módulo JS
firebase deploy --only firestore:rules
```

- Verificación real es manual en navegador; requiere un `.env` válido de Firebase. Sin credenciales no se puede probar el login.
- `.env` está en `.gitignore`: **no lo leas ni imprimas**. Usa `.env.example` como referencia.
- `runtime.txt` fija Python 3.12.7 (Render).

## Arquitectura de autenticación (punto clave)

- **No hay Firebase Admin SDK** y no debe añadirse para esto. `app.py` valida el ID token con `google.oauth2.id_token.verify_firebase_token` y luego lee `users/{uid}` vía Firestore REST **con el token del propio usuario**.
- El navegador guarda el token en la cookie HttpOnly `firebase_token` mediante `POST /auth/session`. `static/js/firebase.js` la renueva cada 40 min y expulsa al usuario si el servidor responde 401/403.
- Protege toda ruta nueva con `@role_required("admin"|"doctor"|"pharmacist"|"patient")`. El decorador redirige al panel del rol real si hay desajuste.
- Los chequeos de rol en JS son solo UX. La autorización efectiva está en `firestore.rules` + `role_required`.

## Firestore: las reglas son la fuente de verdad

Colecciones: `users`, `locations`, `doctorDirectory`, `appointments`, `appointmentSlots`, `medicalRecords`, `prescriptions`, `prescriptionOrders`, `pharmacySales`, `medications`.

- Antes de cambiar la forma de un `setDoc`/`updateDoc`/`addDoc`, lee la regla correspondiente en `firestore.rules`. Varias reglas exigen **conjuntos exactos de claves** (`hasAll`/`hasOnly`), IDs derivados y transiciones de estado concretas.
- Los IDs no son aleatorios en varios flujos:
  - `appointments/{doctorId}_{date}_{timeKey}` y `appointmentSlots` con el mismo ID.
  - `prescriptionOrders/{prescriptionId}_{patientId}_{pharmacyId}`.
- `doctorDirectory` es la vista pública del médico (nombre, sede, especialidades, horarios, vacaciones). Se crea/actualiza junto con `users/{uid}` para rol `doctor` en `admin.js`.
- La reserva de cita es un batch atómico: `appointments` + `appointmentSlots`. No la separes en dos escrituras.
- El médico solo puede pasar una cita de `scheduled` a `completed` o `no_show`. `completed` exige crear `medicalRecords` y, si hay receta, `prescriptions` en el mismo batch. `no_show` no crea historial.
- `pharmacySales` es inmutable: el farmacéutico crea la venta y nadie la actualiza ni la borra. Valida claves exactas, productos (`name`, `quantity`, `unitPrice`, `subtotal`), total, pago y que `pharmacyId` coincida con su `locationId`.
- `medications` es el catálogo editable de cada farmacia (`pharmacyId`, `name`, `presentation`, `unitPrice`, `active`, `createdBy`, timestamps). El farmacéutico solo puede leer/escribir los de su `locationId`; el admin puede leer todos. No hay stock ni inventario. Las ventas guardan una copia del nombre y precio, así que editar o borrar un medicamento no altera ventas pasadas.
- Las reglas permiten al farmacéutico listar `users` **solo** con `where('role', '==', 'patient')`. No cambies esa consulta a una lista sin filtro: Firestore rechazará la lectura y expondrías perfiles de personal.
- El buscador de asegurados usa `users/{uid}.carnet`; el panel de admin lo rellena al crear pacientes. También busca por `email` y `name`. El carnet es el identificador visible, pero el ID del documento sigue siendo el UID de Firebase Auth: cambiarlo rompería `role_required`, citas, recetas e historial. La unicidad del carnet se comprueba en el navegador; no hay restricción nativa en Firestore.
- `active` ausente se interpreta como activo. La baja es lógica (`active: false`), nunca borrar `users`.
- Despliega reglas tras cambiarlas; no hay emulador configurado.

## Estructura y convenciones del frontend

- Sin bundler: ES modules nativos importados desde `https://www.gstatic.com/firebasejs/12.19.0/...`; Leaflet 1.9.4 desde unpkg.
- `static/js/map-utils.js` centraliza «Mi ubicación» y «Cómo llegar» para los mapas de admin y paciente. Usa `attachMapTools({ map, getDestination })`; la geolocalización es bajo demanda y las rutas usan el servicio público OSRM sin clave, por lo que puede fallar o limitarse.
- Cada panel es una plantilla Jinja que inyecta la config pública en `<script id="firebase-config" type="application/json">{{ firebase_config|tojson }}</script>`. Si creas un panel, replica eso + `theme.js` en `<head>` + `logout.js` al final.
- El login real es `static/js/login.js`; ignora `js/login.js` en la raíz (archivo vacío heredado).
- Usa `textContent` o el patrón `textElement()` para datos de usuario. En HTML generado por plantillas string (p. ej. `admin.js`), pasa todo por `escapeHtml()`.
- El cierre de sesión siempre vía `closeSession()` de `static/js/firebase.js` (hace signOut + POST `/auth/logout`).
- Los paneles con pestañas (paciente y farmacéutico) usan `data-*-tab`, `aria-selected` y paneles con `hidden`/`.active`. Replica `patient.js` o `pharmacist.js`; no inventes otro patrón de navegación.
- El farmacéutico tiene tres flujos separados: `Venta directa` (`pharmacySales`, clientes no registrados con autocompletado desde `medications`), `Asegurados` (búsqueda de pacientes + `prescriptionOrders` de su farmacia) y `Medicamentos` (CRUD del catálogo de su farmacia). No mezcles ventas con recetas ni uses `medications` como inventario.
- El admin crea `doctor`, `pharmacist`, `admin` y `patient` desde `admin.js`. Para pacientes pide carnet, nombre, correo y contraseña, crea la cuenta con un segundo `initializeApp` para no cerrar la sesión del admin y guarda `users/{uid}` con `role: 'patient'`, `carnet`, `name`, `email`, `active: true` y timestamps. Si falla la escritura en Firestore, elimina la cuenta de Authentication recién creada.

## Chat y bots

- `app.py` **nunca** hace polling de Telegram; `bot.py` es el único que recibe updates y reenvía respuestas al portal vía `POST /internal/telegram-reply` con `X-Chat-Bridge-Secret`.
- Variables requeridas por el puente: `tokenTelegram`/`TELEGRAM_BOT_TOKEN`, `chatIdTelegram`/`TELEGRAM_CHAT_ID`, `CHAT_BRIDGE_SECRET`, `APP_BASE_URL`.
- El estado del chat (rooms, rate limits, mapa mensaje↔sala) está en memoria. Mantén un solo worker: `gunicorn -w 1 --threads 100 app:app`. Con varios workers las respuestas de Telegram y los límites se rompen.
- MediBot web: `POST /api/medibot` solo para pacientes, 8 consultas/min, respuesta generada desde `chat/informacion.txt`.
- `chat/informacion.txt` alimenta a MediBot y a `bot.py`. Si cambias funciones visibles, actualízalo; no describas como demo algo que ya funciona ni prometas inventario/precios que no existen.
- `bot.py` fija el modelo Gemini en código (`gemini-3.5-flash-lite`), no por env.

## Configuración no obvia

- Los nombres de variables de Firebase son camelCase y sensibles a mayúsculas: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. `projectId` también acepta `FIREBASE_PROJECT_ID`.
- MediBot: `AI_PROVIDER` (`vertex` por defecto | `openai_compatible`), `AI_MODEL` (por defecto `google/medgemma-1.5-4b-it`). Vertex exige `AI_PROJECT_ID`, `AI_LOCATION`, `AI_ENDPOINT_ID`; el modo compatible usa `AI_BASE_URL` + `AI_API_KEY`/`apiGoogle`.
- `SESSION_COOKIE_SECURE` se fuerza a `true` si existe `RENDER`; en HTTPS fuera de Render hay que ponerla a mano.
- `.env.example` no lista las variables de Telegram ni `APP_BASE_URL`; están documentadas en `README.md`.

## Deuda conocida (no la tomes como comportamiento correcto)

- No hay inventario ni existencias. `medications` solo guarda catálogo y precio por farmacia; `pharmacySales` registra la venta pero no descuenta stock; no prometas esa función.
- Los limitadores de `app.py` (`_chat_requests`, `_assistant_requests`) crean entradas por UID que nunca se eliminan.
- La búsqueda de asegurados carga todos los `users` con rol `patient` y filtra en el navegador. Si la base crece, habrá que moverla a consultas indexadas o a un directorio de pacientes.
- El historial del médico consulta todos sus `medicalRecords`/`prescriptions` y filtra por paciente en el navegador para no exigir índices compuestos. Si crece, mover a consultas con `doctorId + patientId` e índices.
