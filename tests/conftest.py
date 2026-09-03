from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Machine, QboAccountSettings, QboConnection


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def machine(db_session):
    m = Machine(
        name="Snack-1",
        location_name="Acme Warehouse",
        location_contact_name="Jane Owner",
        location_contact_email="jane@example.com",
        commission_rate_percent="10.00",
        qbo_class_id="CLASS-1",
    )
    db_session.add(m)
    db_session.commit()
    return m


@pytest.fixture()
def complete_qbo_settings(db_session):
    settings = QboAccountSettings(
        id=1,
        deposit_account_ref="ACC-DEPOSIT",
        sales_item_ref="ITEM-SALES",
        cogs_account_ref="ACC-COGS",
        commission_account_ref="ACC-COMMISSION",
        maintenance_account_ref="ACC-MAINTENANCE",
        expense_payment_account_ref="ACC-PAYMENT",
        tracking_type="Class",
    )
    db_session.add(settings)
    db_session.commit()
    return settings


@pytest.fixture()
def connected_qbo(db_session):
    conn = QboConnection(
        id=1,
        realm_id="REALM-1",
        access_token="access-token",
        refresh_token="refresh-token",
        access_token_expires_at=datetime.utcnow() + timedelta(hours=1),
        refresh_token_expires_at=datetime.utcnow() + timedelta(days=90),
    )
    db_session.add(conn)
    db_session.commit()
    return conn
