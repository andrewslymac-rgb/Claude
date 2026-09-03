from fastapi import APIRouter, Depends, Form
from sqlalchemy.orm import Session
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.config import get_settings
from app.database import get_db
from app.flash import flash
from app.models import QboAccountSettings, QboConnection
from app.qbo.client import QboApiError, QboClient, QboNotConnectedError
from app.templating import render

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_account_settings(db: Session) -> QboAccountSettings:
    settings_row = db.get(QboAccountSettings, 1)
    if settings_row is None:
        settings_row = QboAccountSettings(id=1)
        db.add(settings_row)
        db.commit()
    return settings_row


@router.get("")
def show_settings(request: Request, db: Session = Depends(get_db)):
    app_settings = get_settings()
    connection = db.get(QboConnection, 1)
    account_settings = _get_account_settings(db)

    accounts, items, class_options, qbo_error = [], [], [], ""
    if connection and connection.is_connected:
        try:
            client = QboClient(db, app_settings)
            accounts = sorted(client.query("select * from Account"), key=lambda a: a.get("Name", ""))
            items = sorted(
                (i for i in client.query("select * from Item") if i.get("Type") in ("Service", "NonInventory")),
                key=lambda i: i.get("Name", ""),
            )
            entity = "Class" if account_settings.tracking_type == "Class" else "Department"
            class_options = sorted(client.query(f"select * from {entity}"), key=lambda c: c.get("Name", ""))
        except QboApiError as exc:
            qbo_error = f"Couldn't load data from QuickBooks: {exc.message}"
        except QboNotConnectedError:
            pass

    return render(
        request,
        "settings.html",
        connection=connection,
        account_settings=account_settings,
        accounts=accounts,
        items=items,
        class_options=class_options,
        qbo_error=qbo_error,
        qbo_client_configured=bool(app_settings.qbo_client_id and app_settings.qbo_client_secret),
        qbo_environment=app_settings.qbo_environment,
    )


@router.post("/accounts")
def save_account_settings(
    request: Request,
    tracking_type: str = Form("Class"),
    deposit_account_ref: str = Form(""),
    sales_item_ref: str = Form(""),
    cogs_account_ref: str = Form(""),
    commission_account_ref: str = Form(""),
    maintenance_account_ref: str = Form(""),
    expense_payment_account_ref: str = Form(""),
    db: Session = Depends(get_db),
):
    app_settings = get_settings()
    account_settings = _get_account_settings(db)
    names = {}

    if connection := db.get(QboConnection, 1):
        if connection.is_connected:
            try:
                client = QboClient(db, app_settings)
                lookups = {
                    "deposit": ("Account", deposit_account_ref),
                    "cogs": ("Account", cogs_account_ref),
                    "commission": ("Account", commission_account_ref),
                    "maintenance": ("Account", maintenance_account_ref),
                    "payment": ("Account", expense_payment_account_ref),
                    "item": ("Item", sales_item_ref),
                }
                for key, (entity, ref) in lookups.items():
                    if ref:
                        names[key] = client.get(entity, ref).get("Name", "")
            except QboApiError:
                pass  # names are cosmetic; ids are still saved below

    account_settings.tracking_type = "Class" if tracking_type == "Class" else "Department"
    account_settings.deposit_account_ref = deposit_account_ref
    account_settings.deposit_account_name = names.get("deposit", account_settings.deposit_account_name)
    account_settings.sales_item_ref = sales_item_ref
    account_settings.sales_item_name = names.get("item", account_settings.sales_item_name)
    account_settings.cogs_account_ref = cogs_account_ref
    account_settings.cogs_account_name = names.get("cogs", account_settings.cogs_account_name)
    account_settings.commission_account_ref = commission_account_ref
    account_settings.commission_account_name = names.get("commission", account_settings.commission_account_name)
    account_settings.maintenance_account_ref = maintenance_account_ref
    account_settings.maintenance_account_name = names.get("maintenance", account_settings.maintenance_account_name)
    account_settings.expense_payment_account_ref = expense_payment_account_ref
    account_settings.expense_payment_account_name = names.get("payment", account_settings.expense_payment_account_name)

    db.add(account_settings)
    db.commit()
    flash(request, "Saved QuickBooks account mapping.", "success")
    return RedirectResponse(url="/settings", status_code=303)
