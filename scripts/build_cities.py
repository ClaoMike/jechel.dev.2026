#!/usr/bin/env python3
"""
Builds the city list the API searches when the admin adds a place to the "Where I've been" map.

Downloads GeoNames' cities1000 (every populated place with 1,000+ people, ~170k rows), keeps the
columns the search needs (the ASCII name only when it differs from the name), and writes them gzipped to
backend/src/Portfolio.Api/Features/Places/cities.tsv.gz, which is embedded in the API.

    python3 scripts/build_cities.py

Data: GeoNames (https://www.geonames.org), CC BY 4.0. Re-run to refresh it.
"""

import gzip
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

BASE = "https://download.geonames.org/export/dump/"
OUT = Path(__file__).resolve().parent.parent / "backend/src/Portfolio.Api/Features/Places/cities.tsv.gz"


def fetch(name: str) -> bytes:
    print(f"Downloading {name}…", file=sys.stderr)
    with urllib.request.urlopen(BASE + name) as response:
        return response.read()


def main() -> None:
    countries = {}
    for line in fetch("countryInfo.txt").decode("utf-8").splitlines():
        if line and not line.startswith("#"):
            cols = line.split("\t")
            countries[cols[0]] = cols[4]

    regions = {}
    for line in fetch("admin1CodesASCII.txt").decode("utf-8").splitlines():
        code, name, *_ = line.split("\t")
        regions[code] = name

    with zipfile.ZipFile(io.BytesIO(fetch("cities1000.zip"))) as archive:
        text = archive.read("cities1000.txt").decode("utf-8")

    rows = []
    for line in text.splitlines():
        c = line.split("\t")
        geoname_id, name, ascii_name, lat, lon, country, admin1, population = c[0], c[1], c[2], c[4], c[5], c[8], c[10], c[14]
        rows.append((
            geoname_id,
            name,
            ascii_name if ascii_name != name else "",
            regions.get(f"{country}.{admin1}", ""),
            countries.get(country, country),
            f"{float(lat):.3f}",
            f"{float(lon):.3f}",
            population or "0",
        ))
    # Largest first, so the search can stop at the first matches it finds.
    rows.sort(key=lambda r: -int(r[7]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT, "wt", encoding="utf-8", newline="", compresslevel=9) as out:
        out.write("# GeoNames cities1000 (https://www.geonames.org), CC BY 4.0. Built by scripts/build_cities.py\n")
        # GeoNames fields never contain tabs or newlines, so plain tab-separated lines need no quoting.
        out.writelines("\t".join(row) + "\n" for row in rows)
    print(f"Wrote {len(rows)} places to {OUT} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
