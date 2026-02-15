from __future__ import annotations

from dataclasses import dataclass

from fastapi.routing import APIRoute
from starlette.convertors import StringConvertor

from app.main import app


def _segments(path: str) -> list[str]:
    return [segment for segment in path.strip("/").split("/") if segment]


def _is_dynamic(segment: str) -> bool:
    return segment.startswith("{") and segment.endswith("}")


def _dynamic_param_name(segment: str) -> str:
    inner = segment.strip("{}")
    return inner.split(":", 1)[0]


@dataclass(frozen=True)
class _RouteInfo:
    idx: int
    route: APIRoute
    segments: list[str]
    methods: set[str]


def test_no_dynamic_string_route_shadows_static_sibling() -> None:
    """Regression guard: prevent route-ordering shadow bugs.

    A route like `/things/{thing_id}` (StringConvertor) will match `/things/due-soon` and
    cause FastAPI to return 422 before the intended static route is evaluated.
    """
    routes: list[_RouteInfo] = []
    for idx, r in enumerate(app.router.routes):
        if not isinstance(r, APIRoute):
            continue
        routes.append(
            _RouteInfo(
                idx=idx,
                route=r,
                segments=_segments(r.path),
                methods=set(r.methods or []),
            )
        )

    collisions: list[tuple[_RouteInfo, _RouteInfo]] = []
    for earlier in routes:
        for later in routes:
            if earlier.idx >= later.idx:
                continue
            if len(earlier.segments) != len(later.segments):
                continue
            if not (earlier.methods & later.methods):
                continue

            matches = True
            has_dynamic_string_shadow = False
            for earlier_seg, later_seg in zip(earlier.segments, later.segments, strict=True):
                if _is_dynamic(earlier_seg):
                    if _is_dynamic(later_seg):
                        matches = False
                        break
                    param = _dynamic_param_name(earlier_seg)
                    convertor = earlier.route.param_convertors.get(param)
                    if convertor is not None and not isinstance(convertor, StringConvertor):
                        matches = False
                        break
                    has_dynamic_string_shadow = True
                    continue

                if earlier_seg != later_seg:
                    matches = False
                    break

            if matches and has_dynamic_string_shadow:
                collisions.append((earlier, later))

    assert not collisions, (
        "Found potential route shadowing (earlier dynamic StringConvertor route shadows later static route):\n"
        + "\n".join(
            f"- [{a.idx}] {sorted(a.methods)} {a.route.path}  shadows  [{b.idx}] {sorted(b.methods)} {b.route.path}"
            for a, b in collisions
        )
    )

