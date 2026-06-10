from datetime import date, datetime, timedelta

import httpx
import pytest

from octaplus import APIStatusError, Granularity, AsyncOctaplusClient, OctaplusClient
from octaplus._discover import SEARCH_FLOOR, earliest_search

KNOWN = date(2023, 4, 11)
TODAY = date(2026, 6, 10)


def drive(available, known=KNOWN, today=TODAY):
    search = earliest_search(known, today)
    probes = []
    try:
        day = next(search)
        while True:
            probes.append(day)
            day = search.send(available(day))
    except StopIteration as stop:
        return stop.value, probes


def test_fast_path_confirms_known_floor_in_two_probes():
    result, probes = drive(lambda d: d >= KNOWN)
    assert result == KNOWN
    assert probes == [KNOWN, KNOWN - timedelta(days=1)]


def test_finds_later_floor_by_bisection():
    floor = date(2024, 3, 15)
    result, probes = drive(lambda d: d >= floor)
    assert result == floor
    assert len(probes) <= 20
    assert len(set(probes)) == len(probes)


def test_finds_backfilled_earlier_floor():
    floor = date(2022, 1, 1)
    result, _ = drive(lambda d: d >= floor)
    assert result == floor


def test_floor_at_search_lower_bound():
    result, _ = drive(lambda d: True)
    assert result == SEARCH_FLOOR


def test_only_today_available():
    result, _ = drive(lambda d: d >= TODAY)
    assert result == TODAY


def test_nothing_available_returns_none_in_three_probes():
    result, probes = drive(lambda d: False)
    assert result is None
    assert probes == [KNOWN, TODAY, TODAY - timedelta(days=1)]


def floor_transport(floor):
    counter = {"requests": 0}

    def handler(request):
        counter["requests"] += 1
        raw = request.url.params["ValidityDate"]
        day = datetime.strptime(raw, "%d/%m/%Y").date()
        if day >= floor:
            entry = {
                "ValidityDate": raw,
                "PublicationDate": raw,
                "PublicationTime": "14:30:00",
                "CurrencyUnit": "EUR",
                "PriceMeasureUnit": "MWh",
                "Cotations": [{"Position": 1, "TimeRange": "00 - 01", "PriceAmount": "100,0"}],
                "InFault": 0,
            }
        else:
            entry = {"ValidityDate": raw, "InFault": 1}
        return httpx.Response(200, json={"Cotations": [entry]})

    return httpx.MockTransport(handler), counter


def test_client_discovers_synthetic_floor():
    floor = date(2024, 3, 15)
    transport, counter = floor_transport(floor)
    with OctaplusClient(transport=transport) as client:
        assert client.get_earliest_validity_date(Granularity.HOUR) == floor
    assert counter["requests"] <= 20


def test_client_fast_path_makes_exactly_two_requests():
    transport, counter = floor_transport(Granularity.HOUR.known_earliest_validity_date)
    with OctaplusClient(transport=transport) as client:
        result = client.get_earliest_validity_date(Granularity.HOUR)
    assert result == Granularity.HOUR.known_earliest_validity_date
    assert counter["requests"] == 2


def test_probe_errors_propagate():
    def handler(request):
        return httpx.Response(500, text="boom")

    with OctaplusClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(APIStatusError):
            client.get_earliest_validity_date()


async def test_async_client_fast_path():
    floor = date(2025, 11, 1)
    transport, counter = floor_transport(floor)
    async with AsyncOctaplusClient(transport=transport) as client:
        result = await client.get_earliest_validity_date(Granularity.QUARTER_HOUR)
    assert result == floor
    assert counter["requests"] == 2
