from __future__ import annotations

import sys
from dataclasses import dataclass
from datetime import date, time

if sys.version_info >= (3, 11):
    from enum import StrEnum
else:
    from enum import Enum

    class StrEnum(str, Enum):
        def __str__(self) -> str:
            return self.value


class Granularity(StrEnum):
    HOUR = "HOUR"
    QUARTER_HOUR = "QUARTER_HOUR"

    @property
    def known_earliest_validity_date(self) -> date:
        return _KNOWN_EARLIEST[self]


# Observed 10/06/2026; the operator backfills, so treat as hints —
# Client.get_earliest_validity_date() discovers the live floor.
_KNOWN_EARLIEST = {
    Granularity.HOUR: date(2023, 4, 11),
    Granularity.QUARTER_HOUR: date(2025, 11, 1),
}


@dataclass(frozen=True)
class PricePoint:
    position: int
    time_range: str
    price: float  # EUR/MWh


@dataclass(frozen=True)
class DayQuotations:
    validity_date: date
    in_fault: bool
    publication_date: date | None
    publication_time: time | None
    currency_unit: str | None
    price_measure_unit: str | None
    prices: tuple[PricePoint, ...]

    @property
    def available(self) -> bool:
        return not self.in_fault
