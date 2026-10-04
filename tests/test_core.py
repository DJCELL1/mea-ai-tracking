from mea_ai_tracking.core import greet


def test_greet():
    assert greet("world") == "Hello, world!"
