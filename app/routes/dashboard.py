from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.calculations import summarize_machine_period
from app.database import get_db
from app.models import CollectionEntry, CommissionPayment, MaintenanceExpense, Machine, RestockEntry
from app.qbo.sync import list_pending_sync_targets
from app.templating import render

router = APIRouter(tags=["dashboard"])


@router.get("/")
def dashboard(request: Request, db: Session = Depends(get_db)):
    machines = db.query(Machine).filter_by(active=True).order_by(Machine.name).all()
    collections = db.query(CollectionEntry).all()
    restocks = db.query(RestockEntry).all()
    commissions = db.query(CommissionPayment).all()
    maintenance = db.query(MaintenanceExpense).all()

    today = date.today()
    month_start = today.replace(day=1)

    summaries = [
        summarize_machine_period(
            m.id, collections, restocks, commissions, maintenance, period_start=month_start, period_end=today
        )
        for m in machines
    ]
    machine_summaries = list(zip(machines, summaries))

    totals = {
        "revenue": sum((s.total_revenue for s in summaries), Decimal("0")),
        "expenses": sum((s.total_expenses for s in summaries), Decimal("0")),
        "profit": sum((s.net_profit for s in summaries), Decimal("0")),
    }

    pending_sync_count = len(list_pending_sync_targets(db))

    return render(
        request,
        "dashboard.html",
        machine_summaries=machine_summaries,
        totals=totals,
        machine_count=len(machines),
        pending_sync_count=pending_sync_count,
        month_start=month_start,
        today=today,
    )
