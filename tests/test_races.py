import concurrent.futures
import json
import urllib.request
import urllib.error
from unittest.mock import patch
import unittest
import test_accounts
api = test_accounts.api

class RaceTests(unittest.TestCase):
    request = test_accounts.Accounts.request
    register = test_accounts.Accounts.register
    tearDown = test_accounts.Accounts.tearDown
    def setUp(self):
        test_accounts.Accounts.setUp(self)
        self.users=[]
        for name in ('race_alice','race_bob','race_charlie'):
            self.register(name);self.users.append((self.uid,self.cookie));self.cookie=''
        self.use(0)
        self.lesson=next(iter(api.races.LESSONS.values()))

    def use(self,index): self.uid,self.cookie=self.users[index]
    def race(self,action,data=None):return self.request('race/'+action, data or {})
    def room(self):
        status,value,_=self.race('create',{'lessonId':self.lesson['id']});self.assertEqual(status,200,value)
        return value['room']['code']
    def begin(self,code):
        self.use(1);self.assertEqual(self.race('join',{'code':code})[0],200)
        self.race('ready',{'code':code});self.use(0)
        room=self.race('ready',{'code':code})[1]['room'];self.assertEqual(room['state'],'running');return room['startsAt']

    def test_race_finish_reconnect_and_history(self):
        code=self.room();start=self.begin(code);text=self.lesson['text']
        progress=dict(revision=0,position=len(text),attempts=len(text),correctAttempts=len(text),text=text)
        with patch.object(api.races,'now_ms',return_value=start-1):
            r=self.race('sync',{'code':code,'progress':progress})[1]['room']
            self.assertEqual(r['players'][0]['position'],0)
        with patch.object(api.races,'now_ms',return_value=start+10000):
            bad=dict(progress,text='incorrect')
            self.assertEqual(self.race('sync',{'code':code,'progress':bad})[0],400)
            r=self.race('sync',{'code':code,'progress':progress})[1]['room']
            self.assertEqual(r['winnerId'],self.uid)
            self.race('sync',{'code':code,'progress':progress})
            self.assertEqual(self.request('progress')[1]['summary']['sessions'],1)
            self.use(1)
            self.assertEqual(self.race('current')[1]['room']['code'],code)
            partial=dict(progress,position=3,text='',attempts=3,correctAttempts=3)
            self.race('sync',{'code':code,'progress':partial})
            stale=self.race('sync',{'code':code,'progress':partial})[1]['room']
            self.assertTrue(stale['conflict']);self.assertEqual(stale['players'][1]['position'],3)
        with patch.object(api.races,'now_ms',return_value=start+12000):
            progress['revision']=1
            r=self.race('sync',{'code':code,'progress':progress})[1]['room']
            self.assertEqual(r['state'],'finished');self.assertEqual(r['winnerId'],self.users[0][0])
            self.assertEqual(self.request('progress')[1]['summary']['sessions'],1)

    def test_private_room_capacity_and_forfeit(self):
        code=self.room();self.use(2)
        self.assertEqual(self.race('sync',{'code':code})[0],403)
        self.use(0);start=self.begin(code)
        self.use(2);self.assertEqual(self.race('join',{'code':code})[0],409)
        self.use(0)
        with patch.object(api.races,'now_ms',return_value=start+1000):
            r=self.race('leave',{'code':code})[1]['room']
        self.assertEqual(r['state'],'finished');self.assertEqual(r['winnerId'],self.users[1][0])
        self.assertEqual(self.request('progress')[1]['summary']['sessions'],0)

    def test_cancel_expiry_and_duplicate_room(self):
        code=self.room();self.assertEqual(self.race('create',{'lessonId':self.lesson['id']})[0],409)
        self.assertEqual(self.race('leave',{'code':code})[1]['room']['state'],'cancelled')
        code=self.room()
        with patch.object(api.races,'now_ms',return_value=api.races.now_ms()+api.races.WAIT_MS+1):
            self.assertEqual(self.race('sync',{'code':code})[1]['room']['state'],'expired')
            self.assertIsNone(self.race('current')[1]['room'])
        self.assertEqual(self.race('create',{'lessonId':'fake'})[0],400)

    def test_concurrent_join_only_accepts_one_opponent(self):
        code=self.room()
        def join(identity):
            uid,cookie=identity
            request=urllib.request.Request(self.base+'/api/race/join',data=json.dumps({'code':code}).encode(),headers={'Origin':api.ORIGIN,'X-Typewell-Request':'1','X-Typewell-User':str(uid),'Cookie':cookie,'Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(request) as response:return response.status
            except urllib.error.HTTPError as e:return e.code
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: codes=list(pool.map(join,self.users[1:]))
        self.assertEqual(sorted(codes),[200,409])
        self.assertEqual(len(self.race('sync',{'code':code})[1]['room']['players']),2)

    def test_ready_after_opponent_reconnects(self):
        code=self.room();base=api.races.now_ms();self.race('ready',{'code':code});self.use(1)
        self.race('join',{'code':code})
        with patch.object(api.races,'now_ms',return_value=base+20000):
            self.assertEqual(self.race('ready',{'code':code})[1]['room']['state'],'waiting')
            self.use(0)
            self.assertEqual(self.race('sync',{'code':code})[1]['room']['state'],'running')
