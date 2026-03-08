import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSession,
  ensureUserFeedToken,
  hashPassword,
  setSessionCookie,
  updateUserGeoSnapshotFromRequest,
  verifyPassword
} from "@/lib/auth";
import { recordAnalyticsEventBestEffort } from "@/lib/admin-analytics/events";
import { fromError } from "@/lib/http";
import { createPrimaryUser, findPrimaryUserByEmail } from "@/lib/metadata-primary-auth";

import { enforceLoginRateLimits, getClientIp } from "@/lib/rate-limit";

// Precomputed bcrypt hash (cost 12) of a dummy value — used for timing-safe
// rejection paths so response time does not reveal whether an email exists.
const DUMMY_HASH = "$2a$12$Bnzzf3TKBt44iQoKsG9.y.3q6bMWBpzE2sXkpS0krc8Yw6hI.CpzG";

const schema = z.object({
  mode: z.enum(["signup", "login"]),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().max(120).optional()
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    await enforceLoginRateLimits(ip);
    const body = schema.parse(await request.json());
    const email = body.email.toLowerCase();

    let user = await findPrimaryUserByEmail(email);

    if (body.mode === "signup") {
      if (user) {
        return NextResponse.json(
          {
            ok: false,
            error_code: "INVALID_INPUT",
            error_message: "Unable to create account. Please check your details or try logging in."
          },
          { status: 400 }
        );
      }

      const passwordHash = await hashPassword(body.password);
      user = await createPrimaryUser({
        email,
        name: body.name || null,
        passwordHash,
        role: "USER"
      });

      await ensureUserFeedToken(user.id);
      await recordAnalyticsEventBestEffort({
        eventType: "USER_SIGNUP",
        userId: user.id,
        dedupeKey: `user_signup:${user.id}`,
        authMethod: "LOCAL",
        segmentAuth: "LOCAL_ONLY",
        userRole: "USER",
        occurredAt: user.createdAt,
        metadata: {
          email_domain: user.email.split("@")[1] || null
        }
      });
    }

    if (!user || !user.passwordHash) {
      // Run a dummy compare so response time does not reveal email existence.
      await verifyPassword(body.password, DUMMY_HASH);
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

    await updateUserGeoSnapshotFromRequest(user.id, request);
    const sessionToken = await createSession(user.id, { authMethod: "LOCAL" });

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
