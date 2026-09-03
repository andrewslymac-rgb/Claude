import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Money is stored in integer cents everywhere. This sidesteps floating-point
# rounding entirely; the .dollars property below is the only place callers
# should read a human amount from.


def new_uuid() -> str:
    return uuid.uuid4().hex


class MoneyMixin:
    """Adds a `.dollars` convenience accessor to any *_cents column."""

    @staticmethod
    def cents_to_dollars(cents: int) -> Decimal:
        return (Decimal(cents) / 100).quantize(Decimal("0.01"))

    @staticmethod
    def dollars_to_cents(dollars: Decimal | str | float) -> int:
        return int((Decimal(str(dollars)) * 100).to_integral_value(rounding="ROUND_HALF_UP"))


class Machine(Base):
    __tablename__ = "machines"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(120))
    location_name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(300), default="")
    location_contact_name: Mapped[str] = mapped_column(String(120), default="")
    location_contact_email: Mapped[str] = mapped_column(String(120), default="")
    # Percent, e.g. 10.00 means 10%. Paid to the location owner/contact.
    commission_rate_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Populated lazily by the sync service the first time this machine has
    # anything to sync: a QBO Class or Department (per tracking_type) used
    # to tag every transaction so QuickBooks reports can break P&L out by
    # machine, and a QBO Vendor (for paying this machine's location-owner
    # commission) if it ever has a commission payment synced.
    qbo_class_id: Mapped[str] = mapped_column(String(32), default="")
    qbo_vendor_id: Mapped[str] = mapped_column(String(32), default="")

    collections: Mapped[list["CollectionEntry"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan"
    )
    restocks: Mapped[list["RestockEntry"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan"
    )
    commission_payments: Mapped[list["CommissionPayment"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan"
    )
    maintenance_expenses: Mapped[list["MaintenanceExpense"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan"
    )


class CollectionEntry(Base, MoneyMixin):
    """A manual entry of money pulled out of a machine on a given date."""

    __tablename__ = "collection_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    machine_id: Mapped[str] = mapped_column(ForeignKey("machines.id"))
    collection_date: Mapped[date] = mapped_column(Date)
    cash_collected_cents: Mapped[int] = mapped_column(Integer, default=0)
    cashless_collected_cents: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    machine: Mapped["Machine"] = relationship(back_populates="collections")

    @property
    def total_cents(self) -> int:
        return self.cash_collected_cents + self.cashless_collected_cents


class RestockEntry(Base, MoneyMixin):
    """Cost of product used to restock a machine (COGS)."""

    __tablename__ = "restock_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    machine_id: Mapped[str] = mapped_column(ForeignKey("machines.id"))
    restock_date: Mapped[date] = mapped_column(Date)
    product_cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    machine: Mapped["Machine"] = relationship(back_populates="restocks")


class CommissionPayment(Base, MoneyMixin):
    """Commission paid to a location owner for a machine."""

    __tablename__ = "commission_payments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    machine_id: Mapped[str] = mapped_column(ForeignKey("machines.id"))
    payment_date: Mapped[date] = mapped_column(Date)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    machine: Mapped["Machine"] = relationship(back_populates="commission_payments")


class MaintenanceExpense(Base, MoneyMixin):
    __tablename__ = "maintenance_expenses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    machine_id: Mapped[str] = mapped_column(ForeignKey("machines.id"))
    expense_date: Mapped[date] = mapped_column(Date)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    machine: Mapped["Machine"] = relationship(back_populates="maintenance_expenses")


class QboConnection(Base):
    """Single-row table holding the current QuickBooks OAuth connection."""

    __tablename__ = "qbo_connection"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    realm_id: Mapped[str] = mapped_column(String(64), default="")
    company_name: Mapped[str] = mapped_column(String(200), default="")
    access_token: Mapped[str] = mapped_column(Text, default="")
    refresh_token: Mapped[str] = mapped_column(Text, default="")
    access_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    refresh_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    environment: Mapped[str] = mapped_column(String(20), default="sandbox")
    connected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    @property
    def is_connected(self) -> bool:
        return bool(self.realm_id and self.refresh_token)


class QboAccountSettings(Base):
    """Single-row table mapping this app's transactions to QBO accounts.

    Every *_account_ref is the QuickBooks Account Id (string) for that
    account, resolved once via the account picker in Settings. Left blank
    until the user confirms the mapping, so nothing syncs to the wrong
    account by accident.
    """

    __tablename__ = "qbo_account_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Where cash/cashless sales revenue posts to (a Sales Receipt's
    # deposit-to account -- typically "Undeposited Funds").
    deposit_account_ref: Mapped[str] = mapped_column(String(32), default="")
    deposit_account_name: Mapped[str] = mapped_column(String(120), default="")

    # The QBO Product/Service Item used on Sales Receipt lines. Its income
    # account (set on the item itself, inside QuickBooks) is where vending
    # revenue actually lands -- pick or create this item in Settings.
    sales_item_ref: Mapped[str] = mapped_column(String(32), default="")
    sales_item_name: Mapped[str] = mapped_column(String(120), default="")

    # Expense/COGS account for restock product cost.
    cogs_account_ref: Mapped[str] = mapped_column(String(32), default="")
    cogs_account_name: Mapped[str] = mapped_column(String(120), default="")

    # Expense account for commissions paid to location owners.
    commission_account_ref: Mapped[str] = mapped_column(String(32), default="")
    commission_account_name: Mapped[str] = mapped_column(String(120), default="")

    # Expense account for machine repairs/maintenance.
    maintenance_account_ref: Mapped[str] = mapped_column(String(32), default="")
    maintenance_account_name: Mapped[str] = mapped_column(String(120), default="")

    # The bank/credit-card/petty-cash account restock, commission, and
    # maintenance expenses are recorded as paid from.
    expense_payment_account_ref: Mapped[str] = mapped_column(String(32), default="")
    expense_payment_account_name: Mapped[str] = mapped_column(String(120), default="")

    # "Class" or "Department" (QuickBooks' name for its Location-tracking
    # feature) -- whichever tracking feature is enabled on the QBO company,
    # used to tag each transaction with the machine it belongs to.
    tracking_type: Mapped[str] = mapped_column(String(20), default="Class")

    def is_complete(self) -> bool:
        return bool(
            self.deposit_account_ref
            and self.sales_item_ref
            and self.cogs_account_ref
            and self.commission_account_ref
            and self.maintenance_account_ref
            and self.expense_payment_account_ref
        )


class SourceType(str, enum.Enum):
    COLLECTION = "collection"
    RESTOCK = "restock"
    COMMISSION = "commission"
    MAINTENANCE = "maintenance"


class SyncStatus(str, enum.Enum):
    PENDING = "pending"
    SYNCED = "synced"
    FAILED = "failed"


class SyncRecord(Base):
    """Tracks the QuickBooks-side identity of every locally-created record.

    This is the single source of truth for duplicate prevention: before
    ever creating anything in QuickBooks, the sync service looks up
    (source_type, source_id) here. If a row exists with a qbo_id, it
    updates that QBO object instead of creating a new one.
    """

    __tablename__ = "sync_records"
    __table_args__ = (UniqueConstraint("source_type", "source_id", name="uq_sync_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_type: Mapped[SourceType] = mapped_column(Enum(SourceType))
    source_id: Mapped[str] = mapped_column(String(32))

    qbo_entity: Mapped[str] = mapped_column(String(40), default="")  # e.g. "SalesReceipt"
    qbo_id: Mapped[str] = mapped_column(String(32), default="")
    qbo_sync_token: Mapped[str] = mapped_column(String(20), default="")

    status: Mapped[SyncStatus] = mapped_column(Enum(SyncStatus), default=SyncStatus.PENDING)
    last_error: Mapped[str] = mapped_column(Text, default="")
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
