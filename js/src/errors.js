export class OctaplusError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class TransportError extends OctaplusError {}

export class ApiStatusError extends OctaplusError {
  /**
   * @param {string} message
   * @param {number} status HTTP status code
   */
  constructor(message, status, options) {
    super(message, options);
    this.status = status;
  }
}

export class InvalidResponseError extends OctaplusError {}

export class InvalidDateRangeError extends OctaplusError {}
