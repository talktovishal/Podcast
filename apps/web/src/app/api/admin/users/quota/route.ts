import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserFromRequest } from "@/lib/auth";
import { buildBillingSnapshot, buildEffectivePaidState } from "@/lib/billing";
import { fromError } from "@/lib/http";
import { findPrimaryUserById, listPrimaryUsers, updatePrimaryUser } from "@/lib/metadata-primary-auth";
import { buildSubmissionQuotaSnapshot } from "@/lib/submission-quota";

const updateQuotaSchema = z.object({
  userId: z.string().min(1),
  complimentaryPro: z.boolean(),
  extraSubmissionCredits: z.number().int().min(0).max(100000)
});

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const user = await getAuthUserFromRequest(request);
  return Boolean(user && user.role === "ADMIN");
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const allowed = await requireAdmin(request);
    if (!allowed) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    const query = request.nextUrl.searchParams.get("q")?.trim();
    const users = await listPrimaryUsers(200);
    const normalizedQuery = query?.toLowerCase() ?? "";
    const filteredUsers = normalizedQuery
      ? users.filter((user) => {
          const email = user.email.toLowerCase();
          const name = user.name?.toLowerCase() ?? "";
          return email.includes(normalizedQuery) || name.includes(normalizedQuery);
        })
      : users;

    return NextResponse.json({
      ok: true,
      users: filteredUsers.slice(0, 100).map((user) => {
        const quota = buildSubmissionQuotaSnapshot({
          isPaid: user.isPaid,
          submissionCount: user.submissionCount,
          extraSubmissionCredits: user.extraSubmissionCredits
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          complimentaryPro: user.complimentaryPro,
          isPaid: user.isPaid,
          submissionCount: user.submissionCount,
          extraSubmissionCredits: user.extraSubmissionCredits,
          billing: buildBillingSnapshot(user),
          quota
        };
      })
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/admin/users/quota"
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const allowed = await requireAdmin(request);
    if (!allowed) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 403 });
    }

    const payload = updateQuotaSchema.parse(await request.json());
    const currentUser = await findPrimaryUserById(payload.userId);
    if (!currentUser) {
      return NextResponse.json({ ok: false, error_code: "NOT_FOUND", error_message: "User was not found." }, { status: 404 });
    }

    await updatePrimaryUser(payload.userId, {
      complimentaryPro: payload.complimentaryPro,
      isPaid: buildEffectivePaidState(currentUser, { complimentaryPro: payload.complimentaryPro }),
      extraSubmissionCredits: payload.extraSubmissionCredits
    });
    const user = await findPrimaryUserById(payload.userId);
    if (!user) {
      return NextResponse.json(
        { ok: false, error_code: "NOT_FOUND", error_message: "User was not found after quota update." },
        { status: 404 }
      );
    }

    const quota = buildSubmissionQuotaSnapshot({
      isPaid: user.isPaid,
      submissionCount: user.submissionCount,
      extraSubmissionCredits: user.extraSubmissionCredits
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        complimentaryPro: user.complimentaryPro,
        isPaid: user.isPaid,
        submissionCount: user.submissionCount,
        extraSubmissionCredits: user.extraSubmissionCredits,
        billing: buildBillingSnapshot(user),
        quota
      }
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/admin/users/quota"
    });
  }
}
