# Toma de datos para sueldos — Cubells

Herramienta para pasar las horas que los funcionarios mandan por WhatsApp a una planilla Excel.

Se abre en el navegador, al lado de WhatsApp Web. **No necesita instalación ni internet**, y los
mensajes no salen de la computadora.

## Uso

1. Descargar esta carpeta y abrir `index.html` con doble clic (Chrome, Edge o Firefox).
2. En **WhatsApp Web**, abrir el chat o grupo de las horas, seleccionar con el mouse los mensajes del
   período (desde el primero hasta el último) y copiar con `Ctrl+C`.
3. Pegar en el cuadro **Mensajes de WhatsApp** y tocar **Reconocer horas**.
   - También se puede cargar un chat exportado desde el celular (*Exportar chat → Sin archivos*, `.txt`).
   - Opcional: elegir el período (desde / hasta) para quedarse solo con esa quincena o mes.
4. Revisar la tabla. Las filas en amarillo (**Revisar**) son las que la herramienta no pudo entender del
   todo; se pueden corregir directamente en la tabla, o destildar **Incluir** para dejarlas afuera.
5. **Descargar Excel**. Para seguir sumando a una planilla anterior, cargarla primero en el paso 3: los
   registros nuevos se agregan y los que ya estaban no se repiten.

## Qué entiende

Cada funcionario puede escribir a su manera. Ejemplos que reconoce:

| Mensaje                                  | Resultado                          |
|------------------------------------------|------------------------------------|
| `7 a 16` · `de 7:30 a 15:45` · `7hs-16hs` | entrada, salida y horas            |
| `Entré 7 salí 16` · `entrada 6.30 salida 15` | entrada, salida y horas         |
| `de 7 a 4`                               | entiende 7 a 16                    |
| `desde las 22 hasta las 6`               | turno nocturno (8 horas)           |
| `8 horas` · `9 hs` · `8,5 hs` · `8 horas y media` | total de horas            |
| `7 a 16 con 30 min de almuerzo`          | descuenta el descanso (8,5 horas)  |
| `21/10` · `21 de octubre` · `lunes` · `ayer` · `hoy` | fecha del trabajo      |
| Varios días en un mensaje (uno por renglón, o separados por coma) | un registro por día |

Si el mensaje no dice la fecha, se usa el día en que se mandó (y se aclara en *Observación*).

Se marca **Revisar** cuando:
- falta la hora de entrada o de salida;
- el total indicado no coincide con el horario (`7 a 16 (8 horas)`);
- el día de la semana no coincide con la fecha (`Lunes 21/10` cuando el 21/10 es miércoles);
- hay más de un registro del mismo funcionario el mismo día (posible corrección);
- son más de 16 horas, o la fecha es posterior al mensaje;
- el mensaje parece hablar de horas pero no se pudo interpretar.

Los mensajes que no hablan de horas ("ok", "gracias", fotos) se ignoran.

## La planilla Excel

| Hoja        | Contenido |
|-------------|-----------|
| **Resumen** | Por funcionario: días con horas, total de horas y registros a revisar. |
| **Planilla**| Grilla funcionario × día, con total por funcionario. |
| **Registros** | Un renglón por funcionario y día, con el mensaje original. Es la base: se puede editar a mano. |

*Resumen* y *Planilla* son fórmulas sobre *Registros*, así que cualquier corrección o fila agregada a
mano en *Registros* se refleja sola.

## Desarrollo

- `parser.js` — reconoce mensajes y horas.
- `excel.js` — lee y escribe la planilla.
- `app.js`, `index.html` — la pantalla.
- `lib/xlsx.full.min.js` — [SheetJS](https://sheetjs.com) 0.18.5 (Apache-2.0), incluida para funcionar sin internet.

Pruebas: `npm test` (Node 18 o superior).
