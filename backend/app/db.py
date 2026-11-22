from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import duckdb

from .config import DATASETS, dataset_available, dataset_path


@contextmanager
def get_connection() -> Iterator[duckdb.DuckDBPyConnection]:
    con = duckdb.connect(database=":memory:")
    try:
        for name in DATASETS:
            if dataset_available(name):
                path = dataset_path(name).as_posix().replace("'", "''")
                con.execute(f"CREATE VIEW {name} AS SELECT * FROM read_parquet('{path}')")
        con.execute("SET TimeZone='UTC'")
        yield con
    finally:
        con.close()


def available_views() -> list[str]:
    return [name for name in DATASETS if dataset_available(name)]
