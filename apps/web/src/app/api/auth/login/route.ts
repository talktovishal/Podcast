import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSession,
  ensureUserFeedToken,
  hashPassword,
  setSessionCookie,
  verifyPassword
} from "@/lib/auth";
import { fromError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAdminUser } from "@/lib/user-bootstrap";

const schema = z.object({
  mode: z.enum(["signup", "login"]),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().max(120).optional()
});

export async function POST(request: NextRequest) {
  try {
    await ensureAdminUser();
    const body = schema.parse(await request.json());
    const email = body.email.toLowerCase();

    let user = await prisma.user.findUnique({ where: { email } });

    if (body.mode === "signup") {
      if (user) {
        return NextResponse.json(
          {
            ok: false,
            error_code: "INVALID_INPUT",
            error_message: "An account with this email already exists."
          },
          { status: 400 }
        );
      }

      const passwordHash = await hashPassword(body.password);
      user = await prisma.user.create({
        data: {
          email,
          name: body.name || null,
          passwordHash,
          role: "USER"
        }
      });

      await ensureUserFeedToken(user.id);
    }

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "UNAUTHORIZED",
          error_message: "Invalid email or password."
        },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "UNAUTHORIZED",
          error_message: "Invalid email or password."
        },
        { status: 401 }
      );
    }

    const sessionToken = await createSession(user.id);

    const response = NextResponse.json({ ok: true, role: user.role });
    await setSessionCookie(response, sessionToken);

    return response;
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/auth/login"
    });
  }
}
