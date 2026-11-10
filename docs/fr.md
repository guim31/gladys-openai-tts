# Voix compatible OpenAI

Donne à Gladys la voix de n'importe quel serveur qui parle l'**API vocale
d'OpenAI** (`POST /v1/audio/speech`) : **Kokoro** chez vous avec
[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI), LocalAI, Speaches,
openedai-speech… ou **OpenAI** lui-même avec votre clé d'API. Les annonces des
scènes sont prononcées par cette voix sur vos enceintes.

## Ce que vous obtenez

- Une **voix pour Gladys** (Gladys 5.3.0 ou plus récent) : une fois choisie,
  l'action de scène **Parler sur une enceinte** parle avec votre serveur sur
  vos enceintes (Sonos, Google Cast, AirPlay…).
- **Une voix par langue** de Gladys (français, anglais, allemand, espagnol) :
  chaque utilisateur entend la voix de sa langue. Une langue laissée vide
  emprunte la voix d'une autre.
- Vitesse, format audio (MP3, Opus, AAC, WAV) et, avec `gpt-4o-mini-tts`, un
  **style de parole** (« Parle calmement et chaleureusement »).
- Les boutons **Tester la voix** et **Afficher les voix** dans la
  configuration.
- Deux déclencheurs de scène : **Serveur de voix indisponible** et **Serveur
  de voix revenu**, par exemple pour être prévenu quand les annonces ne
  peuvent plus être dites.

## Avant de commencer

- **Kokoro (local, gratuit)** : lancez l'image Docker de Kokoro-FastAPI sur une
  machine de votre réseau, par exemple
  `docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu` (ou l'image
  `-gpu` avec une carte NVIDIA). Les textes restent chez vous. Kokoro a des
  voix françaises, anglaises, espagnoles, italiennes, portugaises, hindi,
  japonaises et chinoises, mais **aucune voix allemande**.
- **OpenAI (cloud, payant)** : une clé d'API de
  [platform.openai.com](https://platform.openai.com/api-keys) avec du crédit.
  Chaque texte prononcé part chez OpenAI et est facturé au caractère, selon
  les conditions d'OpenAI. **Cette intégration n'a pas été testée contre
  OpenAI** (aucune clé utilisée) : elle suit la documentation de l'API, vos
  retours sont bienvenus.
- Autres serveurs (LocalAI, Speaches…) : prenez l'adresse, le modèle et les
  noms de voix que donne leur documentation.
- Sans lien avec OpenAI, ni avec les projets Kokoro, LocalAI ou Speaches.

## Configuration

1. Installez l'intégration, puis ouvrez son onglet **Configuration**.
2. **Adresse du serveur** : l'adresse de l'API, terminée par `/v1`, par
   exemple `http://<hôte>:8880/v1` pour Kokoro-FastAPI, ou
   `https://api.openai.com/v1`. Un simple `hôte:port` est complété par
   `http://` et `/v1`.
3. **Clé d'API** : obligatoire chez OpenAI, vide pour un serveur local sans
   clé.
4. **Modèle** : `kokoro` pour Kokoro-FastAPI ; `tts-1`, `tts-1-hd` ou
   `gpt-4o-mini-tts` chez OpenAI.
5. **Voix** : une par langue. Kokoro : `ff_siwis` (français), `af_heart` ou
   `bf_emma` (anglais), `ef_dora` (espagnol). OpenAI : `alloy`, `coral`,
   `nova`, `sage`… (chacune parle toutes les langues). Laissez une langue vide
   pour utiliser la voix d'une autre (le français d'abord).
6. **Vitesse**, **Format audio** (MP3 par défaut) et, pour `gpt-4o-mini-tts`
   seulement, **Style de parole**.
7. Enregistrez, puis appuyez sur **Afficher les voix** pour voir ce que le
   serveur propose, et sur **Tester la voix** pour vérifier qu'un clip revient
   (taille et durée ; le bouton ne le joue pas).
8. Ouvrez **Intégrations → Intelligence artificielle** et choisissez cette
   intégration dans la carte **Voix**.

## Utilisation dans les scènes

Ajoutez une action **Parler sur une enceinte** à une scène, choisissez une
enceinte et tapez le texte. Gladys demande le clip à cette intégration, puis le
sert à l'enceinte sur votre réseau local.

Les déclencheurs **Serveur de voix indisponible** (le serveur ne répond plus,
refuse la clé ou les requêtes) et **Serveur de voix revenu** lancent une
scène, par exemple pour vous envoyer un message. Le serveur est vérifié toutes
les 5 minutes et à chaque annonce.

L'assistant vocal de Gladys reste en texte seul avec une intégration de voix :
sa page tourne en HTTPS, et le clip est servi sur le réseau local en HTTP, ce
que le navigateur bloque. C'est une limite de Gladys, la même pour toutes les
intégrations de voix.

## Limites

- **Gladys attend 30 secondes** le clip. Kokoro sur **processeur** est lent :
  sur un mini-PC à 4 cœurs, environ 4 s pour une phrase courte et 3 minutes
  pour les 2 000 caractères que Gladys envoie au plus. Gardez des annonces de
  **moins de 250 caractères environ** sur processeur, ou utilisez une carte
  graphique. Un texte qui dépasse le temps échoue sans marquer le serveur
  indisponible.
- Gladys refuse les clips de **plus de 5 Mo** : environ 100 secondes en WAV.
  Le MP3 et l'Opus conviennent à tous les textes.
- Un clip déjà fait (même texte et même voix) est gardé en mémoire (les 16
  derniers), et une annonce sur plusieurs enceintes n'interroge le serveur
  qu'une fois.
- Seuls les champs de l'API d'OpenAI sont envoyés : les options propres à
  Kokoro (mélanges de voix, `lang_code`) ne sont pas proposées.

## Dépannage

- La **Supervision** indique si le serveur répond, le modèle utilisé, et le
  modèle ou les voix que le serveur ne liste pas.
- Une annonce ratée est écrite dans les **journaux** de l'intégration, avec la
  raison donnée par le serveur (voix inconnue, clé refusée, crédit épuisé…).
  Le texte prononcé et la clé n'y sont jamais écrits.
- « Ne connaît pas cette adresse » : vérifiez que l'adresse finit par `/v1`.
- Plus de détails en debug : passez le niveau de journal de l'intégration en
  debug.
