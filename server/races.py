"""Two-player private rooms. SQLite serializes joins, starts and finishes."""
import json
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path

LESSONS = {}
WAIT_MS = 15 * 60 * 1000
RACE_MS = 45 * 60 * 1000

class RaceError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message

def now_ms():
    return int(time.time() * 1000)

def initialize(db):
    global LESSONS
    LESSONS = json.loads(Path(__file__).with_name('race-lessons.json').read_text())
    db.executescript('''
    CREATE TABLE IF NOT EXISTS race_rooms (
        code TEXT PRIMARY KEY, lesson_id TEXT NOT NULL,
        host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        state TEXT NOT NULL DEFAULT 'waiting', starts_at INTEGER,
        expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
        winner_id INTEGER, reason TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS race_players (
        room_code TEXT NOT NULL REFERENCES race_rooms(code) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ready INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0, correct_attempts INTEGER NOT NULL DEFAULT 0,
        finished_at INTEGER, last_seen INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(room_code,user_id));
    CREATE INDEX IF NOT EXISTS race_players_user ON race_players(user_id);
    ''')

def expire(db, now):
    db.execute("UPDATE race_rooms SET state='expired', reason='Room time limit reached.' WHERE state IN ('waiting','running') AND expires_at<=?", (now,))

def room_view(db, code, uid, now, conflict=False):
    room = db.execute('SELECT * FROM race_rooms WHERE code=?', (code,)).fetchone()
    if not room:
        raise RaceError(404, 'Room not found. Check the code or create a new room.')
    players = db.execute('SELECT p.*,u.username FROM race_players p JOIN users u ON p.user_id=u.id WHERE room_code=? ORDER BY p.rowid', (code,)).fetchall()
    if not any(p['user_id'] == uid for p in players):
        raise RaceError(403, 'Only the two players in this room can view the race.')
    lesson = LESSONS.get(room['lesson_id'])
    if not lesson:
        db.execute("UPDATE race_rooms SET state='cancelled',reason='This lesson changed. Create a new room.' WHERE code=?",(code,))
        room = db.execute('SELECT * FROM race_rooms WHERE code=?',(code,)).fetchone()
        lesson = dict(id=room['lesson_id'],text=' ',title='Lesson updated',track='Foundations')
    output = []
    for p in players:
        duration = max(0, (p['finished_at'] or now) - (room['starts_at'] or now))
        output.append(dict(id=p['user_id'], username=p['username'], ready=bool(p['ready']),
            position=p['position'], attempts=p['attempts'], correctAttempts=p['correct_attempts'],
            finishedAt=p['finished_at'], lastSeen=p['last_seen'], revision=p['revision'],
            wpm=round(p['position'] / 5 / (max(duration,1000) / 60000)),
            accuracy=round(100*p['correct_attempts']/p['attempts']) if p['attempts'] else 100))
    return dict(code=code,state=room['state'],startsAt=room['starts_at'],expiresAt=room['expires_at'],
        winnerId=room['winner_id'],reason=room['reason'],serverNow=now,lesson=lesson,
        players=output,conflict=conflict)

def handle(handler, db, uid, action, data):
    now = now_ms()
    # The rate limiter commits before this function; this transaction covers every read/write decision.
    db.execute('BEGIN IMMEDIATE')
    expire(db, now)
    if action == 'current':
        row=db.execute("SELECT r.code FROM race_rooms r JOIN race_players p ON p.room_code=r.code WHERE p.user_id=? AND r.state IN ('waiting','running') ORDER BY r.created_at DESC LIMIT 1",(uid,)).fetchone()
        return room_view(db,row['code'],uid,now) if row else None
    if action == 'create':
        lesson_id=handler.text(data,'lessonId',100)
        if lesson_id not in LESSONS:
            raise RaceError(400,'Choose a built-in lesson from the current library.')
        existing=db.execute("SELECT r.code FROM race_rooms r JOIN race_players p ON p.room_code=r.code WHERE p.user_id=? AND r.state IN ('waiting','running')",(uid,)).fetchone()
        if existing:
            raise RaceError(409,'You already have an active room. Use Reconnect or leave it first.')
        db.execute('DELETE FROM race_rooms WHERE expires_at<?',(now-7*86400000,))
        alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        while True:
            code=''.join(secrets.choice(alphabet) for _ in range(8))
            if not db.execute('SELECT 1 FROM race_rooms WHERE code=?',(code,)).fetchone(): break
        db.execute('INSERT INTO race_rooms(code,lesson_id,host_id,expires_at,created_at) VALUES(?,?,?,?,?)',(code,lesson_id,uid,now+WAIT_MS,now))
        db.execute('INSERT INTO race_players(room_code,user_id,last_seen) VALUES(?,?,?)',(code,uid,now))
        return room_view(db,code,uid,now)
    code=handler.text(data,'code',8,8).upper()
    room=db.execute('SELECT * FROM race_rooms WHERE code=?',(code,)).fetchone()
    if not room:
        raise RaceError(404,'Room not found. Check the eight-character code.')
    player=db.execute('SELECT * FROM race_players WHERE room_code=? AND user_id=?',(code,uid)).fetchone()
    if action == 'join' and not player:
        if room['state']!='waiting':
            raise RaceError(409,'This room has already started or closed.')
        if db.execute('SELECT COUNT(*) FROM race_players WHERE room_code=?',(code,)).fetchone()[0]>=2:
            raise RaceError(409,'This room already has two players.')
        if db.execute("SELECT 1 FROM race_rooms r JOIN race_players p ON p.room_code=r.code WHERE p.user_id=? AND r.state IN ('waiting','running')",(uid,)).fetchone():
            raise RaceError(409,'Leave your existing room before joining another one.')
        db.execute('INSERT INTO race_players(room_code,user_id,last_seen) VALUES(?,?,?)',(code,uid,now))
        return room_view(db,code,uid,now)
    if not player:
        raise RaceError(403,'You are not a player in this room.')
    if action == 'leave':
        if room['state'] in ('waiting','running'):
            opponent=db.execute('SELECT user_id FROM race_players WHERE room_code=? AND user_id!=?',(code,uid)).fetchone()
            underway=room['state']=='running' and now >= room['starts_at']
            winner=room['winner_id'] or (opponent['user_id'] if underway and opponent else None)
            db.execute('UPDATE race_rooms SET state=?,winner_id=?,reason=? WHERE code=?',('finished' if winner else 'cancelled',winner,'A player left the room.' if not winner else 'Race ended when a player left.',code))
        return room_view(db,code,uid,now)
    db.execute('UPDATE race_players SET last_seen=? WHERE room_code=? AND user_id=?',(now,code,uid))
    if action == 'ready':
        if room['state']!='waiting': return room_view(db,code,uid,now)
        db.execute('UPDATE race_players SET ready=1 WHERE room_code=? AND user_id=?',(code,uid))
    elif action == 'sync':
        progress=data.get('progress')
        if progress is not None and room['state']=='running' and now>=room['starts_at'] and not player['finished_at']:
            if not isinstance(progress,dict): raise RaceError(400,'Invalid race progress.')
            lesson=LESSONS.get(room['lesson_id'])
            if not lesson: raise RaceError(409,'The lesson is no longer available.')
            revision=handler.number(progress,'revision',1000000)
            if revision!=player['revision']: return room_view(db,code,uid,now,True)
            position=handler.number(progress,'position',len(lesson['text']))
            attempts=handler.number(progress,'attempts',1000000)
            correct=handler.number(progress,'correctAttempts',1000000)
            if any(int(n)!=n for n in (position,attempts,correct,revision)) or not position<=correct<=attempts or attempts<player['attempts'] or correct<player['correct_attempts'] or correct-player['correct_attempts']>attempts-player['attempts']:
                raise RaceError(400,'Invalid race counters.')
            complete=position==len(lesson['text'])
            if complete and progress.get('text')!=lesson['text']:
                raise RaceError(400,'Complete the entire passage and correct all mistakes to finish.')
            db.execute('UPDATE race_players SET position=?,attempts=?,correct_attempts=?,finished_at=?,revision=revision+1 WHERE room_code=? AND user_id=?',(position,attempts,correct,now if complete else None,code,uid))
            if complete:
                previous=db.execute('SELECT MIN(finished_at) FROM race_players WHERE room_code=? AND user_id!=?',(code,uid)).fetchone()[0]
                if previous is None: db.execute('UPDATE race_rooms SET winner_id=? WHERE code=?',(uid,code))
                elif previous==now: db.execute("UPDATE race_rooms SET winner_id=NULL,reason='Both players finished together.' WHERE code=?",(code,))
                if db.execute('SELECT COUNT(*) FROM race_players WHERE room_code=? AND finished_at IS NOT NULL',(code,)).fetchone()[0]==2:
                    db.execute("UPDATE race_rooms SET state='finished' WHERE code=?",(code,))
                duration=max(1,now-room['starts_at'])
                db.execute('INSERT OR IGNORE INTO results VALUES(?,?,?,?,?,?,?,?,?,?)',(uid,'race-'+code,room['lesson_id'],lesson['title'],lesson['track'],round(position/5/(max(duration,1000)/60000)),round(correct/attempts*100),duration,position,datetime.fromtimestamp(now/1000,timezone.utc).isoformat()))
    elif action != 'join':
        raise RaceError(404,'Unknown race action.')
    if room['state']=='waiting' and action in ('sync','ready'):
        players=db.execute('SELECT ready,last_seen FROM race_players WHERE room_code=?',(code,)).fetchall()
        if len(players)==2 and all(p['ready'] and now-p['last_seen']<15000 for p in players):
            db.execute("UPDATE race_rooms SET state='running',starts_at=?,expires_at=? WHERE code=? AND state='waiting'",(now+5000,now+5000+RACE_MS,code))
    return room_view(db,code,uid,now)
