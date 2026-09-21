import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { commitSaleHandler } from "./routes/sales.js";

const PORT = Number(process.env.PORT ?? 3000);

const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
  "POST /sales/commit": async (req, res) => {
    const fakeReq = {
      json: async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        return JSON.parse(Buffer.concat(chunks).toString());
      },
    } as unknown as Request;

    const result = await commitSaleHandler(fakeReq);
    res.statusCode = result.status;
    res.setHeader("content-type", result.headers.get("content-type") || "application/json");
    const text = await (result as any).text?.();
    res.end(text || "{}");
  },
};

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const key = `${req.method} ${req.url}`;
  const handler = routes[key];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }
  try {
    await handler(req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: err?.message || "UNKNOWN" }));
  }
});

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
