import sys,os,runpy
from pathlib import Path
root=Path(__file__).resolve().parent.parent
os.chdir(root);sys.path.insert(0,str(root));sys.dont_write_bytecode=True
os.environ.pop('LL_LOCAL_POSTGRES_DB',None)
def guard(event,args):
 if event in {'socket.connect','socket.getaddrinfo'}: raise RuntimeError('Transfer verification blocks network access')
 if event=='ctypes.dlopen' and args[0] and ('Security' in str(args[0]) or 'CoreFoundation' in str(args[0])): raise RuntimeError('Transfer verification blocks Keychain frameworks')
 if event=='subprocess.Popen' and any('/security' in str(a) for a in args[:2]): raise RuntimeError('Transfer verification blocks Keychain CLI')
sys.addaudithook(guard)
sys.argv=['manage.py']+sys.argv[1:]
runpy.run_path(str(root/'manage.py'),run_name='__main__')
