from datetime import date
from pathlib import Path

import httpx
import pytest

from octaplus import (
    APIStatusError,
    AsyncOctaplusClient,
    Granularity,
    InvalidDateRangeError,
    InvalidResponseError,
    OctaplusClient,
    TransportError,
)

FIXTURES = Path(__file__).resolve().parent / ".." / ".." / "fixtures"

HOUR_BODY = (FIXTURES / "hour_two_days.json").read_text()
ONE_DAY_BODY = (FIXTURES / "quarter_hour_one_day.json").read_text()


def fixed_response(body, status_code=200):
    captured = {}

    def handler(request):
        captured["request"] = request
        return httpx.Response(status_code, text=body)

    return httpx.MockTransport(handler), captured


def raising_transport(exc):
    def handler(request):
        raise exc

    return httpx.MockTransport(handler)


def test_query_params_exact():
    transport, captured = fixed_response(HOUR_BODY)
    with OctaplusClient(transport=transport) as client:
        days = client.get_quotations(date(2026, 6, 10))
    request = captured["request"]
    assert request.url.path == "/websiterest/GetTarDynCotations"
    assert dict(request.url.params) == {
        "ValidityDate": "10/06/2026",
        "ToValidityDate": "10/06/2026",
        "Granularity": "HOUR",
        "CallStating": "0",
    }
    assert len(days) == 2


def test_quarter_hour_wire_string_and_explicit_end():
    transport, captured = fixed_response(ONE_DAY_BODY)
    with OctaplusClient(transport=transport) as client:
        client.get_quotations(date(2026, 6, 10), date(2026, 6, 12), Granularity.QUARTER_HOUR)
    params = dict(captured["request"].url.params)
    assert params["Granularity"] == "QUARTER_HOUR"
    assert params["ToValidityDate"] == "12/06/2026"


def test_http_500_raises_api_status_error():
    transport, _ = fixed_response("boom", status_code=500)
    with OctaplusClient(transport=transport) as client:
        with pytest.raises(APIStatusError) as exc_info:
            client.get_quotations(date(2026, 6, 10))
    assert exc_info.value.status_code == 500


def test_connect_error_raises_transport_error():
    transport = raising_transport(httpx.ConnectError("dns failure"))
    with OctaplusClient(transport=transport) as client:
        with pytest.raises(TransportError):
            client.get_quotations(date(2026, 6, 10))


def test_garbage_body_raises_invalid_response_error():
    transport, _ = fixed_response("<html>not json</html>")
    with OctaplusClient(transport=transport) as client:
        with pytest.raises(InvalidResponseError):
            client.get_quotations(date(2026, 6, 10))


def test_get_day_returns_single_day():
    transport, captured = fixed_response(ONE_DAY_BODY)
    with OctaplusClient(transport=transport) as client:
        day = client.get_day(date(2026, 6, 10), Granularity.QUARTER_HOUR)
    assert day.validity_date == date(2026, 6, 10)
    assert len(day.prices) == 96
    params = dict(captured["request"].url.params)
    assert params["ValidityDate"] == params["ToValidityDate"] == "10/06/2026"


def test_get_day_wrong_entry_count_raises():
    transport, _ = fixed_response(HOUR_BODY)
    with OctaplusClient(transport=transport) as client:
        with pytest.raises(InvalidResponseError):
            client.get_day(date(2026, 6, 10))


def test_end_before_start_raises_invalid_date_range_error():
    transport, captured = fixed_response(HOUR_BODY)
    with OctaplusClient(transport=transport) as client:
        with pytest.raises(InvalidDateRangeError):
            client.get_quotations(date(2026, 6, 10), date(2026, 6, 9))
    assert "request" not in captured
    assert issubclass(InvalidDateRangeError, ValueError)


async def test_async_query_params_and_result():
    transport, captured = fixed_response(HOUR_BODY)
    async with AsyncOctaplusClient(transport=transport) as client:
        days = await client.get_quotations(date(2026, 6, 10))
    assert dict(captured["request"].url.params) == {
        "ValidityDate": "10/06/2026",
        "ToValidityDate": "10/06/2026",
        "Granularity": "HOUR",
        "CallStating": "0",
    }
    assert len(days) == 2
    assert days[0].prices[0].price == 112.7175


async def test_async_http_500():
    transport, _ = fixed_response("boom", status_code=500)
    async with AsyncOctaplusClient(transport=transport) as client:
        with pytest.raises(APIStatusError) as exc_info:
            await client.get_quotations(date(2026, 6, 10))
    assert exc_info.value.status_code == 500


async def test_async_connect_error():
    transport = raising_transport(httpx.ConnectError("dns failure"))
    async with AsyncOctaplusClient(transport=transport) as client:
        with pytest.raises(TransportError):
            await client.get_quotations(date(2026, 6, 10))


async def test_async_garbage_body():
    transport, _ = fixed_response("{{{")
    async with AsyncOctaplusClient(transport=transport) as client:
        with pytest.raises(InvalidResponseError):
            await client.get_quotations(date(2026, 6, 10))


async def test_async_get_day():
    transport, _ = fixed_response(ONE_DAY_BODY)
    async with AsyncOctaplusClient(transport=transport) as client:
        day = await client.get_day(date(2026, 6, 10), Granularity.QUARTER_HOUR)
    assert len(day.prices) == 96


async def test_async_end_before_start():
    transport, _ = fixed_response(HOUR_BODY)
    async with AsyncOctaplusClient(transport=transport) as client:
        with pytest.raises(ValueError):
            await client.get_quotations(date(2026, 6, 10), date(2026, 6, 1))
