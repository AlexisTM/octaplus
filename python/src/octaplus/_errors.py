class OctaplusError(Exception):
    pass


class TransportError(OctaplusError):
    pass


class APIStatusError(OctaplusError):
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


class InvalidResponseError(OctaplusError):
    pass


class InvalidDateRangeError(OctaplusError, ValueError):
    pass
