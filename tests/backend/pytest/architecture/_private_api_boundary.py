"""Static caller boundaries for the explicitly reviewed private-package declarations."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from importlib.util import resolve_name
from pathlib import Path


@dataclass(frozen=True)
class Surface:
    package: str
    exports: dict[str, tuple[str, ...]]
    roles: dict[str, str]
    facades: tuple[str, ...]

    def internal(self, caller: str) -> bool:
        return caller == self.package or caller.startswith(self.package + ".") or caller in self.facades

    def role(self, caller: str) -> str:
        if caller.startswith("app.api."):
            return self.roles.get(caller, "endpoint")
        return "service"


PILOT_PACKAGES = (
    "app.services._risk_questionnaires",
    "app.services._control_execution",
    "app.services._register_listings",
    "app.services._reporting",
    "app.services._dashboard_metrics",
    "app.services._monitoring_status",
    "app.services._quarterly_comparison",
)


def load_surfaces(root: Path) -> tuple[Surface, ...]:
    result = []
    for package in PILOT_PACKAGES:
        path = root / "backend" / Path(*package.split(".")) / "__init__.py"
        tree = ast.parse(path.read_text(), filename=str(path))
        declarations = {}
        for node in tree.body:
            if not isinstance(node, ast.Assign):
                continue
            for target in node.targets:
                if not isinstance(target, ast.Name) or target.id not in {
                    "CALLER_EXPORTS",
                    "CALLER_ROLES",
                    "CALLER_FACADES",
                }:
                    continue
                assert target.id not in declarations, f"private API duplicate {target.id}"
                if isinstance(node.value, ast.Dict):
                    keys = [ast.literal_eval(key) for key in node.value.keys]
                    assert len(keys) == len(set(keys)), "private API duplicate declaration key"
                declarations[target.id] = ast.literal_eval(node.value)
        assert set(declarations) == {"CALLER_EXPORTS", "CALLER_ROLES", "CALLER_FACADES"}, package
        exports = declarations["CALLER_EXPORTS"]
        roles = declarations["CALLER_ROLES"]
        facades = declarations["CALLER_FACADES"]
        assert isinstance(exports, dict) and exports, "private API exports must be nonempty"
        for name, classes in exports.items():
            assert isinstance(name, str) and name.isidentifier(), "private API invalid name"
            assert isinstance(classes, tuple) and classes, "private API invalid classes"
            assert all(isinstance(value, str) and value for value in classes)
            assert len(classes) == len(set(classes)), "private API duplicate caller class"
            assert "service" in classes, "private API public surface must support service callers"
        assert isinstance(roles, dict) and isinstance(facades, tuple)
        assert all(
            isinstance(facade, str)
            and facade.startswith("app.services.")
            and all(part.isidentifier() for part in facade.split("."))
            for facade in facades
        ), "private API invalid facade"
        assert len(facades) == len(set(facades)), "private API duplicate facade"
        known = {value for classes in exports.values() for value in classes}
        for caller, role in roles.items():
            assert isinstance(caller, str) and caller.startswith("app.api."), "private API invalid caller"
            assert role in known and role != "service", "private API invalid endpoint role"
        assert known <= {"service", "endpoint", *roles.values()}, "private API unassigned caller class"
        result.append(Surface(package, exports, roles, facades))
    return tuple(result)


def _stable_literal_maps(tree: ast.Module, parents: dict[ast.AST, ast.AST]) -> dict[str, dict]:
    """Infer only literal maps whose references stay within supported read-only forms.

    This scans whole function/branch bodies too: initialization before a mutation
    does not prove that a later dynamic import still sees the initial targets.
    """
    candidates = {}
    for statement in tree.body:
        if not isinstance(statement, ast.Assign) or not isinstance(statement.value, ast.Dict):
            continue
        try:
            value = ast.literal_eval(statement.value)
        except (ValueError, TypeError):
            continue
        for target in statement.targets:
            if isinstance(target, ast.Name):
                candidates[target.id] = (target, value)
    list_is_shadowed = any(
        (isinstance(node, ast.Name) and node.id == "list" and isinstance(node.ctx, ast.Store))
        or (isinstance(node, ast.arg) and node.arg == "list")
        or (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == "list")
        or (isinstance(node, ast.alias) and (node.asname or node.name.split(".")[0]) == "list")
        for node in ast.walk(tree)
    )
    result = {}
    for name, (declaration, value) in candidates.items():
        stable = True
        for node in ast.walk(tree):
            if isinstance(node, ast.arg) and node.arg == name:
                stable = False
            if not isinstance(node, ast.Name) or node.id != name or node is declaration:
                continue
            owner = parents.get(node)
            if not isinstance(node.ctx, ast.Load):
                stable = False
            elif isinstance(owner, ast.Subscript) and owner.value is node:
                stable = stable and isinstance(owner.ctx, ast.Load)
            elif isinstance(owner, ast.Compare) and node in owner.comparators:
                stable = stable and all(isinstance(op, (ast.In, ast.NotIn)) for op in owner.ops)
            elif isinstance(owner, ast.Call) and isinstance(owner.func, ast.Name) and owner.func.id == "list":
                # __all__ = list(_EXPORTS) is the supported metadata projection.
                stable = stable and len(owner.args) == 1 and not owner.keywords and not list_is_shadowed
            else:
                # Namespace aliasing, methods, argument escape, and unsupported
                # access cannot supply a trusted finite dynamic-import target set.
                stable = False
        if stable:
            result[name] = value
    return result


def _single_unconditional_targets(tree: ast.Module, parents: dict[ast.AST, ast.AST]) -> set[ast.Name]:
    """A deliberately narrow finite-value grammar, without branch-state simulation."""
    from collections import Counter

    scopes = (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)

    def scope_of(node: ast.AST) -> ast.AST:
        owner = parents.get(node, tree)
        while not isinstance(owner, scopes):
            owner = parents.get(owner, tree)
        return owner

    writes = Counter()
    escaped = set()
    wildcard_scopes = set()
    for node in ast.walk(tree):
        names = []
        if isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            names = [node.id]
        elif isinstance(node, ast.arg):
            names = [node.arg]
        elif isinstance(node, ast.alias):
            names = [node.asname or node.name.split(".")[0]]
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names = [node.name]
        elif isinstance(node, (ast.ExceptHandler, ast.MatchAs, ast.MatchStar)) and node.name:
            names = [node.name]
        elif isinstance(node, ast.MatchMapping) and node.rest:
            names = [node.rest]
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            escaped.update(node.names)
        if isinstance(node, ast.ImportFrom) and any(alias.name == "*" for alias in node.names):
            wildcard_scopes.add(scope_of(node))
        for name in names:
            writes[scope_of(node), name] += 1
    allowed = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Subscript):
            continue
        scope = scope_of(node)
        if parents.get(node) is not scope or not isinstance(scope, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for target in node.targets:
            if isinstance(target, ast.Tuple):
                allowed.update(
                    element
                    for element in target.elts
                    if isinstance(element, ast.Name)
                    and writes[scope, element.id] == 1
                    and element.id not in escaped
                    and scope not in wildcard_scopes
                )
    return allowed


def violations(
    source: str,
    caller: str,
    surfaces: tuple[Surface, ...],
    *,
    is_package: bool = False,
    exceptions: frozenset[tuple[str, str]] = frozenset(),
) -> list[str]:
    """Resolve imports and namespace aliases; reject unsupported external escapes."""
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return [f"private API {caller}: unparseable source: {exc.msg}"]
    found: list[str] = []
    parent = {child: node for node in ast.walk(tree) for child in ast.iter_child_nodes(node)}
    literal_maps = _stable_literal_maps(tree, parent)
    inferable_targets = _single_unconditional_targets(tree, parent)

    class Visitor(ast.NodeVisitor):
        def __init__(self) -> None:
            self.string_targets: dict[str, set[str]] = {}
            self.bindings: dict[str, str] = {
                name: "builtins." + name for name in ("__import__", "getattr", "setattr", "delattr")
            }

        def controlled(self, name: str | None) -> bool:
            return bool(name) and any(
                not surface.internal(caller)
                and any(
                    name == prefix or name.startswith(prefix + ".") for prefix in (surface.package, *surface.facades)
                )
                for surface in surfaces
            )

        def bind(self, local: str, target: str | None) -> None:
            self.string_targets.pop(local, None)
            previous = self.bindings.get(local)
            # Conservative across branches: an unrelated assignment cannot erase a
            # possible boundary namespace. This is not a general Python type analysis.
            if self.controlled(previous):
                if target is not None and target != previous and self.controlled(target):
                    found.append(f"private API {caller}: ambiguous boundary alias {local}")
                return
            if target is None:
                self.bindings.pop(local, None)
            else:
                self.bindings[local] = target

        def full(self, node: ast.AST) -> str | None:
            if isinstance(node, ast.Name):
                return self.bindings.get(node.id)
            if isinstance(node, ast.Attribute):
                prefix = self.full(node.value)
                return None if prefix is None else prefix + "." + node.attr
            return None

        def check(self, name: str, node: ast.AST, *, namespace_ok: bool = False) -> None:
            if (caller, name) in exceptions:
                return
            for surface in surfaces:
                if surface.internal(caller):
                    continue
                for prefix in (surface.package, *surface.facades):
                    if name == prefix:
                        if not namespace_ok:
                            found.append(f"private API {caller}:{node.lineno}: escaped namespace {name}")
                    elif name.startswith(prefix + "."):
                        member = name[len(prefix) + 1 :]
                        # An exported value may have attributes; implementation submodules are not exports.
                        public_name = member.split(".")[0]
                        if surface.role(caller) not in surface.exports.get(public_name, ()):
                            found.append(f"private API {caller}:{node.lineno}: forbidden {name}")

        def visit_Import(self, node: ast.Import) -> None:
            for alias in node.names:
                self.check(alias.name, node, namespace_ok=True)
                self.bind(
                    alias.asname or alias.name.split(".")[0], alias.name if alias.asname else alias.name.split(".")[0]
                )

        def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
            module = node.module or ""
            if node.level:
                package = caller if is_package else caller.rpartition(".")[0]
                try:
                    module = resolve_name("." * node.level + module, package)
                except (ImportError, ValueError):
                    found.append(f"private API {caller}:{node.lineno}: invalid relative import")
                    return
            for alias in node.names:
                target = module + "." + alias.name
                self.check(target, node, namespace_ok=True)
                self.bind(alias.asname or alias.name, target)

        def visit_Attribute(self, node: ast.Attribute) -> None:
            name = self.full(node)
            if name is not None:
                container = parent.get(node)
                namespace_ok = (isinstance(container, ast.Attribute) and container.value is node) or (
                    isinstance(container, ast.Assign) and container.value is node
                )
                self.check(name, node, namespace_ok=namespace_ok)
            self.generic_visit(node)

        def visit_Name(self, node: ast.Name) -> None:
            if not isinstance(node.ctx, ast.Load):
                self.string_targets.pop(node.id, None)
                return
            container = parent.get(node)
            if isinstance(container, ast.Attribute) and container.value is node:
                return
            if isinstance(container, ast.Assign) and container.value is node:
                return  # Namespace aliases are propagated by visit_Assign.
            name = self.full(node)
            if name is not None:
                self.check(name, node)

        def visit_Assign(self, node: ast.Assign) -> None:
            name = self.full(node.value)
            self.visit(node.value)
            for target in node.targets:
                if isinstance(target, ast.Tuple) and isinstance(node.value, ast.Subscript):
                    for element in ast.walk(target):
                        if isinstance(element, ast.Name):
                            self.string_targets.pop(element.id, None)
                    mapping = literal_maps.get(getattr(node.value.value, "id", ""))
                    if isinstance(mapping, dict) and mapping:
                        for index, element in enumerate(target.elts):
                            if (
                                isinstance(element, ast.Name)
                                and element in inferable_targets
                                and all(
                                    isinstance(value, tuple) and len(value) > index and isinstance(value[index], str)
                                    for value in mapping.values()
                                )
                            ):
                                self.string_targets[element.id] = {value[index] for value in mapping.values()}
                    continue  # Inferred tuple bindings have already been handled above.
                if isinstance(target, ast.Name):
                    self.string_targets.pop(target.id, None)
                    self.bind(target.id, name)
                else:
                    self.visit(target)

        def visit_Call(self, node: ast.Call) -> None:
            function = self.full(node.func)
            if function in {"importlib.import_module", "builtins.__import__"}:
                target = node.args[0] if node.args else None
                targets = (
                    {target.value}
                    if isinstance(target, ast.Constant) and isinstance(target.value, str)
                    else self.string_targets.get(getattr(target, "id", ""), set())
                )
                if targets:
                    for imported in targets:
                        if imported.startswith("."):
                            package_argument = (
                                node.args[1]
                                if len(node.args) > 1
                                else next(
                                    (keyword.value for keyword in node.keywords if keyword.arg == "package"), None
                                )
                            )
                            if isinstance(package_argument, ast.Constant) and isinstance(package_argument.value, str):
                                package = package_argument.value
                            elif isinstance(package_argument, ast.Name) and package_argument.id == "__name__":
                                package = caller
                            else:
                                found.append(f"private API {caller}:{node.lineno}: unresolved dynamic package")
                                continue
                            try:
                                imported = resolve_name(imported, package)
                            except (ImportError, ValueError):
                                found.append(f"private API {caller}:{node.lineno}: invalid dynamic relative import")
                                continue
                        for surface in surfaces:
                            if not surface.internal(caller) and any(
                                imported == prefix or imported.startswith(prefix + ".")
                                for prefix in (surface.package, *surface.facades)
                            ):
                                found.append(f"private API {caller}:{node.lineno}: dynamic boundary import")
                else:
                    found.append(f"private API {caller}:{node.lineno}: unresolved dynamic import")
            if function in {"builtins.getattr", "builtins.setattr", "builtins.delattr"} and node.args:
                namespace = self.full(node.args[0])
                if namespace:
                    self.check(namespace, node)  # External namespace reflection is not a declared call.
            self.generic_visit(node)

        def visit_FunctionDef(self, node: ast.FunctionDef | ast.AsyncFunctionDef) -> None:
            for expression in (*node.decorator_list, *node.args.defaults, *node.args.kw_defaults):
                if expression is not None:
                    self.visit(expression)
            if node.returns is not None:
                self.visit(node.returns)
            outer = self.bindings
            outer_targets = self.string_targets
            self.bindings = dict(outer)
            self.string_targets = {}
            for argument in (*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs):
                if argument.annotation is not None:
                    self.visit(argument.annotation)
                self.bindings.pop(argument.arg, None)
            for argument in (node.args.vararg, node.args.kwarg):
                if argument is not None:
                    self.bindings.pop(argument.arg, None)
            for child in node.body:
                self.visit(child)
            self.bindings = outer
            self.string_targets = outer_targets
            self.string_targets.pop(node.name, None)

        visit_AsyncFunctionDef = visit_FunctionDef

        def visit_Lambda(self, node: ast.Lambda) -> None:
            for expression in (*node.args.defaults, *node.args.kw_defaults):
                if expression is not None:
                    self.visit(expression)
            outer, outer_targets = self.bindings, self.string_targets
            self.bindings, self.string_targets = dict(outer), {}
            for argument in (*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs):
                self.bindings.pop(argument.arg, None)
            for argument in (node.args.vararg, node.args.kwarg):
                if argument is not None:
                    self.bindings.pop(argument.arg, None)
            self.visit(node.body)
            self.bindings, self.string_targets = outer, outer_targets

        def visit_ClassDef(self, node: ast.ClassDef) -> None:
            for expression in (*node.decorator_list, *node.bases):
                self.visit(expression)
            for keyword in node.keywords:
                self.visit(keyword.value)
            outer, outer_targets = self.bindings, self.string_targets
            self.bindings, self.string_targets = dict(outer), {}
            for statement in node.body:
                self.visit(statement)
            self.bindings, self.string_targets = outer, outer_targets
            self.string_targets.pop(node.name, None)

    visitor = Visitor()

    def global_nodes(statements):
        for statement in statements:
            if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                continue
            yield statement
            for field in ("body", "orelse", "finalbody"):
                yield from global_nodes(getattr(statement, field, []))
            for handler in getattr(statement, "handlers", []):
                yield from global_nodes(handler.body)

    globals_in_source = list(global_nodes(tree.body))
    # Python functions resolve module globals when called, not when defined.
    for node in globals_in_source:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            visitor.visit(node)
    for _ in range(len(globals_in_source) + 1):
        before = dict(visitor.bindings)
        for node in globals_in_source:
            if isinstance(node, ast.Assign):
                name = visitor.full(node.value)
                for target in node.targets:
                    if isinstance(target, ast.Name) and name is not None:
                        visitor.bind(target.id, name)
        if before == visitor.bindings:
            break
    visitor.visit(tree)
    return sorted(set(found))


def assert_sources(root: Path, sources: dict[str, str]) -> None:
    surfaces = load_surfaces(root)
    errors = [error for caller, source in sources.items() for error in violations(source, caller, surfaces)]
    assert not errors, "\n".join(errors)


def endpoint_dependency_violations(source: str, caller: str, *, is_package: bool = False) -> list[str]:
    """Service dependencies may not target HTTP adapters, including aliases and relatives."""
    prefix = "app.api.v1.endpoints"
    surface = Surface(prefix, {}, {}, ())
    errors = violations(source, caller, (surface,), is_package=is_package)
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return errors
    for node in ast.walk(tree):
        targets: list[str] = []
        if isinstance(node, ast.Import):
            targets = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level:
                package = caller if is_package else caller.rpartition(".")[0]
                try:
                    module = resolve_name("." * node.level + module, package)
                except (ImportError, ValueError):
                    continue  # The shared checker already reports invalid relative syntax.
            targets = [module + "." + alias.name for alias in node.names]
        for target in targets:
            if target == prefix or target.startswith(prefix + "."):
                errors.append(f"private API {caller}:{node.lineno}: endpoint dependency {target}")
    return sorted(set(errors))


def load_exceptions(path: Path, *, today=None) -> frozenset[tuple[str, str]]:
    import tomllib
    from datetime import UTC, date, datetime

    current = today or datetime.now(UTC).date()
    document = tomllib.loads(path.read_text())
    assert set(document) == {"exceptions"}, "private API invalid exception schema"
    result = set()
    for entry in document["exceptions"]:
        assert set(entry) == {"caller", "target", "expires", "reason"}, "private API exception fields"
        caller, target = entry["caller"], entry["target"]
        assert isinstance(caller, str) and caller.startswith("app.services."), "private API caller exception"
        assert isinstance(target, str) and any(target.startswith(package + ".") for package in PILOT_PACKAGES)
        assert all(part.isidentifier() for part in (caller + "." + target).split(".")), "private API wildcard"
        assert isinstance(entry["expires"], date) and entry["expires"] >= current, "private API expired exception"
        assert isinstance(entry["reason"], str) and entry["reason"].strip(), "private API exception reason"
        assert (caller, target) not in result, "private API duplicate exception"
        result.add((caller, target))
    return frozenset(result)
