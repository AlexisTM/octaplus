import json
from datetime import date, time
from pathlib import Path

import pytest

from octaplus import DayQuotations, InvalidResponseError
from octaplus._parse import parse_price, parse_response

FIXTURES = Path(__file__).resolve().parent / ".." / ".." / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text())


def test_hour_two_days():
    days = parse_response(load("hour_two_days.json"))
    assert len(days) == 2
    first = days[0]
    assert isinstance(first, DayQuotations)
    assert first.validity_date == date(2026, 6, 10)
    assert first.publication_date == date(2026, 6, 9)
    assert first.publication_time == time(14, 30, 0)
    assert first.currency_unit == "EUR"
    assert first.price_measure_unit == "MWh"
    assert first.available
    assert not first.in_fault
    for day in days:
        assert len(day.prices) == 24
    p1 = first.prices[0]
    assert p1.position == 1
    assert p1.time_range == "00 - 01"
    assert p1.price == 112.7175


def test_comma_float_with_long_tail():
    days = parse_response(load("hour_two_days.json"))
    assert days[0].prices[1].price == 107.28999999999999


def test_quarter_hour_one_day():
    days = parse_response(load("quarter_hour_one_day.json"))
    assert len(days) == 1
    assert len(days[0].prices) == 96
    assert days[0].prices[0].time_range == "00:00 - 00:15"


def test_in_fault_days():
    days = parse_response(load("in_fault_days.json"))
    assert len(days) == 2
    for day in days:
        assert day.in_fault
        assert not day.available
        assert day.prices == ()
        assert day.publication_date is None
        assert day.publication_time is None
        assert day.currency_unit is None
        assert day.price_measure_unit is None
    assert days[0].validity_date == date(2026, 6, 15)


def test_mixed_days():
    days = parse_response(load("mixed_days.json"))
    assert len(days) == 3
    available = [d for d in days if d.available]
    unavailable = [d for d in days if not d.available]
    assert len(available) == 1
    assert len(unavailable) == 2
    assert len(available[0].prices) == 24


def test_single_object_cotations_treated_as_one_day_list():
    payload = load("quarter_hour_one_day.json")
    payload["Cotations"] = payload["Cotations"][0]
    days = parse_response(payload)
    assert len(days) == 1
    assert len(days[0].prices) == 96


def test_parse_price():
    assert parse_price("112,7175") == 112.7175
    assert parse_price("109") == 109.0


@pytest.mark.parametrize(
    "payload",
    [
        [],
        {},
        {"Cotations": "nope"},
        {"Cotations": [{"ValidityDate": "not-a-date", "InFault": 1}]},
        {"Cotations": [{"ValidityDate": "10/06/2026", "InFault": 0, "Cotations": [{"Position": 1, "TimeRange": "00 - 01", "PriceAmount": "abc"}]}]},
    ],
)
def test_invalid_payloads_raise(payload):
    with pytest.raises(InvalidResponseError):
        parse_response(payload)
