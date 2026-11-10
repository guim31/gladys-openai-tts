# Voz compatible con OpenAI

Da a Gladys la voz de cualquier servidor que hable la **API de voz de OpenAI**
(`POST /v1/audio/speech`): **Kokoro** en su casa con
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI), LocalAI, Speaches,
openedai-speech… u **OpenAI** mismo con su clave de API. Los anuncios de las
escenas se pronuncian con esta voz en sus altavoces.

## Lo que obtiene

- Una **voz para Gladys** (Gladys 5.3.0 o posterior): una vez elegida, la
  acción de escena **Hablar en un altavoz** habla con su servidor en sus
  altavoces (Sonos, Google Cast, AirPlay…).
- **Una voz por idioma** de Gladys (francés, inglés, alemán, español): cada
  usuario oye la voz de su idioma. Un idioma dejado vacío toma prestada la
  voz de otro.
- Velocidad, formato de audio (MP3, Opus, AAC, WAV) y, con
  `gpt-4o-mini-tts`, un **estilo de habla** («Habla con calma y calidez»).
- Los botones **Probar la voz** y **Mostrar las voces** en la configuración.
- Dos disparadores de escena: **Servidor de voz no disponible** y **Servidor
  de voz de vuelta**, por ejemplo para ser avisado cuando los anuncios ya no
  pueden pronunciarse.

## Antes de empezar

- **Kokoro (local, gratuito)**: ejecute la imagen Docker de Kokoro-FastAPI en
  una máquina de su red, por ejemplo
  `docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu` (o la imagen
  `-gpu` con una tarjeta NVIDIA). Los textos se quedan en su casa. Kokoro
  tiene voces francesas, inglesas, españolas, italianas, portuguesas, hindi,
  japonesas y chinas, pero **ninguna voz alemana**.
- **OpenAI (nube, de pago)**: una clave de API de
  [platform.openai.com](https://platform.openai.com/api-keys) con crédito.
  Cada texto pronunciado se envía a OpenAI y se factura por carácter, según
  las condiciones de OpenAI. **Esta integración no se ha probado con OpenAI**
  (no se usó ninguna clave): sigue la documentación de la API, sus
  comentarios son bienvenidos.
- Otros servidores (LocalAI, Speaches…): use la dirección, el modelo y los
  nombres de voz que indica su documentación.
- Sin relación con OpenAI, ni con los proyectos Kokoro, LocalAI o Speaches.

## Configuración

1. Instale la integración y abra su pestaña **Configuración**.
2. **Dirección del servidor**: la dirección de la API, terminada en `/v1`, por
   ejemplo `http://<host>:8880/v1` para Kokoro-FastAPI, o
   `https://api.openai.com/v1`. Un simple `host:puerto` se completa con
   `http://` y `/v1`.
3. **Clave de API**: obligatoria en OpenAI, vacía para un servidor local sin
   clave.
4. **Modelo**: `kokoro` para Kokoro-FastAPI; `tts-1`, `tts-1-hd` o
   `gpt-4o-mini-tts` en OpenAI.
5. **Voces**: una por idioma. Kokoro: `ff_siwis` (francés), `af_heart` o
   `bf_emma` (inglés), `ef_dora` (español). OpenAI: `alloy`, `coral`,
   `nova`, `sage`… (cada una habla todos los idiomas). Deje un idioma vacío
   para usar la voz de otro (primero el francés).
6. **Velocidad**, **Formato de audio** (MP3 por defecto) y, solo para
   `gpt-4o-mini-tts`, **Estilo de habla**.
7. Guarde y pulse **Mostrar las voces** para ver lo que ofrece el servidor, y
   **Probar la voz** para comprobar que vuelve un clip (tamaño y duración; el
   botón no lo reproduce).
8. Abra **Integraciones → Inteligencia artificial** y elija esta integración
   en la tarjeta **Voz**.

## Uso en las escenas

Añada una acción **Hablar en un altavoz** a una escena, elija un altavoz y
escriba el texto. Gladys pide el clip a esta integración y luego lo sirve al
altavoz en su red local.

Los disparadores **Servidor de voz no disponible** (el servidor ya no
responde, rechaza la clave o las solicitudes) y **Servidor de voz de vuelta**
inician una escena, por ejemplo para enviarle un mensaje. El servidor se
comprueba cada 5 minutos y en cada anuncio.

El asistente de voz de Gladys sigue siendo solo de texto con una integración
de voz: su página funciona en HTTPS, y el clip se sirve en la red local en
HTTP, lo que el navegador bloquea. Es un límite de Gladys, el mismo para todas
las integraciones de voz.

## Límites

- **Gladys espera 30 segundos** el clip. Kokoro en un **procesador** es lento:
  en un mini PC de 4 núcleos, unos 4 s para una frase corta y 3 minutos para
  los 2.000 caracteres que Gladys envía como máximo. Mantenga los anuncios
  **por debajo de unos 250 caracteres** en un procesador, o use una tarjeta
  gráfica. Un texto que supera el tiempo falla sin marcar el servidor como no
  disponible.
- Gladys rechaza los clips de **más de 5 MB**: unos 100 segundos en WAV. El
  MP3 y el Opus sirven para cualquier texto.
- Un clip ya hecho (mismo texto y misma voz) se guarda en memoria (los 16
  últimos), y un anuncio en varios altavoces solo consulta al servidor una
  vez.
- Solo se envían los campos de la API de OpenAI: las opciones propias de
  Kokoro (mezclas de voces, `lang_code`) no se ofrecen.

## Solución de problemas

- La **Supervisión** indica si el servidor responde, el modelo usado, y el
  modelo o las voces que el servidor no lista.
- Un anuncio fallido se escribe en los **registros** de la integración, con el
  motivo dado por el servidor (voz desconocida, clave rechazada, crédito
  agotado…). El texto pronunciado y la clave nunca se escriben.
- «No conoce esta dirección»: compruebe que la dirección termine en `/v1`.
- Más detalles en debug: ponga el nivel de registro de la integración en
  debug.
