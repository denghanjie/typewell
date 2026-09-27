#!/usr/bin/env python3
"""Typewell account API. Standard-library only; bind behind HTTPS Nginx."""
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sqlite3
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DB = Path(os.environ.get('TYPEWELL_DB', '/var/lib/typewell/typewell.sqlite3'))
ORIGIN = os.environ.get('TYPEWELL_ORIGIN', 'https://typing.denghanjie.vip')
SECURE = ORIGIN.startswith('https://')
COOKIE = '__Host-typewell' if SECURE else 'typewell_dev'
SESSION_TTL = 30 * 86400

def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db

def initialize():
    if not hasattr(hashlib, 'scrypt'):
        raise RuntimeError('Python with OpenSSL scrypt support is required.')
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
            salt TEXT NOT NULL, password_hash TEXT NOT NULL,
            recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS results (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            event_id TEXT NOT NULL, lesson_id TEXT NOT NULL, title TEXT NOT NULL,
            track TEXT NOT NULL, wpm REAL NOT NULL, accuracy REAL NOT NULL,
            duration_ms INTEGER NOT NULL, characters INTEGER NOT NULL,
            completed_at TEXT NOT NULL, PRIMARY KEY(user_id,event_id));
        CREATE TABLE IF NOT EXISTS drafts (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            lesson_id TEXT NOT NULL, position INTEGER NOT NULL, duration_ms INTEGER NOT NULL,
            attempts INTEGER NOT NULL, correct_attempts INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS rate_limits (
            key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL,
            PRIMARY KEY(key,bucket));
        CREATE INDEX IF NOT EXISTS results_user_date ON results(user_id,completed_at);
        ''')
    os.chmod(DB, 0o600)

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()

class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message

class Handler(BaseHTTPRequestHandler):
    server_version = 'Typewell'
    def log_message(self, fmt, *args):
        # Do not log request bodies, credentials, cookies, or usernames.
        pass

    def send_json(self, status, data, cookie=None):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        if status == 429:
            self.send_header('Retry-After', '900')
        self.end_headers()
        self.wfile.write(payload)

    def session_token(self):
        jar = SimpleCookie()
        try:
            jar.load(self.headers.get('Cookie', ''))
            return jar[COOKIE].value if COOKIE in jar else ''
        except Exception:
            return ''

    def user(self, db):
        token = self.session_token()
        if not token:
            return None
        return db.execute('SELECT users.id, username FROM users JOIN sessions ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?', (digest(token), int(time.time()))).fetchone()

    def require_user(self, db):
        user = self.user(db)
        if not user:
            raise APIError(401, 'Please sign in to save or view account progress.')
        if self.headers.get('X-Typewell-User') != str(user['id']):
            raise APIError(409, 'Your account changed in another tab. Reload before continuing.')
        return user

    def cookie(self, token, age=SESSION_TTL):
        return f'{COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}' + ('; Secure' if SECURE else '')

    def new_session(self, db, user_id):
        # Rotate a previous session when switching accounts.
        db.execute('DELETE FROM sessions WHERE token_hash=? OR expires_at<=?', (digest(self.session_token()), int(time.time())))
        token = secrets.token_urlsafe(32)
        db.execute('INSERT INTO sessions VALUES(?,?,?)', (digest(token), user_id, int(time.time())+SESSION_TTL))
        return self.cookie(token)

    def limit(self, db, action, maximum, seconds=900):
        # The API only binds loopback. Nginx overwrites X-Real-IP for external requests.
        ip = self.headers.get('X-Real-IP', self.client_address[0])[:64]
        key = digest(action + ':' + ip)
        bucket = int(time.time()) // seconds
        db.execute('DELETE FROM rate_limits WHERE bucket < ?', (bucket-2,))
        db.execute('INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1', (key,bucket))
        count = db.execute('SELECT count FROM rate_limits WHERE key=? AND bucket=?', (key,bucket)).fetchone()[0]
        db.commit()  # Failed authentication must still consume a rate-limit attempt.
        if count > maximum:
            raise APIError(429, 'Too many attempts. Please wait 15 minutes and try again.')

    def body(self):
        if self.headers.get('Origin') != ORIGIN or self.headers.get('X-Typewell-Request') != '1':
            raise APIError(403, 'This request must come from the Typewell website.')
        if self.headers.get_content_type() != 'application/json':
            raise APIError(415, 'JSON is required.')
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise APIError(400, 'Invalid request.')
        if not 0 < length <= 131072:
            raise APIError(413, 'Request is too large or empty.')
        try:
            value = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError):
            raise APIError(400, 'Invalid JSON.')
        if not isinstance(value, dict):
            raise APIError(400, 'Expected an object.')
        return value

    @staticmethod
    def number(data, key, maximum, default=0):
        value = data.get(key, default)
        if isinstance(value, bool) or not isinstance(value, (int,float)) or not math.isfinite(value) or not 0 <= value <= maximum:
            raise APIError(400, f'Invalid {key}.')
        return value

    @staticmethod
    def text(data, key, maximum, minimum=1):
        value = data.get(key, '')
        if not isinstance(value,str) or not minimum <= len(value) <= maximum or any(ord(c)<32 for c in value):
            raise APIError(400, f'Invalid {key}.')
        return value

    def credentials(self, data, validate_password=False):
        username = self.text(data, 'username', 24, 3).lower()
        if not re.fullmatch(r'[a-z0-9_]{3,24}', username):
            raise APIError(400, 'Use 3–24 letters, numbers, or underscores for your username.')
        password = self.text(data, 'password', 128, 10 if validate_password else 1)
        return username, password

    def save_result(self, db, uid, data):
        event_id = self.text(data, 'id', 100)
        lesson_id = self.text(data, 'lessonId', 100)
        title = self.text(data, 'title', 250)
        track = self.text(data, 'track', 20)
        if track not in ('Foundations','TOEFL','IELTS','AP CSA','Custom','Imported'):
            raise APIError(400, 'Unknown practice track.')
        wpm = self.number(data, 'wpm', 10000)
        accuracy = self.number(data, 'accuracy', 100)
        duration = int(self.number(data, 'durationMs', 86400000))
        chars = int(self.number(data, 'characters', 20000))
        date = self.text(data, 'date', 32)
        from datetime import datetime, timezone
        try:
            dt = datetime.fromisoformat(date.replace('Z','+00:00'))
            if dt.tzinfo is None or not 0 <= dt.timestamp() <= time.time()+300:
                raise ValueError()
            date = dt.astimezone(timezone.utc).isoformat()
        except ValueError:
            raise APIError(400, 'Invalid completion date.')
        db.execute('INSERT OR IGNORE INTO results VALUES(?,?,?,?,?,?,?,?,?,?)', (uid,event_id,lesson_id,title,track,wpm,accuracy,duration,chars,date))

    def do_GET(self):
        try:
            if not self.path.startswith('/api/') and os.environ.get('TYPEWELL_STATIC'):
                files = {'/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/account.js': 'account.js', '/styles.css': 'styles.css', '/lessons.js': 'lessons.js'}
                name = files.get(self.path)
                if not name:
                    raise APIError(404, 'Not found.')
                import mimetypes
                payload = (Path(os.environ['TYPEWELL_STATIC']) / name).read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', mimetypes.guess_type(name)[0] or 'text/plain')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            with connect() as db:
                if self.path == '/api/health':
                    return self.send_json(200, {'ok':True})
                user = self.user(db)
                if self.path == '/api/me':
                    return self.send_json(200, {'user':dict(user) if user else None})
                if self.path != '/api/progress':
                    raise APIError(404,'Not found.')
                user = self.require_user(db)
                uid = user['id']
                rows = [dict(r) for r in db.execute('SELECT event_id AS id, lesson_id AS lessonId,title,track,wpm,accuracy,duration_ms AS durationMs,characters,completed_at AS date FROM results WHERE user_id=? ORDER BY completed_at DESC LIMIT 500', (uid,))]
                summary = dict(db.execute('SELECT COUNT(*) AS sessions, COALESCE(SUM(duration_ms),0) AS durationMs, COALESCE(MAX(wpm),0) AS bestWpm, COALESCE(AVG(accuracy),0) AS avgAccuracy FROM results WHERE user_id=?', (uid,)).fetchone())
                completed = [r[0] for r in db.execute('SELECT DISTINCT lesson_id FROM results WHERE user_id=?', (uid,))]
                draft = db.execute('SELECT lesson_id AS lessonId,position,duration_ms AS durationMs,attempts,correct_attempts AS correctAttempts,updated_at AS updatedAt FROM drafts WHERE user_id=?', (uid,)).fetchone()
                return self.send_json(200, {'results':rows,'summary':summary,'completed':completed,'draft':dict(draft) if draft else None})
        except APIError as e:
            self.send_json(e.status, {'error':e.message})
        except Exception:
            self.send_json(500, {'error':'Progress is temporarily unavailable. Please try again.'})

    def do_POST(self):
        try:
            data = self.body()
            with connect() as db:
                if self.path in ('/api/register','/api/login','/api/recover'):
                    self.limit(db, 'auth', 40)
                    username,password = self.credentials(data, self.path != '/api/login')
                    # An account-specific limit also protects against distributed password guessing.
                    self.limit_account(db, username)
                    if self.path == '/api/register':
                        self.limit(db, 'register', 10)
                        salt = secrets.token_hex(16)
                        recovery = secrets.token_hex(16)
                        try:
                            cur = db.execute('INSERT INTO users(username,salt,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?)', (username,salt,password_hash(password,salt),digest(recovery),int(time.time())))
                        except sqlite3.IntegrityError:
                            raise APIError(409,'That username is already taken.')
                        cookie = self.new_session(db,cur.lastrowid)
                        db.commit()
                        return self.send_json(201, {'user':{'id':cur.lastrowid,'username':username},'recoveryCode':recovery},cookie)
                    user = db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
                    if self.path == '/api/recover':
                        recovery = self.text(data, 'recoveryCode', 64)
                        if not user or not hmac.compare_digest(user['recovery_hash'], digest(recovery.strip())):
                            raise APIError(401,'Username or recovery code is incorrect.')
                        salt = secrets.token_hex(16)
                        new_recovery = secrets.token_hex(16)
                        db.execute('UPDATE users SET salt=?, password_hash=?, recovery_hash=? WHERE id=?', (salt,password_hash(password,salt),digest(new_recovery),user['id']))
                        db.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
                        cookie = self.new_session(db,user['id'])
                        db.commit()
                        return self.send_json(200,{'user':{'id':user['id'],'username':username},'recoveryCode':new_recovery},cookie)
                    candidate = password_hash(password,user['salt'] if user else '00'*16)
                    if not user or not hmac.compare_digest(user['password_hash'],candidate):
                        raise APIError(401,'Username or password is incorrect.')
                    cookie = self.new_session(db,user['id'])
                    db.commit()
                    return self.send_json(200,{'user':{'id':user['id'],'username':username}},cookie)
                user = self.require_user(db)
                uid = user['id']
                self.limit(db,'writes',1000)
                if self.path == '/api/logout':
                    db.execute('DELETE FROM sessions WHERE token_hash=?',(digest(self.session_token()),))
                    db.commit()
                    return self.send_json(200,{'ok':True},self.cookie('',0))
                if self.path in ('/api/results','/api/import'):
                    records = data.get('results') if self.path == '/api/import' else [data]
                    if not isinstance(records,list) or len(records)>100 or any(not isinstance(r,dict) for r in records):
                        raise APIError(400,'Import at most 100 results at a time.')
                    for record in records:
                        self.save_result(db,uid,record)
                    if self.path == '/api/results':
                        # Do not remove another lesson's in-progress checkpoint.
                        db.execute('DELETE FROM drafts WHERE user_id=? AND lesson_id=?',(uid,data['lessonId']))
                    db.commit()
                    return self.send_json(200,{'ok':True})
                if self.path == '/api/draft':
                    if data.get('clear') is True:
                        lesson_id = self.text(data,'lessonId',100)
                        db.execute('DELETE FROM drafts WHERE user_id=? AND lesson_id=?',(uid,lesson_id))
                    else:
                        lesson_id = self.text(data,'lessonId',100)
                        pos = int(self.number(data,'position',20000))
                        ms = int(self.number(data,'durationMs',86400000))
                        attempts = int(self.number(data,'attempts',1000000))
                        correct = int(self.number(data,'correctAttempts',1000000))
                        if correct > attempts or pos > correct:
                            raise APIError(400,'Invalid checkpoint counters.')
                        db.execute('INSERT INTO drafts VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lesson_id=excluded.lesson_id,position=excluded.position,duration_ms=excluded.duration_ms,attempts=excluded.attempts,correct_attempts=excluded.correct_attempts,updated_at=excluded.updated_at', (uid,lesson_id,pos,ms,attempts,correct,int(time.time())))
                    db.commit()
                    return self.send_json(200,{'ok':True})
                raise APIError(404,'Not found.')
        except APIError as e:
            self.send_json(e.status,{'error':e.message})
        except Exception:
            self.send_json(500,{'error':'Your change could not be saved. Please try again.'})

    def limit_account(self, db, username):
        bucket = int(time.time())//900
        key = digest('account:'+username)
        db.execute('INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1',(key,bucket))
        count=db.execute('SELECT count FROM rate_limits WHERE key=? AND bucket=?',(key,bucket)).fetchone()[0]
        db.commit()
        if count>20:
            raise APIError(429,'Too many attempts for this account. Please wait 15 minutes.')

if __name__ == '__main__':
    initialize()
    ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('PORT','8794'))),Handler).serve_forever()
