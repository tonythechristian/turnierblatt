# Turnierblatt

Eine Web-App für Tischtennis-Turniere: Jeder-gegen-jeden, Teamwettbewerb,
Gruppen + KO und das BTTV TT-Race im Schweizer System.

**Testversion.** Jeder-gegen-jeden und Teamwettbewerb sind fertig gestaltet.
Gruppen + KO und die Live-Ansichten funktionieren, sind optisch aber noch
nicht überarbeitet.

## Benutzen

Die Seite öffnen — mehr ist nicht nötig. Es gibt keinen Server und kein Konto.

## Wo die Daten liegen

Alles bleibt im Browser des jeweiligen Geräts (localStorage). Nichts wird
hochgeladen, nichts geteilt. Wer die Seite öffnet, bekommt seinen eigenen,
leeren Stand — auch zwei Personen am selben Turnier sehen die Eingaben des
anderen nicht.

Zum Übertragen auf ein anderes Gerät: unter „Alle Turniere" in der
Randspalte „Backup sichern" und dort wieder „Backup laden". Nach jeder
vollständig erfassten Runde legt die App zusätzlich automatisch ein Backup an.

## Ergebnisse eintragen

Ein Feld je Spiel. Entweder das Gesamtergebnis direkt (`3:1`) oder die
Satzpunkte — kurz oder ausgeschrieben:

- `8, 3, 5` wird mit Enter zu `3:0` mit den Sätzen 11:8, 11:3, 11:5
- `-9` bedeutet einen verlorenen Satz 9:11
- `11:9` geht genauso

Unter dem Feld steht beim Tippen, was Enter übernehmen wird.

## Schriften

Cormorant Garamond und Lora, beide unter der SIL Open Font License 1.1
(https://openfontlicense.org). Sie liegen im Repo, damit die App ohne
Internet läuft.
