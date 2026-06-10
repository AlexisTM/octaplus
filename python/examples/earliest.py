from octaplus import Granularity, OctaplusClient

with OctaplusClient() as client:
    for granularity in Granularity:
        earliest = client.get_earliest_validity_date(granularity)
        print(granularity.value, earliest.isoformat() if earliest else "none")
