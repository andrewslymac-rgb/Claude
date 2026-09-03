from fastapi import APIRouter, Depends, Form
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.calculations import suggested_commission_cents
from app.database import get_db
from app.flash import flash
from app.forms import FormValidationError, parse_entry_date, parse_money_to_cents
from app.models import CollectionEntry, CommissionPayment, MaintenanceExpense, Machine, RestockEntry
from app.templating import render

router = APIRouter(tags=["entries"])


def _active_machines(db: Session) -> list[Machine]:
    return db.query(Machine).filter_by(active=True).order_by(Machine.name).all()


# ---------------------------------------------------------------- collections

@router.get("/collections")
def list_collections(request: Request, db: Session = Depends(get_db)):
    entries = db.query(CollectionEntry).order_by(CollectionEntry.collection_date.desc()).all()
    return render(request, "entries/collections_list.html", entries=entries)


@router.get("/collections/new")
def new_collection_form(request: Request, db: Session = Depends(get_db)):
    return render(
        request, "entries/collection_form.html", machines=_active_machines(db), errors=[], form_values={}
    )


@router.post("/collections/new")
def create_collection(
    request: Request,
    machine_id: str = Form(...),
    collection_date: str = Form(...),
    cash_collected: str = Form("0"),
    cashless_collected: str = Form("0"),
    notes: str = Form(""),
    db: Session = Depends(get_db),
):
    form_values = {
        "machine_id": machine_id,
        "collection_date": collection_date,
        "cash_collected": cash_collected,
        "cashless_collected": cashless_collected,
        "notes": notes,
    }
    try:
        machine = db.get(Machine, machine_id)
        if machine is None:
            raise FormValidationError("Choose a machine.")
        entry_date = parse_entry_date(collection_date, "Collection date")
        cash_cents = parse_money_to_cents(cash_collected or "0", "Cash collected")
        cashless_cents = parse_money_to_cents(cashless_collected or "0", "Cashless collected")
        if cash_cents == 0 and cashless_cents == 0:
            raise FormValidationError("Enter a cash or cashless amount greater than zero.")
    except FormValidationError as exc:
        return render(
            request,
            "entries/collection_form.html",
            machines=_active_machines(db),
            errors=[str(exc)],
            form_values=form_values,
            status_code=400,
        )

    entry = CollectionEntry(
        machine_id=machine.id,
        collection_date=entry_date,
        cash_collected_cents=cash_cents,
        cashless_collected_cents=cashless_cents,
        notes=notes.strip(),
    )
    db.add(entry)
    db.commit()
    flash(request, f"Logged collection for {machine.name}.", "success")
    return RedirectResponse(url="/collections", status_code=303)


# ------------------------------------------------------------------- restocks

@router.get("/restocks")
def list_restocks(request: Request, db: Session = Depends(get_db)):
    entries = db.query(RestockEntry).order_by(RestockEntry.restock_date.desc()).all()
    return render(request, "entries/restocks_list.html", entries=entries)


@router.get("/restocks/new")
def new_restock_form(request: Request, db: Session = Depends(get_db)):
    return render(
        request, "entries/restock_form.html", machines=_active_machines(db), errors=[], form_values={}
    )


@router.post("/restocks/new")
def create_restock(
    request: Request,
    machine_id: str = Form(...),
    restock_date: str = Form(...),
    product_cost: str = Form(...),
    notes: str = Form(""),
    db: Session = Depends(get_db),
):
    form_values = {
        "machine_id": machine_id,
        "restock_date": restock_date,
        "product_cost": product_cost,
        "notes": notes,
    }
    try:
        machine = db.get(Machine, machine_id)
        if machine is None:
            raise FormValidationError("Choose a machine.")
        entry_date = parse_entry_date(restock_date, "Restock date")
        cost_cents = parse_money_to_cents(product_cost, "Product cost", allow_zero=False)
    except FormValidationError as exc:
        return render(
            request,
            "entries/restock_form.html",
            machines=_active_machines(db),
            errors=[str(exc)],
            form_values=form_values,
            status_code=400,
        )

    entry = RestockEntry(
        machine_id=machine.id, restock_date=entry_date, product_cost_cents=cost_cents, notes=notes.strip()
    )
    db.add(entry)
    db.commit()
    flash(request, f"Logged restock for {machine.name}.", "success")
    return RedirectResponse(url="/restocks", status_code=303)


# ---------------------------------------------------------------- commissions

@router.get("/commissions")
def list_commissions(request: Request, db: Session = Depends(get_db)):
    entries = db.query(CommissionPayment).order_by(CommissionPayment.payment_date.desc()).all()
    return render(request, "entries/commissions_list.html", entries=entries)


@router.get("/commissions/new")
def new_commission_form(
    request: Request,
    machine_id: str = "",
    period_start: str = "",
    period_end: str = "",
    db: Session = Depends(get_db),
):
    suggested_amount = None
    if machine_id and period_start and period_end:
        try:
            machine = db.get(Machine, machine_id)
            start = parse_entry_date(period_start, "Period start", allow_future=True)
            end = parse_entry_date(period_end, "Period end", allow_future=True)
            collections = (
                db.query(CollectionEntry)
                .filter(
                    CollectionEntry.machine_id == machine_id,
                    CollectionEntry.collection_date >= start,
                    CollectionEntry.collection_date <= end,
                )
                .all()
            )
            total_cents = sum(c.total_cents for c in collections)
            suggested_cents = suggested_commission_cents(total_cents, machine.commission_rate_percent)
            suggested_amount = CollectionEntry.cents_to_dollars(suggested_cents)
        except (FormValidationError, AttributeError):
            suggested_amount = None

    return render(
        request,
        "entries/commission_form.html",
        machines=_active_machines(db),
        errors=[],
        form_values={
            "machine_id": machine_id,
            "period_start": period_start,
            "period_end": period_end,
            "amount": str(suggested_amount) if suggested_amount is not None else "",
        },
        suggested_amount=suggested_amount,
    )


@router.post("/commissions/new")
def create_commission(
    request: Request,
    machine_id: str = Form(...),
    payment_date: str = Form(...),
    amount: str = Form(...),
    notes: str = Form(""),
    db: Session = Depends(get_db),
):
    form_values = {
        "machine_id": machine_id,
        "payment_date": payment_date,
        "amount": amount,
        "notes": notes,
    }
    try:
        machine = db.get(Machine, machine_id)
        if machine is None:
            raise FormValidationError("Choose a machine.")
        entry_date = parse_entry_date(payment_date, "Payment date")
        amount_cents = parse_money_to_cents(amount, "Commission amount", allow_zero=False)
    except FormValidationError as exc:
        return render(
            request,
            "entries/commission_form.html",
            machines=_active_machines(db),
            errors=[str(exc)],
            form_values=form_values,
            suggested_amount=None,
            status_code=400,
        )

    entry = CommissionPayment(
        machine_id=machine.id, payment_date=entry_date, amount_cents=amount_cents, notes=notes.strip()
    )
    db.add(entry)
    db.commit()
    flash(request, f"Logged commission payment for {machine.name}.", "success")
    return RedirectResponse(url="/commissions", status_code=303)


# --------------------------------------------------------------- maintenance

@router.get("/maintenance")
def list_maintenance(request: Request, db: Session = Depends(get_db)):
    entries = db.query(MaintenanceExpense).order_by(MaintenanceExpense.expense_date.desc()).all()
    return render(request, "entries/maintenance_list.html", entries=entries)


@router.get("/maintenance/new")
def new_maintenance_form(request: Request, db: Session = Depends(get_db)):
    return render(
        request, "entries/maintenance_form.html", machines=_active_machines(db), errors=[], form_values={}
    )


@router.post("/maintenance/new")
def create_maintenance(
    request: Request,
    machine_id: str = Form(...),
    expense_date: str = Form(...),
    amount: str = Form(...),
    description: str = Form(""),
    db: Session = Depends(get_db),
):
    form_values = {
        "machine_id": machine_id,
        "expense_date": expense_date,
        "amount": amount,
        "description": description,
    }
    try:
        machine = db.get(Machine, machine_id)
        if machine is None:
            raise FormValidationError("Choose a machine.")
        entry_date = parse_entry_date(expense_date, "Expense date")
        amount_cents = parse_money_to_cents(amount, "Amount", allow_zero=False)
    except FormValidationError as exc:
        return render(
            request,
            "entries/maintenance_form.html",
            machines=_active_machines(db),
            errors=[str(exc)],
            form_values=form_values,
            status_code=400,
        )

    entry = MaintenanceExpense(
        machine_id=machine.id,
        expense_date=entry_date,
        amount_cents=amount_cents,
        description=description.strip(),
    )
    db.add(entry)
    db.commit()
    flash(request, f"Logged maintenance expense for {machine.name}.", "success")
    return RedirectResponse(url="/maintenance", status_code=303)
