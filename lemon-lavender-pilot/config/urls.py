from django.urls import path
from django.contrib.staticfiles.views import serve
from training import coaching, recordings, followup_views, learning_views, views
from training import live_views
from training import sales_views
from training import sales_reports
from training import transcript_alignment
from training import dashboard

urlpatterns = [
    path('voice-quality-test/', live_views.voice_quality_test, name='voice_quality_test'),
    path('microphone-test/', live_views.microphone_test, name='microphone_test'),
    path('course/<int:pk>/live/', live_views.prepare, name='live_prepare'),
    path('course/<int:pk>/live/start/', live_views.start, name='live_start'),
    path('live-fixture/', live_views.fixture, name='live_fixture'),
    path('live/<uuid:pk>/', live_views.detail, name='live_detail'),
    path('live/<uuid:pk>/events/', live_views.events, name='live_events'),
    path('live/<uuid:pk>/input/', live_views.input_audio, name='live_input'),
    path('live/<uuid:pk>/playback/', live_views.playback, name='live_playback'),
    path('live/<uuid:pk>/control/', live_views.control, name='live_control'),
    path('live/<uuid:pk>/align/', transcript_alignment.save, name='live_align'),
    path('live/<uuid:pk>/stop/', live_views.stop, name='live_stop'),
    path('live/<uuid:pk>/notes/', live_views.notes, name='live_notes'),
    path('live/<uuid:pk>/audio/<slug:track>/', live_views.audio, name='live_audio'),
    path('live/<uuid:pk>/audio/<slug:track>/download/', sales_reports.live_audio_download, name='live_audio_download'),
    path('', views.home, name='home'),
    path('sign-in/', views.sign_in, name='sign_in'),
    path('magic/', views.magic, name='magic'),
    path('sign-out/', views.sign_out, name='sign_out'),
    path('assign/', views.assign, name='assign'),
    path('course/<int:pk>/coaching/', coaching.coaching, name='coaching'),
    path('attempt/<uuid:pk>/record/', recordings.save, name='recording_save'),
    path('recording/<uuid:pk>/', recordings.play, name='recording_play'),
    path('costs/', views.costs, name='costs'),
    path('course/<int:pk>/', views.course, name='course'),
    path('course/<int:pk>/stage/<slug:stage_slug>/', dashboard.stage, name='learning_stage'),
    path('course/<int:pk>/orientation/', dashboard.orientation, name='orientation'),
    path('course/<int:pk>/learn/<slug:lesson_key>/<int:page>/', learning_views.lesson, name='guided_lesson'),
    path('course/<int:pk>/learn/<slug:lesson_key>/complete/', learning_views.done, name='guided_lesson_done'),
    path('course/<int:pk>/welcome/', views.welcome, name='welcome'),
    path('course/<int:pk>/services/', views.services, name='services'),
    path('course/<int:pk>/practice/', views.practice_library, name='practice_library'),
    path('course/<int:pk>/scenarios/', sales_views.library, name='scenario_library'),
    path('course/<int:pk>/practice-report/', sales_reports.report, name='sales_report'),
    path('attempt/<uuid:pk>/export/', sales_reports.export, name='attempt_export'),
    path('recording/<uuid:pk>/download/', sales_reports.recording_download, name='recording_download'),
    path('course/<int:pk>/lesson/', views.lesson, name='lesson'),
    path('course/<int:pk>/start/', views.start, name='start'),
    path('course/<int:pk>/follow-up/lesson/', followup_views.lesson, name='followup_lesson'),
    path('course/<int:pk>/follow-up/', followup_views.setup, name='followup_setup'),
    path('follow-up/<uuid:pk>/', followup_views.detail, name='followup_attempt'),
    path('follow-up/<uuid:pk>/act/', followup_views.act, name='followup_act'),
    path('attempt/<uuid:pk>/', views.attempt_detail, name='attempt'),
    path('attempt/<uuid:pk>/save/', views.mutate_attempt, name='mutate_attempt'),
    path('attempt/<uuid:pk>/review/', views.review, name='review'),
    path('static/<path:path>', serve, {'insecure': True}),
]
