import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { buildSubmissionQuotaSnapshot } from "@/lib/submission-quota";

const updateQuotaSchema = z.object({
  userId: z.string().min(1),
  isPaid: z.boolean(),
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
    const users = await prisma.user.findMany({
      where: query
        ? {
            OR: [
              {
                email: {
                  contains: query
                }
              },
              {
                name: {
                  contains: query
                }
              }
            ]
          }
        : undefined,
      orderBy: {
        createdAt: "desc"
      },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isPaid: true,
        submissionCount: true,
        extraSubmissionCredits: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      ok: true,
      users: users.map((user) => {
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
          isPaid: user.isPaid,
          submissionCount: user.submissionCount,
          extraSubmissionCredits: user.extraSubmissionCredits,
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

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: {
        isPaid: payload.isPaid,
        extraSubmissionCredits: payload.extraSubmissionCredits
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        isPaid: true,
        submissionCount: true,
        extraSubmissionCredits: true
      }
    });

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
        isPaid: user.isPaid,
        submissionCount: user.submissionCount,
        extraSubmissionCredits: user.extraSubmissionCredits,
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
