import importlib.util


def optional_module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except ModuleNotFoundError as exc:
        if exc.name and (name == exc.name or name.startswith(f"{exc.name}.")):
            return False
        raise
