import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DEMOGRAPHIC_AGE_BANDS,
  DEMOGRAPHIC_GENDER_IDENTITIES,
  type UserDemographicSurveyView
} from "@/lib/demographics";
import { getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const savePayloadSchema = z.object({
  action: z.literal("save"),
  ageBand: z.enum(DEMOGRAPHIC_AGE_BANDS),
  genderIdentity: z.enum(DEMOGRAPHIC_GENDER_IDENTITIES),
  genderSelfDescribe: z.string().trim().max(120).nullable().optional()
});

const skipPayloadSchema = z.object({
  action: z.literal("skip")
});

const payloadSchema = z.discriminatedUnion("action", [savePayloadSchema, skipPayloadSchema]);

function toSurveyView(row: {
  status: string;
  ageBand: string | null;
  genderIdentity: string | null;
  genderSelfDescribe: string | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  deletedAt: Date | null;
  updatedAt: Date;
} | null): UserDemographicSurveyView {
  if (!row) {
    return {
      status: "PENDING",
      ageBand: null,
      genderIdentity: null,
      genderSelfDescribe: null,
      completedAt: null,
      skippedAt: null,
      deletedAt: null,
      updatedAt: null
    };
  }

  return {
    status: row.status === "COMPLETED" || row.status === "SKIPPED" ? row.status : "PENDING",
    ageBand: row.ageBand as UserDemographicSurveyView["ageBand"],
    genderIdentity: row.genderIdentity as UserDemographicSurveyView["genderIdentity"],
    genderSelfDescribe: row.genderSelfDescribe,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    skippedAt: row.skippedAt ? row.skippedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const survey = await prisma.userDemographicSurvey.findUnique({
      where: { userId: user.id },
      select: {
        status: true,
        ageBand: true,
        genderIdentity: true,
        genderSelfDescribe: true,
        completedAt: true,
        skippedAt: true,
        deletedAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      ok: true,
      survey: toSurveyView(survey)
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/account/demographics"
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = payloadSchema.parse(await request.json());
    const now = new Date();

    if (payload.action === "skip") {
      const survey = await prisma.userDemographicSurvey.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          status: "SKIPPED",
          skippedAt: now
        },
        update: {
          status: "SKIPPED",
          ageBand: null,
          genderIdentity: null,
          genderSelfDescribe: null,
          completedAt: null,
          skippedAt: now
        },
        select: {
          status: true,
          ageBand: true,
          genderIdentity: true,
          genderSelfDescribe: true,
          completedAt: true,
          skippedAt: true,
          deletedAt: true,
          updatedAt: true
        }
      });

      return NextResponse.json({
        ok: true,
        survey: toSurveyView(survey)
      });
    }

    if (payload.genderIdentity === "SELF_DESCRIBE" && !payload.genderSelfDescribe?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error_code: "INVALID_INPUT",
          error_message: "genderSelfDescribe is required when genderIdentity is SELF_DESCRIBE."
        },
        { status: 400 }
      );
    }

    const genderSelfDescribe = payload.genderIdentity === "SELF_DESCRIBE" ? payload.genderSelfDescribe?.trim() || null : null;
    const survey = await prisma.userDemographicSurvey.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: "COMPLETED",
        ageBand: payload.ageBand,
        genderIdentity: payload.genderIdentity,
        genderSelfDescribe,
        completedAt: now
      },
      update: {
        status: "COMPLETED",
        ageBand: payload.ageBand,
        genderIdentity: payload.genderIdentity,
        genderSelfDescribe,
        completedAt: now,
        skippedAt: null,
        deletedAt: null
      },
      select: {
        status: true,
        ageBand: true,
        genderIdentity: true,
        genderSelfDescribe: true,
        completedAt: true,
        skippedAt: true,
        deletedAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      ok: true,
      survey: toSurveyView(survey)
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/account/demographics"
    });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const survey = await prisma.userDemographicSurvey.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: "SKIPPED",
        skippedAt: now,
        deletedAt: now
      },
      update: {
        status: "SKIPPED",
        ageBand: null,
        genderIdentity: null,
        genderSelfDescribe: null,
        completedAt: null,
        skippedAt: now,
        deletedAt: now
      },
      select: {
        status: true,
        ageBand: true,
        genderIdentity: true,
        genderSelfDescribe: true,
        completedAt: true,
        skippedAt: true,
        deletedAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      ok: true,
      survey: toSurveyView(survey)
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/account/demographics"
    });
  }
}
