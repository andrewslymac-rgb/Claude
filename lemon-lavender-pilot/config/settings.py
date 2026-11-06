"""Deliberately local-only. A production configuration does not exist yet."""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / '.data'
DATA_DIR.mkdir(mode=0o700, exist_ok=True)
# Ephemeral application signing key; no owner password or credential is generated.
SECRET_KEY = secrets.token_urlsafe(64)
DEBUG = False
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '[::1]', 'testserver']
INSTALLED_APPS = [
    'django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions',
    'django.contrib.messages', 'django.contrib.staticfiles', 'training',
]
MIDDLEWARE = [
    'training.middleware.LocalOnlyMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates',
              'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {'context_processors': [
                  'django.template.context_processors.request',
                  'django.contrib.auth.context_processors.auth',
                  'django.contrib.messages.context_processors.messages', 'training.context.learner_navigation']}}]
WSGI_APPLICATION = 'config.wsgi.application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3',
                         'NAME': DATA_DIR / 'pilot.sqlite3',
                         # SQLite has no SELECT FOR UPDATE. Acquire the writer
                         # reservation before reading revisions, across processes.
                         'OPTIONS': {'timeout': 20, 'transaction_mode': 'IMMEDIATE'}}}
# Opt-in future LOCAL Postgres. No estimator settings or DATABASE_URL are read.
if os.environ.get('LL_LOCAL_POSTGRES_DB'):
    DATABASES['default'] = {'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ['LL_LOCAL_POSTGRES_DB'],
        'USER': os.environ.get('LL_LOCAL_POSTGRES_USER', ''),
        'HOST': '127.0.0.1', 'PORT': os.environ.get('LL_LOCAL_POSTGRES_PORT', '5432')}
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / '.static'
LOGIN_URL = '/sign-in/'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_NAME = 'll_pilot_session'
CSRF_COOKIE_NAME = 'll_pilot_csrf'
SESSION_COOKIE_SAMESITE = 'Strict'
SESSION_COOKIE_AGE = 3600
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
CSRF_COOKIE_SAMESITE = 'Strict'
SECURE_REFERRER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
DATA_UPLOAD_MAX_MEMORY_SIZE = 32768
FILE_UPLOAD_MAX_MEMORY_SIZE = 0
EMAIL_BACKEND = 'django.core.mail.backends.dummy.EmailBackend'
MAX_ATTEMPTS_PER_DAY = 10
MAX_TURNS = 24
MAX_ATTEMPT_MINUTES = 20
PROVIDER_SPEND_LIMIT_CENTS = 0
VOICE_PROVIDER = 'local-scripted'
EMAIL_PROVIDER = 'local-preview'
LOGGING = {'version': 1, 'disable_existing_loggers': False,
           'handlers': {'console': {'class': 'logging.StreamHandler'}},
           'loggers': {'django.security.csrf': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False}}}
