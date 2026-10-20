# MVcardetail

Sitio de **MV Professional Car Detail & Supplies**: landing, reservas con disponibilidad en vivo y panel de admin.
Estático (HTML + JS sin build) en Vercel, datos en Supabase y automatizaciones en n8n.

| Página | Ruta | Qué hace |
|---|---|---|
| Landing | `/` | Precios desde la base de datos, oferta de primera visita, galería, horarios, WhatsApp |
| Booking | `/booking` | Carro 3D que muestra cada nivel de servicio, horarios en vivo, animación de confirmación, recordatorio |
| Admin | `/admin` | Reservas, precios y descripciones, oferta, fotos (subida con redimensionado), testimonios |
| Recordatorio | `/api/ics` | Archivo de calendario con alarmas (1 día y 2 h antes); en iPhone abre "Añadir al calendario" |

## Editor del sitio (admin → Site editor)

Cambios con vista previa en vivo (teléfono o escritorio); nada se publica hasta tocar **Save & publish**.

- **Clic para editar**: en la vista previa, al pasar el mouse se marca lo editable; un clic abre arriba sus opciones (tarjeta de servicio: nombre, precios por tamaño, duración, foto, "Most popular", mover u ocultar; tarjeta propia; texto; sección).
- **Diseño** (todo el sitio): logo (subir uno nuevo o volver al de MV; cambia también el ícono de la pestaña), colores de acento, destacado, fondo, tarjetas y texto; fuente de títulos y de texto; títulos en mayúsculas; redondeo de esquinas.
- **Home**: cualquier texto con editor (negrita, cursiva, color de acento, enlaces); orden y visibilidad de secciones; orden, visibilidad y tarjetas nuevas (título, texto, botón, enlace, foto, ícono); bloques propios de texto o de botones.
- **Booking**: orden de los pasos (se renumeran solos) y secciones, ocultar el paso del vehículo, el carro 3D o la galería, títulos y botones, bloques propios de texto o botones en cualquier posición. Los pasos obligatorios no se pueden ocultar.

Se guarda en `mvcd_settings` (`theme`, `page_home`, `page_booking`). Para que algo nuevo del HTML sea editable basta con marcarlo: `data-edit="clave" data-label="Nombre"` para textos y `data-block="id" data-label="Nombre"` para secciones (dentro del contenedor `[data-blocks]`); `assets/site.js` hace el resto.

## Cómo funciona una reserva

1. El cliente elige un horario. Los horarios ocupados vienen de `mvcd_slots` (reservas web + eventos de Google Calendar) y se actualizan en tiempo real (Supabase Realtime).
2. `mvcd_book()` (Postgres) valida horario de atención, que el espacio siga libre (con bloqueo, sin dobles reservas) y calcula el precio en el servidor (incluida la oferta).
3. La página llama al webhook de n8n `mvcd/booking`: crea el evento en Google Calendar (invitación al cliente y al admin) y envía el correo al admin con el diseño de Proyectum IA.
4. El cliente ve la confirmación, activa el recordatorio y puede confirmar por WhatsApp.

Cada trabajo bloquea su duración + 30 min de desplazamiento. Horario (hora del Este): lunes a viernes 8:00–18:30, sábado 9:00–15:00, domingo cerrado. Está en `assets/common.js` (`HOURS`) y en `mvcd_book()`.

## Puesta en marcha

**Supabase** (ya aplicado en el proyecto `proyectumia`; todo lleva el prefijo `mvcd_`): `supabase/schema.sql`.
El usuario admin `mvcardetail01@gmail.com` ya existe. Para cambiar la contraseña: Supabase → Authentication → Users.

**n8n** — importar los 3 archivos de `n8n/` y elegir la credencial en cada nodo marcado:

| Workflow | Disparador | Credenciales |
|---|---|---|
| `mvcd-reserva.workflow.json` | Webhook `POST /webhook/mvcd/booking` | Supabase · Proyectum IA (service role), Marketing Calendar, Marketing proyectum IA |
| `mvcd-cancelacion.workflow.json` | Webhook `POST /webhook/mvcd/cancel` (lo llama el admin al cancelar) | las mismas |
| `mvcd-sync-calendar.workflow.json` | Cada 5 min: eventos de Google Calendar → horarios ocupados en la web | Marketing Calendar, Supabase |

Activar los tres. Los correos y el CTA "Aprende a usar la IA TÚ:" están en `n8n/email.js`; después de editarlo, regenerar con `python n8n/build.py`.
Si el dominio final no es `mvcardetail.com`, cambiar `SITE` en `n8n/email.js` (enlace al panel de admin).

**Vercel** — vincular el repo, sin comando de build. `vercel.json` activa las URLs limpias (`/booking`, `/admin`).

## Desarrollo local

```bash
python -m http.server 5173
```

Abrir `http://localhost:5173/booking.html` (las URLs limpias solo funcionan en Vercel; `/api/ics` también).

## Créditos

Modelo 3D del booking (`models/car.glb`): [Car Concept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept) de Eric Chadwick, Darmstadt Graphics Group, licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modificado: el logo de Khronos de la placa se reemplazó por el de MV y se comprimió con Draco. El crédito visible está al pie de `/booking` y es obligatorio por la licencia.
