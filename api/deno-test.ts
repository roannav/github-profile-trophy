export default function handler(req: Request): Response {
  return new Response("Deno function is working!", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
