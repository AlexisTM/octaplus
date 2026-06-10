from datetime import date

from octaplus import OctaplusClient


def main() -> None:
    today = date.today()
    with OctaplusClient() as client:
        day = client.get_day(today)
    if not day.available:
        print(f"No quotations published yet for {today}")
        return
    print(f"Quotations for {day.validity_date} ({day.currency_unit}/{day.price_measure_unit}):")
    for point in day.prices[:6]:
        print(f"  {point.time_range}  {point.price:8.2f}")
    print(f"  ... {len(day.prices)} points total")


if __name__ == "__main__":
    main()
