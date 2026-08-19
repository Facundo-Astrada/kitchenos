# Capturas de la hoja de OPS (Modo Control)

Las usa `docs/ops-modo-control-una-hoja.src.html`. Procedimiento completo de
este tipo de hoja: skill `hoja-instructiva`.

```bash
node scripts/build-hoja.mjs docs/ops-modo-control-una-hoja.src.html         # empotra CSS + capturas
node scripts/hoja-check.mjs docs/ops-modo-control-una-hoja.html --pdf       # A4, alineaciones, anillos + PDF
```

Se sacaron de **producción con la cuenta de cocina de Bros** (`cocina@broscomedor.com`),
en mobile, con Modo Control prendido por `localStorage`. Para regenerarlas —cuando cambie
la UI o se quiera otro restaurante— correr estos comandos tal cual:

```bash
# base común
S='node scripts/shot.mjs --viewport mobile --email cocina@broscomedor.com --pass BrosCocina2026!'
MISE='--ruta /operaciones?tab=mise --ls checklist_modo_control=true||kc_ops_welcomed=1 --wait 2500'

# La fila blanca (hero) y sus tres botones, recortados de la misma fila
$S $MISE --click "text=Parrilla >> visible=true" --clip "8,568,374,52"  --out docs/shots/mc-fila-blanca.png
$S $MISE --click "text=Parrilla >> visible=true" --clip "20,578,36,36"  --out docs/shots/btn-circulo.png
$S $MISE --click "text=Parrilla >> visible=true" --clip "297,576,38,38" --out docs/shots/btn-codigo.png
$S $MISE --click "text=Parrilla >> visible=true" --clip "331,576,38,38" --out docs/shots/btn-mas.png

# Los tres colores (verde / ámbar / blanca) y el header con el botón de Modo Control
$S $MISE --click "text=Parrilla >> visible=true" --clip "8,380,374,240" --out docs/shots/mc-filas.png
$S $MISE --click "text=Parrilla >> visible=true" --clip "0,88,390,80"   --out docs/shots/mc-header.png

# El pase de turno — aviso "te dejaron en producción" en la plaza General
$S $MISE --click "text=General >> visible=true"  --clip "8,248,374,230" --out docs/shots/mc-pase.png

# Una columna de Producción con tareas (scroll para que el FAB del Coach no la tape)
$S --ruta /operaciones?tab=produccion --ls kc_ops_welcomed=1 --scroll 370 --wait 1500 \
   --clip "8,234,374,268" --out docs/shots/prod-columna.png
```

**Ojo con los recortes por coordenadas:** los `--clip` están atados a lo que había
cargado ese día (qué ítem cae en cada fila, cuántas tareas tiene Calientes). Si la
lista cambió, sacar primero la pantalla completa sin `--clip`, mirarla, y recalcular
los números — las coordenadas van en píxeles CSS, o sea la mitad de los del PNG,
que sale a 2x.

**No tocar datos de Bros:** es la cuenta real del cliente. Solo navegar y fotografiar
— nada de tildar ítems ni crear tareas para "armar" una captura mejor.
