from new_project.core import greet


def test_greet():
    assert greet("world") == "Hello, world!"
