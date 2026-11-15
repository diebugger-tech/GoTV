# Go TV: Live-Ansicht und Kalender-Aktualisierung

Bei einer laufenden Übertragung mit zugeordnetem KGS-Brett öffnet **Stream laden**
den offiziellen Player neben dem Brett und dem KGS-Partiechat. Bei mehreren
Brettern wählt die Spieleliste das sichtbare Brett. Schließen oder Tab-Wechsel
gibt ausschließlich die zusätzlich für TV geöffneten KGS-Abonnements frei.
Auf schmalen Bildschirmen stehen Player und Brett untereinander.

Brett und Partiechat erhalten Updates über die vorhandene KGS-Verbindung.
Gezeigt wird der vom Server gelieferte Chatverlauf; YouTube-/Twitch-Chats werden
nicht eingebettet. Ein Stream ohne zugeordnetes KGS-Relais bleibt ein Stream.

## Täglicher Kalender-Import für die Desktop-App

`python3 desktop/install-events-timer.py` installiert und aktiviert einen
systemd-Benutzer-Timer ohne sudo. Er startet sofort einen Import und läuft danach
täglich um 06:15–06:25 Uhr Ortszeit. Verpasste Läufe werden nach dem nächsten
Login nachgeholt (`Persistent=true`); der Rechner muss dafür eingeschaltet sein.

Die bestehenden DGoB-, EGF-Twitch- und EGF-Kalender-Importer aktualisieren
`~/.local/share/gotv/events.json` sowie die Kalenderdateien vorhandener
`build-desktop/`- und `build/`-Verzeichnisse atomar. Ein fehlerhafter Import behält
die bisherigen Daten seiner Quelle bei. Getrackte Quelldateien und Git bleiben
unverändert. Neue Builds erhalten beim nächsten Timer-Lauf wieder aktuelle Daten.

Die Desktop-App lädt bevorzugt ihre lokale Kalenderdatei und prüft spätestens
nach fünf Minuten auf neue Daten. Die TV- und Kalenderansichten prüfen außerdem
minütlich die Zeitfenster, damit Sendebeginn und -ende ohne Neuladen sichtbar sind.
Es werden bestätigte Termine importiert; eine automatische Suche nach beliebigen
neuen Live-Streams ist nicht enthalten.

Status: `systemctl --user status gotv-events.timer`

Protokoll: `journalctl --user -u gotv-events.service -n 50`

Manueller Lauf: `python3 -m tools.refresh_tv_events`

Der bestehende GitHub-Workflow `.github/workflows/update-dgob-events.yml` ist die
alternative Aktualisierung für die Web-Veröffentlichung. Der lokale Timer
benötigt weder GitHub-Zugang noch Push-Rechte.
