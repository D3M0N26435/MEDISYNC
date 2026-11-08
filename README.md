# MEDISYNC

## Administración de personal, pacientes y sedes

El panel de administración usa Firebase Authentication y Cloud Firestore. Copia `.env.example` a `.env`, completa la configuración web de Firebase y habilita el proveedor **Correo electrónico/contraseña** en Firebase Authentication.

Flask verifica el token de acceso de Firebase y consulta el perfil de Firestore usando ese mismo token y las reglas de seguridad. Para iniciar sesión en Render no hace falta subir una cuenta de servicio: basta con que la configuración web incluya el `projectId` correcto. En Render, la cookie se marca como segura automáticamente; en otros servidores HTTPS configura `SESSION_COOKIE_SECURE=true`.

Antes de usar el panel, crea en Firebase Authentication la cuenta inicial de administración. Después crea manualmente en Firestore un documento en `users/{UID_DE_ESE_USUARIO}` con al menos estos campos:

```json
{
  "name": "Administrador",
  "email": "admin@tu-dominio.com",
  "role": "admin",
  "active": true
}
```

Despliega las reglas incluidas desde la raíz del proyecto con Firebase CLI:

```sh
firebase deploy --only firestore:rules
```

Las cuentas creadas desde el panel reciben acceso por correo y contraseña. El personal y los pacientes se desactivan con baja lógica: el acceso se bloquea en la siguiente solicitud y el perfil se conserva para el historial. Las sedes se guardan en `locations`; las coordenadas se eligen con un clic en el mapa. La disponibilidad se calcula a partir de los periodos de vacaciones del perfil.

La pestaña **Pacientes** permite crear la cuenta de un paciente con su carnet de identidad, nombre completo, correo y contraseña inicial. El carnet se guarda en `users/{uid}.carnet` como identificador visible y el panel comprueba que no se repita; el UID interno de Firebase Authentication se mantiene como ID del documento porque las citas, recetas e historial se vinculan con `patientId`. Al crear la cuenta se usa un segundo cliente de Firebase para no cerrar la sesión del administrador. Si la escritura en Firestore falla, la cuenta de Authentication se elimina para no dejar accesos huérfanos. El historial clínico empieza vacío y se llena cuando un médico completa una atención.

Las reglas requieren que los documentos de personal y pacientes estén en `users` y que el documento del usuario autenticado tenga `role: "admin"`. Revisa las reglas si el proyecto ya tiene políticas para otras colecciones antes de desplegarlas.

## Mapas y rutas

Los mapas del panel de administración y del paciente incluyen los botones **Mi ubicación** y **Cómo llegar**. La ubicación se obtiene con la API de geolocalización del navegador (requiere HTTPS o `localhost`) y solo se solicita al pulsar el botón; no se guarda en Firestore. La ruta se calcula con el servicio público de OSRM y se dibuja en el mapa con distancia, duración y pasos. Selecciona primero una sede, centro o farmacia como destino. OSRM no requiere clave, pero es un servicio público de uso moderado y puede no estar disponible.

## Panel farmacéutico

El panel tiene dos pestañas:

- **Venta directa**: registra ventas de mostrador para personas que no están registradas como pacientes. Cada venta se guarda en `pharmacySales` con productos, cantidades, precios, total, forma de pago y datos opcionales del cliente. No descuenta inventario porque el proyecto todavía no tiene una colección de existencias.
- **Asegurados**: busca pacientes registrados por nombre completo, correo o carnet para entregar las recetas que solicitaron en esa farmacia. El buscador usa el campo `carnet` de `users/{uid}`; si no existe, también puede encontrar al paciente por nombre o correo.

El panel de administración rellena `carnet`, `name` y `email` al crear pacientes. Para pacientes antiguos creados a mano, agrega el campo `carnet` a `users/{uid}` (por ejemplo, `"carnet": "12345678"`). La búsqueda por correo usa `email` y la búsqueda por nombre usa `name`. Las reglas permiten que un farmacéutico activo lea únicamente perfiles con `role: "patient"`; no puede leer perfiles de otro personal. Despliega las reglas después de actualizarlas:

```sh
firebase deploy --only firestore:rules
```

## Chat de soporte con Telegram

El chat está en `/chat` y requiere una sesión activa de paciente. Los mensajes llegan al chat de Telegram configurado y el equipo puede responder usando la opción **Responder** sobre el mensaje reenviado. El puente usa `bot.py` como único proceso que recibe actualizaciones de Telegram.

Configura estas variables en `.env` para ambos procesos:

```env
tokenTelegram=token_del_bot
chatIdTelegram=id_del_chat_de_soporte
CHAT_BRIDGE_SECRET=un_secreto_compartido_largo
APP_BASE_URL=http://127.0.0.1:5000
```

Para el bot de atención Gemini también configura `apiGoogle` (o `GEMINI_API_KEY`). El bot usa la información de `chat/informacion.txt`. No incluyas datos de identidad ni información médica sensible en el chat.

```sh
python -m pip install -r requirements.txt
python app.py
```

En otra terminal:

```sh
python -m pip install -r requirements-bot.txt
python bot.py
```

En producción, configura la URL pública de la aplicación en `APP_BASE_URL` y usa un servidor con soporte Socket.IO, por ejemplo `gunicorn -w 1 --threads 100 app:app`. El servidor web y el bot se ejecutan por separado.
