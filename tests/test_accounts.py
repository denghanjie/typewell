import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location('api', Path(__file__).resolve().parents[1] / 'server/server.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

class Accounts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        api.DB = Path(self.temp.name) / 'db.sqlite3'
        api.initialize()
        self.server = api.ThreadingHTTPServer(('127.0.0.1', 0), api.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port)
        self.cookie = ''; self.uid = ''

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); self.temp.cleanup()

    def request(self, path, data=None, **overrides):
        headers = {'Origin':api.ORIGIN,'X-Typewell-Request':'1','X-Typewell-User':str(self.uid),'Content-Type':'application/json','Cookie':self.cookie}
        headers.update(overrides)
        req=urllib.request.Request(self.base+'/api/'+path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        try: response=urllib.request.urlopen(req)
        except urllib.error.HTTPError as e: response=e
        value=json.load(response)
        if response.headers.get('Set-Cookie'): self.cookie=response.headers['Set-Cookie'].split(';')[0]
        if value.get('user'): self.uid=value['user']['id']
        return response.status,value,response.headers

    def register(self, username='student_one'):
        result=self.request('register',{'username':username,'password':'good password 123'})
        self.assertEqual(result[0],201,result)
        return result

    def record(self):
        return dict(id='result-1',lessonId='lesson-1',title='Practice',track='TOEFL',wpm=42,accuracy=97,durationMs=30000,characters=100,date=datetime.now(timezone.utc).isoformat())

    def test_auth_csrf_cookies_recovery(self):
        self.assertEqual(self.request('progress')[0],401)
        _,value,headers=self.register()
        recovery=value['recoveryCode']; original=self.cookie
        for flag in ('HttpOnly','Secure','SameSite=Lax','Path=/'): self.assertIn(flag,headers['Set-Cookie'])
        self.assertEqual(self.request('register',{'username':'STUDENT_ONE','password':'another password'})[0],409)
        self.assertEqual(self.request('login',{'username':'student_one','password':'incorrect'})[0],401)
        self.assertEqual(self.request('logout',{},Origin='https://evil.test')[0],403)
        self.assertEqual(self.request('results',self.record(),**{'X-Typewell-User':'999'})[0],409)
        self.assertEqual(self.request('recover',{'username':'student_one','password':'replacement password','recoveryCode':recovery})[0],200)
        recovered=self.cookie; self.cookie=original
        self.assertIsNone(self.request('me')[1]['user'])
        self.cookie=recovered
        self.assertEqual(self.request('recover',{'username':'student_one','password':'replacement password','recoveryCode':recovery})[0],401)
        self.assertEqual(self.request('logout',{})[0],200)
        self.assertEqual(self.request('login',{'username':'student_one','password':'replacement password'})[0],200)

    def test_progress_isolation_idempotency_and_drafts(self):
        self.register(); first_cookie=self.cookie; first_uid=self.uid
        draft=dict(lessonId='lesson-1',position=12,durationMs=4000,attempts=14,correctAttempts=12)
        self.assertEqual(self.request('draft',draft)[0],200)
        self.assertEqual(self.request('progress')[1]['draft']['position'],12)
        self.assertEqual(self.request('draft',dict(draft,position=15))[0],400)
        self.assertEqual(self.request('results',self.record())[0],200)
        self.assertEqual(self.request('results',self.record())[0],200)
        p=self.request('progress')[1]
        self.assertEqual(p['summary']['sessions'],1);self.assertIsNone(p['draft'])
        self.register('student_two')
        self.assertEqual(self.request('progress')[1]['summary']['sessions'],0)
        self.assertEqual(self.request('results',self.record(),**{'X-Typewell-User':str(first_uid)})[0],409)
        self.assertEqual(self.request('import',{'results':[self.record(),dict(self.record(),id='bad',accuracy=101)]})[0],400)
        self.assertEqual(self.request('progress')[1]['summary']['sessions'],0)
        self.assertEqual(self.request('import',{'results':[self.record(),self.record()]})[0],200)
        self.assertEqual(self.request('progress')[1]['summary']['sessions'],1)

    def test_failed_login_rate_limit(self):
        self.register()
        for _ in range(19): self.assertEqual(self.request('login',{'username':'student_one','password':'bad'})[0],401)
        self.assertEqual(self.request('login',{'username':'student_one','password':'good password 123'})[0],429)

if __name__=='__main__': unittest.main()
