import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const MAX_REQUESTS = 30; // Max requests per window
const requestCounts = new Map<string, { count: number; resetTime: number }>();

// Cleanup old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 300_000);

/**
 * Rate limiting proxy for embed endpoints.
 * Prevents abuse by limiting requests per IP address.
 * 
 * Note: This is the Next.js 16+ "proxy" convention (replaces "middleware").
 */
export function proxy(request: NextRequest) {
  // Get IP from x-forwarded-for header (set by most reverse proxies)
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  
  const now = Date.now();
  const key = `${ip}:embed`;

  let record = requestCounts.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    requestCounts.set(key, record);
  }

  record.count++;

  if (record.count > MAX_REQUESTS) {
    return new NextResponse("Too many requests. Please try again later.", {
      status: 429,
      headers: {
        "Content-Type": "text/plain",
        "Retry-After": String(Math.ceil((record.resetTime - now) / 1000)),
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/embed/:path*",
};
