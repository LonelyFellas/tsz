/** A frontend contract/response diagnostic, distinct from a server HttpError. */
export class ClientResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientResponseError";
  }
}
