from __future__ import annotations

from collections.abc import Generator
from datetime import date, timedelta

SEARCH_FLOOR = date(2000, 1, 1)

_ONE_DAY = timedelta(days=1)


def earliest_search(known: date, today: date) -> Generator[date, bool, date | None]:
    """Yields dates to probe, receives their availability, returns the earliest
    available date (None if nothing is available). Assumes availability is a
    contiguous suffix: in-fault before the floor, available from it onward."""
    if (yield known):
        if not (yield known - _ONE_DAY):
            return known
        lo, hi = SEARCH_FLOOR, known - _ONE_DAY
    else:
        hi = today
        if not (yield hi):
            hi = hi - _ONE_DAY
            if not (yield hi):
                return None
        lo = known + _ONE_DAY
    lo_o, hi_o = lo.toordinal(), hi.toordinal()
    while lo_o < hi_o:
        mid = (lo_o + hi_o) // 2
        if (yield date.fromordinal(mid)):
            hi_o = mid
        else:
            lo_o = mid + 1
    return date.fromordinal(hi_o)
