# MEDISYNC

## Administración de personal y sedes

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

Las cuentas creadas desde el panel reciben acceso por correo y contraseña. El personal se desactiva con baja lógica: el acceso al panel se bloquea en la siguiente solicitud y el perfil se conserva para el historial. Las sedes se guardan en `locations`; las coordenadas se eligen con un clic en el mapa. La disponibilidad se calcula a partir de los periodos de vacaciones del perfil.

Las reglas requieren que los documentos de personal estén en `users` y que el documento del usuario autenticado tenga `role: "admin"`. Revisa las reglas si el proyecto ya tiene políticas para otras colecciones antes de desplegarlas.

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
pip install -r requirements.txt
python app.py
```

En otra terminal:

```sh
pip install -r requirements-bot.txt
python bot.py
```

En producción, configura la URL pública de la aplicación en `APP_BASE_URL` y usa un servidor con soporte Socket.IO, por ejemplo `gunicorn -w 1 --threads 100 app:app`. El servidor web y el bot se ejecutan por separado.
