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

## MediBot

El chat web de MediBot toma su referencia de `chat/informacion.txt`, que se vuelve a leer en cada consulta. El proveedor y el modelo se configuran por separado en `.env` mediante `AI_PROVIDER` y `AI_MODEL`. La configuración propuesta usa MedGemma 1.5 4B en un endpoint desplegado en Vertex AI: completa `AI_PROJECT_ID`, `AI_LOCATION` y `AI_ENDPOINT_ID`, y configura credenciales de Google Cloud con el permiso `aiplatform.endpoints.predict`. El despliegue del endpoint puede generar cargos de Vertex AI. El servicio también admite cualquier proveedor compatible con OpenAI Chat Completions usando `AI_PROVIDER=openai_compatible`, `AI_BASE_URL` y `AI_API_KEY`. No se guarda historial entre consultas.

Las consultas se envían al proveedor seleccionado. No ingreses datos personales ni información médica sensible. MedGemma es un modelo para desarrolladores enfocado en comprensión de texto e imágenes médicas; Google indica que debe validarse para cada caso de uso y que no se diseñó para dar diagnósticos o tratamientos clínicos directos ([documentación de MedGemma](https://developers.google.com/health-ai-developer-foundations/medgemma), [despliegue](https://developers.google.com/health-ai-developer-foundations/medgemma/get-started)). MediBot ofrece orientación general sobre el prototipo; no diagnostica ni receta. La integración con Telegram queda pendiente.
