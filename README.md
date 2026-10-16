# MEDISYNC

## Administración de personal y sedes

El panel de administración usa Firebase Authentication y Cloud Firestore desde el navegador. Configura las variables Firebase del archivo de entorno que consume `app.py` y habilita el proveedor **Correo electrónico/contraseña** en Firebase Authentication.

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

Las cuentas creadas desde el panel reciben acceso por correo y contraseña. El personal se desactiva con baja lógica: su acceso se bloquea en el siguiente inicio de sesión y el perfil se conserva para el historial. Las sedes se guardan en `locations`; las coordenadas se eligen con un clic en el mapa. La disponibilidad se calcula a partir de los periodos de vacaciones del perfil.

Las reglas requieren que los documentos de personal estén en `users` y que el documento del usuario autenticado tenga `role: "admin"`. Revisa las reglas si el proyecto ya tiene políticas para otras colecciones antes de desplegarlas.
