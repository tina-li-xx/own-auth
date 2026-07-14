export function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  baseURL = "http://localhost"
): Request {
  return new Request(`${baseURL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseURL,
      ...headers
    },
    body: JSON.stringify(body)
  });
}
