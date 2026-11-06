"""Disposable browser verification database; never used by start.command."""
from .settings import *
QA_DIR=Path(os.environ['LL_BROWSER_QA_DIR']).resolve()
if not str(QA_DIR).startswith('/private/tmp/ll-guided-qa-') and not str(QA_DIR).startswith('/tmp/ll-guided-qa-'):
    raise RuntimeError('Browser QA data must be a dedicated temporary directory.')
DATABASES={'default':{'ENGINE':'django.db.backends.sqlite3','NAME':QA_DIR/'qa.sqlite3',
                     'OPTIONS':{'timeout':20,'transaction_mode':'IMMEDIATE'}}}
RECORDING_DIR=QA_DIR/'recordings'
