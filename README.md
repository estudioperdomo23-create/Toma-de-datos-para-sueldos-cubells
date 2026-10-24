# Horas por obra — Cubells

Los trabajadores cargan desde el celular las horas de la quincena en cada obra, y la planilla
arma sola el resumen por obra con los conceptos para sueldos.

![Formulario en el celular](docs/formulario.png)

## Cómo funciona

1. **Pedir las horas.** Desde la planilla (menú **Horas → 1. Preparar mensajes de WhatsApp**) se
   genera el mensaje con el link. Se manda por WhatsApp: al grupo, o a cada trabajador con un
   botón **Enviar** que abre WhatsApp con el mensaje ya escrito.
2. **El trabajador responde.** Toca el link y se abre el formulario. Elige su nombre, marca una o
   varias obras y pone las horas de cada una. Si el total no coincide con el horario normal de la
   quincena, se le avisa antes de enviar. Si se equivocó, puede volver a entrar y corregir: la
   respuesta nueva reemplaza a la anterior.
3. **Descargar el resumen.** En la hoja **Control** se ve quién falta responder. Cuando están
   todos, **Horas → 3. Descargar Excel**.

### Conceptos

| Concepto | Cálculo (por trabajador y por obra) |
|---|---|
| Ropa | horas |
| Transporte | horas |
| Herramientas | horas |
| Ticket alimentación | horas ÷ 8 |
| Descanso pago | horas ÷ 8 |
| Viático | horas ÷ 8 |

**Horario normal:** lunes a jueves 9 h, viernes 8 h. Se usa para controlar el total de cada
trabajador (hoja **Control**). Los feriados que se anotan en **Configuración** no se cuentan.

### Hojas de la planilla

| Hoja | Para qué |
|---|---|
| Configuración | Fechas de la quincena, link del formulario, texto del mensaje, feriados. |
| Obras | Lista de obras. Solo aparecen en el formulario las que tienen **Activa** tildada. |
| Trabajadores | Nombre, celular y **Activo**. La herramienta completa el código, el link personal y el botón **Enviar**. |
| Respuestas | Todo lo que mandan los trabajadores (un renglón por obra). Queda el historial de todas las quincenas. |
| Resumen por obra | Suma de todos los trabajadores por obra, con los conceptos y el total. |
| Detalle por trabajador | Horas y conceptos de cada trabajador en cada obra. |
| Control | Quién respondió, horas cargadas contra horas normales de la quincena. |

## Instalación (una sola vez, unos 10 minutos)

Hace falta una cuenta de Google. Todo es gratis.

1. **Crear la planilla.** Entrar a [sheets.new](https://sheets.new) y ponerle un nombre, por
   ejemplo *Horas por obra*.
2. **Pegar el código.** En la planilla: **Extensiones → Apps Script**.
   - En el archivo `Código.gs`, borrar todo y pegar el contenido de
     [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
   - Tocar **+** → **HTML**, nombrarlo `Formulario` (exactamente así) y pegar el contenido de
     [`apps-script/Formulario.html`](apps-script/Formulario.html).
   - Guardar (ícono de disquete).
3. **Instalar las hojas.** Arriba, elegir la función `instalar` y tocar **Ejecutar**. Google pide
   permiso la primera vez: *Revisar permisos* → elegir la cuenta → *Configuración avanzada* →
   *Ir a … (no seguro)* → *Permitir*. Es normal: el código es tuyo y no lo verificó Google.
4. **Publicar el formulario.** **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario** (así los trabajadores no necesitan cuenta de Google)
   - **Implementar** y copiar la **URL de la aplicación web** (termina en `/exec`).
5. **Pegar el link.** Volver a la planilla (recargarla para que aparezca el menú **Horas**). En la
   hoja **Configuración**, pegar la URL en *Link del formulario*.
6. **Cargar los datos.** Completar las hojas **Obras** y **Trabajadores** (tildar *Activa* /
   *Activo*). El celular puede ir como `099123456`; se completa el 598 solo. Borrar los renglones
   de ejemplo.

## Uso cada quincena

1. **Horas → Pasar a la quincena siguiente** (o cambiar las fechas en **Configuración**). Anotar
   los feriados de la quincena, si hay.
2. **Horas → 1. Preparar mensajes de WhatsApp**.
   - *Al grupo:* copiar el mensaje que aparece y pegarlo en el grupo. Cada uno elige su nombre.
   - *A cada uno:* en **Trabajadores**, tocar **Enviar** en cada fila. Con el link personal el
     formulario ya sabe quién es y nadie puede cargar por otro.
3. Mirar la hoja **Control** para ver quién falta y recordarle.
4. **Horas → 3. Descargar Excel**.

Las respuestas de quincenas anteriores no se pierden: para ver de nuevo un resumen viejo, poner
esas fechas en **Configuración** y usar **Horas → 2. Actualizar resumen**.

## Cambios en el código

Si se modifica `Codigo.gs` o `Formulario.html` después de publicar: **Implementar → Gestionar
implementaciones → ✏️ → Versión: Nueva versión → Implementar**. La URL no cambia.

Pruebas automáticas (simulan la planilla): `npm test` (Node 18 o superior).
