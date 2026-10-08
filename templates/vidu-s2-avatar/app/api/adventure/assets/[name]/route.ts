import { readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../../../../lib/adventure-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  if (!/^[a-f0-9-]{36}\.(png|jpg|mp4)$/.test(name))
    return new Response("Not found", { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(DATA_DIR, name));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const mime = name.endsWith("mp4")
    ? "video/mp4"
    : name.endsWith("png")
      ? "image/png"
      : "image/jpeg";
  const headers = {
    "Content-Type": mime,
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };
  const range = request.headers.get("Range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    const start = match[1]
      ? Number(match[1])
      : Math.max(0, bytes.length - Number(match[2]));
    const end =
      match[1] && match[2]
        ? Math.min(Number(match[2]), bytes.length - 1)
        : bytes.length - 1;
    if (start > end || start >= bytes.length)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(new Uint8Array(bytes), {
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
