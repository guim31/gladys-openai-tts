# OpenAI-kompatible Stimme

Gibt Gladys die Stimme jedes Servers, der die **Sprach-API von OpenAI**
spricht (`POST /v1/audio/speech`): **Kokoro** bei dir zu Hause mit
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI), LocalAI, Speaches,
openedai-speech… oder **OpenAI** selbst mit deinem API-Schlüssel. Die
Durchsagen der Szenen werden mit dieser Stimme auf deinen Lautsprechern
gesprochen.

## Was du bekommst

- Eine **Stimme für Gladys** (Gladys 5.3.0 oder neuer): Einmal ausgewählt,
  spricht die Szenenaktion **Auf einem Lautsprecher sprechen** mit deinem
  Server auf deinen Lautsprechern (Sonos, Google Cast, AirPlay…).
- **Eine Stimme pro Sprache** von Gladys (Französisch, Englisch, Deutsch,
  Spanisch): Jeder Benutzer hört die Stimme seiner Sprache. Eine leer
  gelassene Sprache leiht sich die Stimme einer anderen.
- Geschwindigkeit, Audioformat (MP3, Opus, AAC, WAV) und mit
  `gpt-4o-mini-tts` ein **Sprechstil** („Sprich ruhig und herzlich“).
- Die Tasten **Stimme testen** und **Stimmen anzeigen** in der Konfiguration.
- Zwei Szenenauslöser: **Sprachserver nicht verfügbar** und **Sprachserver
  wieder da**, zum Beispiel um gewarnt zu werden, wenn Durchsagen nicht mehr
  gesprochen werden können.

## Bevor du anfängst

- **Kokoro (lokal, kostenlos)**: Starte das Docker-Image von Kokoro-FastAPI
  auf einem Rechner in deinem Netzwerk, zum Beispiel
  `docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu` (oder das
  Image `-gpu` mit einer NVIDIA-Karte). Die Texte bleiben bei dir. Kokoro hat
  französische, englische, spanische, italienische, portugiesische, Hindi-,
  japanische und chinesische Stimmen, aber **keine deutsche Stimme**.
- **OpenAI (Cloud, kostenpflichtig)**: ein API-Schlüssel von
  [platform.openai.com](https://platform.openai.com/api-keys) mit Guthaben.
  Jeder gesprochene Text geht an OpenAI und wird pro Zeichen berechnet, nach
  den Bedingungen von OpenAI. **Diese Integration wurde nicht mit OpenAI
  getestet** (kein Schlüssel verwendet): Die Integration folgt der API-Dokumentation,
  Rückmeldungen sind willkommen.
- Andere Server (LocalAI, Speaches…): Nimm die Adresse, das Modell und die
  Stimmennamen aus ihrer Dokumentation.
- Nicht verbunden mit OpenAI, noch mit den Projekten Kokoro, LocalAI oder
  Speaches.

## Konfiguration

1. Installiere die Integration und öffne dann ihren Reiter **Konfiguration**.
2. **Serveradresse**: die Adresse der API, endet auf `/v1`, zum Beispiel
   `http://<Host>:8880/v1` für Kokoro-FastAPI oder
   `https://api.openai.com/v1`. Ein einfaches `Host:Port` wird mit `http://`
   und `/v1` ergänzt.
3. **API-Schlüssel**: bei OpenAI erforderlich, leer für einen lokalen Server
   ohne Schlüssel.
4. **Modell**: `kokoro` für Kokoro-FastAPI; `tts-1`, `tts-1-hd` oder
   `gpt-4o-mini-tts` bei OpenAI.
5. **Stimmen**: eine pro Sprache. Kokoro: `ff_siwis` (Französisch),
   `af_heart` oder `bf_emma` (Englisch), `ef_dora` (Spanisch). OpenAI:
   `alloy`, `coral`, `nova`, `sage`… (jede spricht alle Sprachen). Lass eine
   Sprache leer, um die Stimme einer anderen zu verwenden (zuerst
   Französisch).
6. **Geschwindigkeit**, **Audioformat** (standardmäßig MP3) und, nur für
   `gpt-4o-mini-tts`, **Sprechstil**.
7. Speichere und drücke dann **Stimmen anzeigen**, um zu sehen, was der
   Server anbietet, und **Stimme testen**, um zu prüfen, dass ein Clip
   zurückkommt (Größe und Dauer; die Taste spielt ihn nicht ab).
8. Öffne **Integrationen → Künstliche Intelligenz** und wähle diese
   Integration in der Karte **Stimme**.

## In Szenen verwenden

Füge einer Szene eine Aktion **Auf einem Lautsprecher sprechen** hinzu, wähle
einen Lautsprecher und gib den Text ein. Gladys fragt diese Integration nach
dem Clip und liefert ihn dann im lokalen Netzwerk an den Lautsprecher.

Die Auslöser **Sprachserver nicht verfügbar** (der Server antwortet nicht
mehr, lehnt den Schlüssel oder die Anfragen ab) und **Sprachserver wieder da**
starten eine Szene, zum Beispiel um dir eine Nachricht zu schicken. Der Server
wird alle 5 Minuten und bei jeder Durchsage geprüft.

Der Sprachassistent von Gladys bleibt mit einer Sprachintegration reiner
Text: Seine Seite läuft über HTTPS, und der Clip wird im lokalen Netzwerk über
HTTP geliefert, was der Browser blockiert. Das ist eine Grenze von Gladys, für
jede Sprachintegration gleich.

## Grenzen

- **Gladys wartet 30 Sekunden** auf den Clip. Kokoro auf einem **Prozessor**
  ist langsam: Auf einem Mini-PC mit 4 Kernen etwa 4 s für einen kurzen Satz
  und 3 Minuten für die höchstens 2.000 Zeichen, die Gladys sendet. Halte
  Durchsagen auf einem Prozessor **unter etwa 250 Zeichen** oder verwende
  eine Grafikkarte. Ein Text, der die Zeit überschreitet, schlägt fehl, ohne
  den Server als nicht verfügbar zu markieren.
- Gladys lehnt Clips **über 5 MB** ab: etwa 100 Sekunden in WAV. MP3 und
  Opus passen für jeden Text.
- Ein bereits erzeugter Clip (gleicher Text und gleiche Stimme) bleibt im
  Speicher (die 16 letzten), und eine Durchsage auf mehreren Lautsprechern
  fragt den Server nur einmal.
- Es werden nur die Felder der OpenAI-API gesendet: Kokoro-eigene Optionen
  (Stimmenmischungen, `lang_code`) werden nicht angeboten.

## Fehlerbehebung

- Die **Supervision** zeigt, ob der Server antwortet, das verwendete Modell
  und das Modell oder die Stimmen, die der Server nicht auflistet.
- Eine fehlgeschlagene Durchsage steht in den **Logs** der Integration, mit
  dem Grund, den der Server angibt (unbekannte Stimme, abgelehnter Schlüssel,
  aufgebrauchtes Guthaben…). Der gesprochene Text und der Schlüssel werden nie
  geschrieben.
- „Kennt diese Adresse nicht“: Prüfe, ob die Adresse auf `/v1` endet.
- Mehr Details im Debug: Stell die Protokollstufe der Integration auf Debug.
