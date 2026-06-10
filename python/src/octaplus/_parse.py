from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from ._errors import InvalidResponseError
from ._models import DayQuotations, PricePoint


def parse_price(raw: Any) -> float:
    if not isinstance(raw, str):
        raise InvalidResponseError(f"expected price string, got {raw!r}")
    try:
        # Belgian locale: comma decimal separator
        return float(raw.replace(",", "."))
    except ValueError:
        raise InvalidResponseError(f"unparseable price: {raw!r}") from None


def parse_api_date(raw: Any) -> date:
    if not isinstance(raw, str):
        raise InvalidResponseError(f"expected date string, got {raw!r}")
    try:
        return datetime.strptime(raw, "%d/%m/%Y").date()
    except ValueError:
        raise InvalidResponseError(f"unparseable date: {raw!r}") from None


def parse_api_time(raw: Any) -> time:
    if not isinstance(raw, str):
        raise InvalidResponseError(f"expected time string, got {raw!r}")
    try:
        return datetime.strptime(raw, "%H:%M:%S").time()
    except ValueError:
        raise InvalidResponseError(f"unparseable time: {raw!r}") from None


def _parse_point(entry: Any) -> PricePoint:
    if not isinstance(entry, dict):
        raise InvalidResponseError(f"expected price point object, got {entry!r}")
    position = entry.get("Position")
    time_range = entry.get("TimeRange")
    if not isinstance(position, int) or not isinstance(time_range, str):
        raise InvalidResponseError(f"malformed price point: {entry!r}")
    return PricePoint(position=position, time_range=time_range, price=parse_price(entry.get("PriceAmount")))


def _parse_day(entry: Any) -> DayQuotations:
    if not isinstance(entry, dict):
        raise InvalidResponseError(f"expected day object, got {entry!r}")
    validity_date = parse_api_date(entry.get("ValidityDate"))
    if entry.get("InFault"):
        return DayQuotations(
            validity_date=validity_date,
            in_fault=True,
            publication_date=None,
            publication_time=None,
            currency_unit=None,
            price_measure_unit=None,
            prices=(),
        )
    points = entry.get("Cotations")
    if not isinstance(points, list):
        raise InvalidResponseError(f"missing price points for {validity_date}")
    return DayQuotations(
        validity_date=validity_date,
        in_fault=False,
        publication_date=parse_api_date(entry.get("PublicationDate")),
        publication_time=parse_api_time(entry.get("PublicationTime")),
        currency_unit=entry.get("CurrencyUnit"),
        price_measure_unit=entry.get("PriceMeasureUnit"),
        prices=tuple(_parse_point(p) for p in points),
    )


def parse_response(payload: Any) -> list[DayQuotations]:
    if not isinstance(payload, dict) or "Cotations" not in payload:
        raise InvalidResponseError(f"unexpected response shape: {payload!r}")
    days = payload["Cotations"]
    if isinstance(days, dict):  # API returns a bare object for single-day responses
        days = [days]
    if not isinstance(days, list):
        raise InvalidResponseError(f"unexpected Cotations shape: {days!r}")
    return [_parse_day(d) for d in days]
