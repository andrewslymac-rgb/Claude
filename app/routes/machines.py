from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, Form
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.database import get_db
from app.flash import flash
from app.models import Machine
from app.templating import render

router = APIRouter(prefix="/machines", tags=["machines"])


def _validate_machine_form(name: str, location_name: str, commission_rate_percent: str) -> tuple[dict, list[str]]:
    errors = []
    name = (name or "").strip()
    location_name = (location_name or "").strip()
    if not name:
        errors.append("Machine name/label is required.")
    if not location_name:
        errors.append("Location name is required.")
    try:
        rate = Decimal(commission_rate_percent or "0")
        if rate < 0 or rate > 100:
            errors.append("Commission rate must be between 0 and 100.")
    except InvalidOperation:
        errors.append("Commission rate must be a number.")
        rate = Decimal("0")
    return {"name": name, "location_name": location_name, "commission_rate_percent": rate}, errors


@router.get("")
def list_machines(request: Request, db: Session = Depends(get_db)):
    machines = db.query(Machine).order_by(Machine.active.desc(), Machine.name).all()
    return render(request, "machines/list.html", machines=machines)


@router.get("/new")
def new_machine_form(request: Request):
    return render(request, "machines/form.html", machine=None, errors=[], form_values={})


@router.post("/new")
def create_machine(
    request: Request,
    name: str = Form(...),
    location_name: str = Form(...),
    address: str = Form(""),
    location_contact_name: str = Form(""),
    location_contact_email: str = Form(""),
    commission_rate_percent: str = Form("0"),
    notes: str = Form(""),
    db: Session = Depends(get_db),
):
    cleaned, errors = _validate_machine_form(name, location_name, commission_rate_percent)
    if errors:
        return render(
            request,
            "machines/form.html",
            machine=None,
            errors=errors,
            form_values={
                "name": name,
                "location_name": location_name,
                "address": address,
                "location_contact_name": location_contact_name,
                "location_contact_email": location_contact_email,
                "commission_rate_percent": commission_rate_percent,
                "notes": notes,
            },
            status_code=400,
        )

    machine = Machine(
        name=cleaned["name"],
        location_name=cleaned["location_name"],
        address=address.strip(),
        location_contact_name=location_contact_name.strip(),
        location_contact_email=location_contact_email.strip(),
        commission_rate_percent=cleaned["commission_rate_percent"],
        notes=notes.strip(),
    )
    db.add(machine)
    db.commit()
    flash(request, f"Added machine “{machine.name}”.", "success")
    return RedirectResponse(url="/machines", status_code=303)


@router.get("/{machine_id}/edit")
def edit_machine_form(request: Request, machine_id: str, db: Session = Depends(get_db)):
    machine = db.get(Machine, machine_id)
    if machine is None:
        flash(request, "Machine not found.", "error")
        return RedirectResponse(url="/machines", status_code=303)
    return render(request, "machines/form.html", machine=machine, errors=[], form_values={})


@router.post("/{machine_id}/edit")
def update_machine(
    request: Request,
    machine_id: str,
    name: str = Form(...),
    location_name: str = Form(...),
    address: str = Form(""),
    location_contact_name: str = Form(""),
    location_contact_email: str = Form(""),
    commission_rate_percent: str = Form("0"),
    notes: str = Form(""),
    active: str = Form(None),
    db: Session = Depends(get_db),
):
    machine = db.get(Machine, machine_id)
    if machine is None:
        flash(request, "Machine not found.", "error")
        return RedirectResponse(url="/machines", status_code=303)

    cleaned, errors = _validate_machine_form(name, location_name, commission_rate_percent)
    if errors:
        return render(
            request,
            "machines/form.html",
            machine=machine,
            errors=errors,
            form_values={
                "name": name,
                "location_name": location_name,
                "address": address,
                "location_contact_name": location_contact_name,
                "location_contact_email": location_contact_email,
                "commission_rate_percent": commission_rate_percent,
                "notes": notes,
            },
            status_code=400,
        )

    machine.name = cleaned["name"]
    machine.location_name = cleaned["location_name"]
    machine.address = address.strip()
    machine.location_contact_name = location_contact_name.strip()
    machine.location_contact_email = location_contact_email.strip()
    machine.commission_rate_percent = cleaned["commission_rate_percent"]
    machine.notes = notes.strip()
    machine.active = active == "on"
    db.add(machine)
    db.commit()
    flash(request, f"Saved changes to “{machine.name}”.", "success")
    return RedirectResponse(url="/machines", status_code=303)
