export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the API. Check that the API server is running on port 4000.");
  }
  const raw = await response.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`The API returned an invalid response (${response.status}). Check the API server terminal.`);
  }
  if (!response.ok) throw new Error(data?.error || `API request failed (${response.status}). Check http://localhost:4000/api/health and the API server terminal.`);
  if (data === null) throw new Error("The API returned an empty response. Check the API server terminal.");
  return data;
}
export const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";
