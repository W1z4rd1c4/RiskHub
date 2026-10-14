"""Domain-free canonical UUID predicates for SQL text expressions."""

from sqlalchemy import Boolean
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement


class CanonicalUuid4(FunctionElement):
    """Match lowercase, hyphenated UUID4 text; SQL NULL remains unknown."""

    type = Boolean()
    inherit_cache = True


@compiles(CanonicalUuid4, "sqlite")
def _compile_canonical_uuid4_sqlite(element, compiler, **kw):
    (value,) = [compiler.process(item, **kw) for item in element.clauses]
    hexdigit = "[0-9a-f]"
    pattern = (
        hexdigit * 8
        + "-"
        + hexdigit * 4
        + "-4"
        + hexdigit * 3
        + "-[89ab]"
        + hexdigit * 3
        + "-"
        + hexdigit * 12
    )
    # SQLite GLOB stops at NUL and can match BLOBs. Keep SQL NULL nullable
    # while requiring the same text representation as the strict readers.
    return (
        f"(typeof({value}) IN ('text', 'null') "
        f"AND {value} GLOB '{pattern}' AND instr({value}, char(0)) = 0)"
    )


@compiles(CanonicalUuid4, "postgresql")
def _compile_canonical_uuid4_postgresql(element, compiler, **kw):
    (value,) = [compiler.process(item, **kw) for item in element.clauses]
    pattern = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    return f"({value} ~ '{pattern}')"
