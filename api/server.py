from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

DATA_DIR = os.environ.get("DATA_DIR", "/data")
DB_PATH = os.path.join(DATA_DIR, "holidaytracker.sqlite3")
GPX_DIR = os.path.join(DATA_DIR, "gpx")
MAX_GPX_SIZE = 20 * 1024 * 1024
COOKIE = "holidaytracker_session"
SESSION_TTL = 7 * 24 * 60 * 60
INVITE_TTL = 7 * 24 * 60 * 60
MIN_PASSWORD = 12
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ATTEMPTS = {}
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(GPX_DIR, exist_ok=True)

def now():
    return int(time.time())

def email_key(value):
    return str(value or "").strip().lower()

def valid_email(value):
    return len(value) <= 254 and EMAIL_RE.fullmatch(value) is not None

def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def password_hash(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    hashed = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return salt.hex(), hashed.hex()

def password_ok(password, salt, expected):
    try:
        return hmac.compare_digest(hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt),
            n=2**14, r=8, p=1, dklen=32), bytes.fromhex(expected))
    except (TypeError, ValueError):
        return False

def db_connect():
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=15000")
    return db

def initialize():
    with db_connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
          CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL,
            password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')),
            created_at INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
          );
          CREATE TABLE IF NOT EXISTS sessions(
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS invitations(
            id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
            created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL, used_at INTEGER
          );
          CREATE TABLE IF NOT EXISTS vacations(
            id INTEGER PRIMARY KEY, title TEXT NOT NULL, destination TEXT NOT NULL DEFAULT '',
            start_date TEXT NOT NULL, end_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS tracks(
            id INTEGER PRIMARY KEY, vacation_id INTEGER NOT NULL REFERENCES vacations(id) ON DELETE CASCADE,
            original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, size_bytes INTEGER NOT NULL,
            uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL, uploaded_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS tracks_vacation ON tracks(vacation_id,uploaded_at);
          CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
          CREATE INDEX IF NOT EXISTS invite_email ON invitations(email);
          CREATE INDEX IF NOT EXISTS vacation_dates ON vacations(start_date,end_date);
        """)
        columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
        if "is_active" not in columns:
            db.execute("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))
        if db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            email = email_key(os.environ.get("BOOTSTRAP_ADMIN_EMAIL"))
            password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")
            if not valid_email(email) or len(password) < MIN_PASSWORD:
                raise RuntimeError("Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters for the first start.")
            salt, hashed = password_hash(password)
            db.execute("INSERT INTO users(email,salt,password_hash,role,created_at) VALUES(?,?,?,?,?)",
                (email, salt, hashed, "admin", now()))
            print("Created initial administrator account.", flush=True)

initialize()

def current_user(handler):
    cookies = {}
    for part in handler.headers.get("Cookie", "").split(";"):
        if "=" in part:
            key, value = part.strip().split("=", 1)
            cookies[key] = value
    token = cookies.get(COOKIE, "")
    if not token or len(token) > 256:
        return None
    with db_connect() as db:
        row = db.execute("""SELECT u.id,u.email,u.role,u.is_active,s.expires_at FROM sessions s
            JOIN users u ON u.id=s.user_id WHERE s.token_hash=?""", (digest(token),)).fetchone()
        if not row or row["expires_at"] <= now() or not row["is_active"]:
            if row:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (digest(token),))
            return None
        return {"id": row["id"], "email": row["email"], "role": row["role"]}

def timestamp(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()

class API(BaseHTTPRequestHandler):
    server_version = "HolidaytrackerAPI"

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)

    def json(self, status, payload, headers=None):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 <= size <= 65536:
                return None
            value = json.loads(self.rfile.read(size).decode()) if size else {}
            return value if isinstance(value, dict) else None
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            return None

    def origin_ok(self):
        origin = self.headers.get("Origin", "")
        host = self.headers.get("Host", "")
        proto = self.headers.get("X-Forwarded-Proto", "http").split(",", 1)[0].strip()
        if origin != f"{proto}://{host}":
            self.json(403, {"error": "Ungültige Anfrage."})
            return False
        return True

    def limited(self, key):
        current = now()
        recent = [t for t in ATTEMPTS.get(key, []) if current - t < 300]
        if len(recent) >= 10:
            ATTEMPTS[key] = recent
            return True
        recent.append(current)
        ATTEMPTS[key] = recent
        return False

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path == "/api/auth/check":
            self.send_response(204 if current_user(self) else 401)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
        elif path == "/api/auth/session":
            user = current_user(self)
            self.json(200, {"user": user})
        elif path == "/api/admin/users":
            user = current_user(self)
            if not user or user["role"] != "admin":
                self.json(403, {"error": "Zugriff verweigert."})
                return
            with db_connect() as db:
                rows = db.execute("SELECT id,email,role,is_active,created_at FROM users ORDER BY created_at,id").fetchall()
            self.json(200, {"users": [{"id": r["id"], "email": r["email"], "role": r["role"],
                "active": bool(r["is_active"]), "createdAt": timestamp(r["created_at"])} for r in rows]})
        elif path == "/api/vacations":
            user = current_user(self)
            if not user:
                self.json(401, {"error": "Bitte melde dich an."})
                return
            with db_connect() as db:
                rows = db.execute("SELECT id,title,destination,start_date,end_date,notes,created_at,updated_at FROM vacations ORDER BY start_date DESC,id DESC").fetchall()
            self.json(200, {"vacations": [dict(id=r["id"], title=r["title"], destination=r["destination"],
                startDate=r["start_date"], endDate=r["end_date"], notes=r["notes"],
                createdAt=timestamp(r["created_at"]), updatedAt=timestamp(r["updated_at"])) for r in rows]})
        elif re.fullmatch(r"/api/vacations/(\d+)/tracks", path):
            user = current_user(self)
            if not user:
                self.json(401, {"error": "Bitte melde dich an."})
                return
            vacation_id = int(re.fullmatch(r"/api/vacations/(\d+)/tracks", path).group(1))
            with db_connect() as db:
                if not db.execute("SELECT 1 FROM vacations WHERE id=?", (vacation_id,)).fetchone():
                    self.json(404, {"error": "Urlaub nicht gefunden."})
                    return
                rows = db.execute("SELECT id,original_name,size_bytes,uploaded_at FROM tracks WHERE vacation_id=? ORDER BY uploaded_at,id", (vacation_id,)).fetchall()
            self.json(200, {"tracks": [{"id": r["id"], "filename": r["original_name"], "size": r["size_bytes"], "uploadedAt": timestamp(r["uploaded_at"])} for r in rows]})
        elif re.fullmatch(r"/api/tracks/(\d+)", path):
            user = current_user(self)
            if not user:
                self.json(401, {"error": "Bitte melde dich an."})
                return
            track_id = int(re.fullmatch(r"/api/tracks/(\d+)", path).group(1))
            with db_connect() as db:
                row = db.execute("SELECT original_name,stored_name,size_bytes FROM tracks WHERE id=?", (track_id,)).fetchone()
            if not row:
                self.json(404, {"error": "GPX-Datei nicht gefunden."})
                return
            try:
                with open(os.path.join(GPX_DIR, row["stored_name"]), "rb") as file:
                    content = file.read(MAX_GPX_SIZE + 1)
            except OSError:
                self.json(404, {"error": "GPX-Datei ist auf dem Server nicht verfügbar."})
                return
            if len(content) > MAX_GPX_SIZE:
                self.json(500, {"error": "Die gespeicherte GPX-Datei ist zu groß."})
                return
            fallback = re.sub(r"[^A-Za-z0-9._-]", "_", row["original_name"]) or "track.gpx"
            self.send_response(200)
            self.send_header("Content-Type", "application/gpx+xml; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Content-Disposition", "attachment; filename=""+fallback+""; filename*=UTF-8''"+quote(row["original_name"], safe=""))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(content)
        elif path == "/api/admin/invitations":
            user = current_user(self)
            if not user or user["role"] != "admin":
                self.json(403, {"error": "Zugriff verweigert."})
                return
            with db_connect() as db:
                rows = db.execute("""SELECT id,email,created_at,expires_at FROM invitations
                    WHERE used_at IS NULL AND expires_at>? ORDER BY created_at DESC""", (now(),)).fetchall()
            self.json(200, {"invitations": [{"id": r["id"], "email": r["email"],
                "createdAt": timestamp(r["created_at"]), "expiresAt": timestamp(r["expires_at"])} for r in rows]})
        else:
            self.json(404, {"error": "Nicht gefunden."})

    def do_POST(self):
        if not self.origin_ok():
            return
        path = urlparse(self.path).path.rstrip("/") or "/"
        track_upload = re.fullmatch(r"/api/vacations/(\d+)/tracks", path)
        if track_upload:
            self.upload_track(int(track_upload.group(1)))
            return
        data = self.body()
        if data is None:
            self.json(400, {"error": "Ungültige Anfrage."})
            return
        if path == "/api/auth/login":
            email = email_key(data.get("email"))
            password = str(data.get("password", ""))
            if len(password) > 1024:
                self.json(400, {"error": "Das Passwort ist zu lang."})
                return
            key = self.headers.get("X-Real-IP", self.client_address[0])[:64]
            if self.limited(key):
                self.json(429, {"error": "Zu viele Versuche. Bitte in einigen Minuten erneut probieren."})
                return
            with db_connect() as db:
                user = db.execute("SELECT id,email,role,salt,password_hash,is_active FROM users WHERE email=?", (email,)).fetchone()
                valid = bool(user and user["is_active"] and password_ok(password, user["salt"], user["password_hash"]))
                if not user:
                    password_hash("not-a-real-password")
                if not valid:
                    self.json(401, {"error": "E-Mail oder Passwort ist nicht korrekt."})
                    return
                token = secrets.token_urlsafe(32)
                db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
                    (digest(token), user["id"], now() + SESSION_TTL))
            cookie = self.cookie(token)
            self.json(200, {"user": {"id": user["id"], "email": user["email"], "role": user["role"]}},
                {"Set-Cookie": cookie})
            ATTEMPTS.pop(key, None)
        elif path == "/api/invitations/check":
            token = str(data.get("token", ""))
            with db_connect() as db:
                invite = db.execute("SELECT email,expires_at,used_at FROM invitations WHERE token_hash=?",
                    (digest(token),)).fetchone()
            if not invite or invite["used_at"] or invite["expires_at"] <= now():
                self.json(404, {"error": "Einladung ist ungültig oder abgelaufen."})
            else:
                self.json(200, {"email": invite["email"], "expiresAt": timestamp(invite["expires_at"])})
        elif path == "/api/auth/logout":
            token = self.cookie_value()
            if token:
                with db_connect() as db:
                    db.execute("DELETE FROM sessions WHERE token_hash=?", (digest(token),))
            self.json(200, {"ok": True}, {"Set-Cookie": f"{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"})
        elif path == "/api/admin/invitations":
            user = current_user(self)
            if not user or user["role"] != "admin":
                self.json(403, {"error": "Nur Admins können Einladungen erstellen."})
                return
            email = email_key(data.get("email"))
            if not valid_email(email):
                self.json(400, {"error": "Bitte eine gültige E-Mail-Adresse eingeben."})
                return
            token, created = secrets.token_urlsafe(32), now()
            with db_connect() as db:
                if db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
                    self.json(409, {"error": "Für diese E-Mail-Adresse gibt es bereits ein Konto."})
                    return
                db.execute("DELETE FROM invitations WHERE email=? AND used_at IS NULL", (email,))
                db.execute("INSERT INTO invitations(token_hash,email,created_by,created_at,expires_at) VALUES(?,?,?,?,?)",
                    (digest(token), email, user["id"], created, created + INVITE_TTL))
            self.json(201, {"token": token, "email": email, "expiresAt": timestamp(created + INVITE_TTL)})
        elif path == "/api/vacations":
            user = current_user(self)
            if not user:
                self.json(401, {"error": "Bitte melde dich an."})
                return
            problem = self.validate_vacation(data)
            if problem:
                self.json(400, {"error": problem})
                return
            created = now()
            with db_connect() as db:
                cur = db.execute("INSERT INTO vacations(title,destination,start_date,end_date,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                    (str(data["title"]).strip(), str(data.get("destination", "")).strip(), str(data["startDate"]), str(data["endDate"]), str(data.get("notes", "")).strip(), user["id"], created, created))
                vacation_id = cur.lastrowid
            self.json(201, {"id": vacation_id})
        elif path == "/api/invitations/accept":
            token = str(data.get("token", ""))
            email = email_key(data.get("email"))
            password = str(data.get("password", ""))
            if len(password) < MIN_PASSWORD or len(password) > 1024:
                self.json(400, {"error": f"Das Passwort muss mindestens {MIN_PASSWORD} Zeichen lang sein."})
                return
            with db_connect() as db:
                invite = db.execute("SELECT id,email,expires_at,used_at FROM invitations WHERE token_hash=?",
                    (digest(token),)).fetchone()
                if not valid_email(email) or not invite or invite["used_at"] or invite["expires_at"] <= now() or invite["email"] != email:
                    self.json(400, {"error": "Einladung ist ungültig, abgelaufen oder für eine andere E-Mail-Adresse bestimmt."})
                    return
                salt, hashed = password_hash(password)
                try:
                    user_id = db.execute("INSERT INTO users(email,salt,password_hash,role,created_at) VALUES(?,?,?,?,?)",
                        (email, salt, hashed, "member", now())).lastrowid
                except sqlite3.IntegrityError:
                    self.json(409, {"error": "Für diese E-Mail-Adresse gibt es bereits ein Konto."})
                    return
                db.execute("UPDATE invitations SET used_at=? WHERE id=?", (now(), invite["id"]))
            session = secrets.token_urlsafe(32)
            with db_connect() as db:
                db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
                    (digest(session), user_id, now() + SESSION_TTL))
            self.json(201, {"user": {"id": user_id, "email": email, "role": "member"}},
                {"Set-Cookie": self.cookie(session)})
        else:
            self.json(404, {"error": "Nicht gefunden."})

    def upload_track(self, vacation_id):
        user = current_user(self)
        if not user:
            self.json(401, {"error": "Bitte melde dich an."})
            return
        try:
            size = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            size = -1
        if size <= 0:
            self.json(400, {"error": "Die GPX-Datei ist leer oder die Anfrage ungültig."})
            return
        if size > MAX_GPX_SIZE:
            self.json(413, {"error": "GPX-Dateien dürfen höchstens 20 MB groß sein."})
            return
        query = parse_qs(urlparse(self.path).query)
        supplied_name = query.get("filename", [""])[0].replace("\\", "/")
        original_name = os.path.basename(supplied_name)
        original_name = "".join(ch for ch in original_name if ch.isprintable() and ch not in "\r\n")[:180].strip()
        if not original_name or not original_name.lower().endswith(".gpx"):
            self.json(400, {"error": "Bitte wähle eine Datei mit der Endung .gpx."})
            return
        try:
            content = self.rfile.read(size)
        except OSError:
            self.json(400, {"error": "Die GPX-Datei konnte nicht gelesen werden."})
            return
        if len(content) != size:
            self.json(400, {"error": "Die GPX-Datei wurde unvollständig übertragen."})
            return
        if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
            self.json(400, {"error": "Die GPX-Datei enthält ungültige XML-Deklarationen."})
            return
        try:
            root = ET.fromstring(content)
            if root.tag.rsplit("}", 1)[-1].lower() != "gpx":
                raise ValueError("not GPX")
        except (ET.ParseError, ValueError):
            self.json(400, {"error": "Die ausgewählte Datei ist keine gültige GPX-Datei."})
            return
        with db_connect() as db:
            if not db.execute("SELECT 1 FROM vacations WHERE id=?", (vacation_id,)).fetchone():
                self.json(404, {"error": "Urlaub nicht gefunden."})
                return
        stored_name = secrets.token_hex(24) + ".gpx"
        file_path = os.path.join(GPX_DIR, stored_name)
        try:
            with open(file_path, "xb") as file:
                file.write(content)
            with db_connect() as db:
                cur = db.execute("INSERT INTO tracks(vacation_id,original_name,stored_name,size_bytes,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?)",
                    (vacation_id, original_name, stored_name, len(content), user["id"], now()))
                track_id = cur.lastrowid
        except (OSError, sqlite3.Error):
            try:
                os.remove(file_path)
            except OSError:
                pass
            self.json(500, {"error": "Die GPX-Datei konnte nicht gespeichert werden."})
            return
        self.json(201, {"id": track_id, "filename": original_name, "size": len(content)})

    def validate_vacation(self, data):
        title = str(data.get("title", "")).strip()
        destination = str(data.get("destination", "")).strip()
        notes = str(data.get("notes", "")).strip()
        try:
            start = datetime.strptime(str(data.get("startDate", "")), "%Y-%m-%d").date()
            end = datetime.strptime(str(data.get("endDate", "")), "%Y-%m-%d").date()
        except ValueError:
            return "Bitte gib gültige Start- und Enddaten ein."
        if not title or len(title) > 120 or len(destination) > 120 or len(notes) > 4000:
            return "Bitte prüfe Titel, Reiseziel und Beschreibung."
        if end < start:
            return "Das Enddatum darf nicht vor dem Startdatum liegen."
        return None

    def cookie_value(self):
        for part in self.headers.get("Cookie", "").split(";"):
            if part.strip().startswith(COOKIE + "="):
                return part.strip().split("=", 1)[1]
        return ""

    def cookie(self, token):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "http").split(",", 1)[0].strip() == "https" else ""
        return f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL}{secure}"

    def do_PUT(self):
        if not self.origin_ok():
            return
        user = current_user(self)
        if not user:
            self.json(401, {"error": "Bitte melde dich an."})
            return
        path = urlparse(self.path).path.rstrip("/")
        match = re.fullmatch(r"/api/vacations/(\d+)", path)
        data = self.body()
        if not match or data is None:
            self.json(400 if match else 404, {"error": "Ungültige Anfrage." if match else "Nicht gefunden."})
            return
        problem = self.validate_vacation(data)
        if problem:
            self.json(400, {"error": problem})
            return
        with db_connect() as db:
            cur = db.execute("UPDATE vacations SET title=?,destination=?,start_date=?,end_date=?,notes=?,updated_at=? WHERE id=?",
                (str(data["title"]).strip(), str(data.get("destination", "")).strip(), str(data["startDate"]), str(data["endDate"]), str(data.get("notes", "")).strip(), now(), int(match.group(1))))
            if not cur.rowcount:
                self.json(404, {"error": "Urlaub nicht gefunden."})
                return
        self.json(200, {"ok": True})

    def do_DELETE(self):
        if not self.origin_ok():
            return
        user = current_user(self)
        if not user:
            self.json(401, {"error": "Bitte melde dich an."})
            return
        path = urlparse(self.path).path.rstrip("/")
        vacation = re.fullmatch(r"/api/vacations/(\d+)", path)
        if vacation:
            with db_connect() as db:
                track_files = [row["stored_name"] for row in db.execute("SELECT stored_name FROM tracks WHERE vacation_id=?", (int(vacation.group(1)),)).fetchall()]
                cur = db.execute("DELETE FROM vacations WHERE id=?", (int(vacation.group(1)),))
            if cur.rowcount:
                for stored_name in track_files:
                    try:
                        os.remove(os.path.join(GPX_DIR, stored_name))
                    except OSError:
                        pass
            self.json(200 if cur.rowcount else 404, {"ok": True} if cur.rowcount else {"error": "Urlaub nicht gefunden."})
            return
        track_match = re.fullmatch(r"/api/tracks/(\d+)", path)
        if track_match:
            with db_connect() as db:
                row = db.execute("SELECT stored_name FROM tracks WHERE id=?", (int(track_match.group(1)),)).fetchone()
                if row:
                    db.execute("DELETE FROM tracks WHERE id=?", (int(track_match.group(1)),))
            if not row:
                self.json(404, {"error": "GPX-Datei nicht gefunden."})
                return
            try:
                os.remove(os.path.join(GPX_DIR, row["stored_name"]))
            except OSError:
                pass
            self.json(200, {"ok": True})
            return
        if user["role"] != "admin":
            self.json(403, {"error": "Zugriff verweigert."})
            return
        match = re.fullmatch(r"/api/admin/invitations/(\d+)", path)
        if not match:
            self.json(404, {"error": "Nicht gefunden."})
            return
        with db_connect() as db:
            db.execute("DELETE FROM invitations WHERE id=? AND used_at IS NULL", (int(match.group(1)),))
        self.json(200, {"ok": True})

    def do_PATCH(self):
        if not self.origin_ok():
            return
        user = current_user(self)
        if not user or user["role"] != "admin":
            self.json(403, {"error": "Nur Admins können Benutzer verwalten."})
            return
        match = re.fullmatch(r"/api/admin/users/(\d+)", urlparse(self.path).path.rstrip("/"))
        data = self.body()
        if not match or data is None:
            self.json(400 if match else 404, {"error": "Ungültige Anfrage." if match else "Nicht gefunden."})
            return
        target_id = int(match.group(1))
        with db_connect() as db:
            target = db.execute("SELECT id,role,is_active FROM users WHERE id=?", (target_id,)).fetchone()
            if not target:
                self.json(404, {"error": "Benutzer nicht gefunden."})
                return
            role = data.get("role", target["role"])
            active = data.get("active", bool(target["is_active"]))
            if role not in ("admin", "member") or not isinstance(active, bool):
                self.json(400, {"error": "Ungültige Rolle oder ungültiger Status."})
                return
            if target_id == user["id"] and (not active or role != "admin"):
                self.json(400, {"error": "Das eigene Admin-Konto kann hier nicht gesperrt oder herabgestuft werden."})
                return
            if target["role"] == "admin" and (role != "admin" or not active):
                count = db.execute("SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=1 AND id<>?", (target_id,)).fetchone()[0]
                if not count:
                    self.json(400, {"error": "Mindestens ein aktives Admin-Konto muss bestehen bleiben."})
                    return
            db.execute("UPDATE users SET role=?,is_active=? WHERE id=?", (role, int(active), target_id))
            if not active:
                db.execute("DELETE FROM sessions WHERE user_id=?", (target_id,))
        self.json(200, {"ok": True})

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), API).serve_forever()
