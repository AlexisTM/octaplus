from __future__ import annotations

import json
from datetime import date

import httpx

from ._discover import earliest_search
from ._errors import APIStatusError, InvalidDateRangeError, InvalidResponseError, TransportError
from ._models import DayQuotations, Granularity
from ._parse import parse_response

DEFAULT_BASE_URL = "https://srv.octaplus.be"
DEFAULT_TIMEOUT = 10.0
_PATH = "/websiterest/GetTarDynCotations"


def _format_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def _build_params(start: date, end: date | None, granularity: Granularity) -> dict[str, str]:
    if end is None:
        end = start
    if end < start:
        raise InvalidDateRangeError(f"end date {end} is before start date {start}")
    return {
        "ValidityDate": _format_date(start),
        "ToValidityDate": _format_date(end),
        "Granularity": str(Granularity(granularity).value),
        "CallStating": "0",
    }


def _handle_response(response: httpx.Response) -> list[DayQuotations]:
    if not (200 <= response.status_code < 300):
        raise APIStatusError(
            f"API returned HTTP {response.status_code}", status_code=response.status_code
        )
    try:
        payload = response.json()
    except (json.JSONDecodeError, ValueError) as exc:
        raise InvalidResponseError(f"response body is not valid JSON: {exc}") from exc
    return parse_response(payload)


def _single_day(days: list[DayQuotations], day: date) -> DayQuotations:
    if len(days) != 1:
        raise InvalidResponseError(f"expected 1 day entry for {day}, got {len(days)}")
    return days[0]


class OctaplusClient:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        *,
        transport: httpx.BaseTransport | None = None,
    ):
        self._http = httpx.Client(base_url=base_url, timeout=timeout, transport=transport)

    def __enter__(self) -> OctaplusClient:
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    def close(self) -> None:
        self._http.close()

    def get_quotations(
        self,
        start: date,
        end: date | None = None,
        granularity: Granularity = Granularity.HOUR,
    ) -> list[DayQuotations]:
        params = _build_params(start, end, granularity)
        try:
            response = self._http.get(_PATH, params=params)
        except httpx.TransportError as exc:
            raise TransportError(str(exc)) from exc
        return _handle_response(response)

    def get_day(self, day: date, granularity: Granularity = Granularity.HOUR) -> DayQuotations:
        return _single_day(self.get_quotations(day, day, granularity), day)

    def get_earliest_validity_date(
        self, granularity: Granularity = Granularity.HOUR
    ) -> date | None:
        granularity = Granularity(granularity)
        search = earliest_search(granularity.known_earliest_validity_date, date.today())
        try:
            day = next(search)
            while True:
                day = search.send(self.get_day(day, granularity).available)
        except StopIteration as stop:
            return stop.value


class AsyncOctaplusClient:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._http = httpx.AsyncClient(base_url=base_url, timeout=timeout, transport=transport)

    async def __aenter__(self) -> AsyncOctaplusClient:
        return self

    async def __aexit__(self, *exc_info) -> None:
        await self.close()

    async def close(self) -> None:
        await self._http.aclose()

    async def get_quotations(
        self,
        start: date,
        end: date | None = None,
        granularity: Granularity = Granularity.HOUR,
    ) -> list[DayQuotations]:
        params = _build_params(start, end, granularity)
        try:
            response = await self._http.get(_PATH, params=params)
        except httpx.TransportError as exc:
            raise TransportError(str(exc)) from exc
        return _handle_response(response)

    async def get_day(
        self, day: date, granularity: Granularity = Granularity.HOUR
    ) -> DayQuotations:
        return _single_day(await self.get_quotations(day, day, granularity), day)

    async def get_earliest_validity_date(
        self, granularity: Granularity = Granularity.HOUR
    ) -> date | None:
        granularity = Granularity(granularity)
        search = earliest_search(granularity.known_earliest_validity_date, date.today())
        try:
            day = next(search)
            while True:
                day = search.send((await self.get_day(day, granularity)).available)
        except StopIteration as stop:
            return stop.value
