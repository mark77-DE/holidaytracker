# Holidaytracker

Erste Ausbaustufe: Landing Page, Anmeldung, Admin-Einladungen und der bestehende Poster-Editor. Die Datenbank liegt in einem persistenten Docker-Volume.

## Erster Start mit Docker Desktop

1. Kopiere .env.example nach .env, zum Beispiel mit Copy-Item .env.example .env in PowerShell.
2. Öffne .env und trage BOOTSTRAP_ADMIN_EMAIL sowie ein starkes Passwort mit mindestens 12 Zeichen bei BOOTSTRAP_ADMIN_PASSWORD ein. Setze das Passwort in einfache Anführungszeichen, wenn es ein Dollarzeichen enthält.
3. Im Repo-Ordner starten: docker compose up --build -d
4. Öffne http://localhost:8080 und melde dich mit den Admin-Zugangsdaten an.

Das erste Admin-Konto wird nur angelegt, wenn die Datenbank noch keine Nutzer enthält. Danach kannst du im angemeldeten Bereich Einladungen an einzelne E-Mail-Adressen erstellen. Der Link ist sieben Tage gültig, einmal nutzbar und kann kopiert sowie widerrufen werden. Teile ihn direkt mit der Person; ein Mailserver ist nicht erforderlich.

## Stoppen und Aktualisieren

docker compose down
docker compose up --build -d

docker compose down lässt das Daten-Volume bestehen. Zum Sichern kannst du in Docker Desktop das Volume holidaytracker_holidaytracker-data exportieren oder den Stack auf ein Docker-Backup umstellen. Ein docker compose down -v löscht die Datenbank und sollte nur verwendet werden, wenn du wirklich alle Konten und Einladungen entfernen willst.

## Hinweise

- Nur der Webserver veröffentlicht einen Port. Die API ist nur im internen Docker-Netz erreichbar.
- Anmeldesitzungen laufen nach sieben Tagen ab. Passwörter werden mit scrypt gespeichert; Session-Cookies sind HttpOnly und SameSite=Strict.
- Für den Zugriff von außen HTTPS über einen Reverse Proxy aktivieren. Bei HTTPS setzt die API das Cookie-Attribut Secure.
- Der Poster-Editor unter /poster.html ist hinter der Anmeldung. Seine aktuellen GPX-Dateien verbleiben weiterhin im Browser; die Urlaubs-, Tagebuch- und GPX-Verwaltung folgt in weiteren Schritten.
- Die vorhandenen Rechtstexte stammen aus dem Wander-Poster-Projekt und sollten vor einer Veröffentlichung auf Holidaytracker angepasst werden.
