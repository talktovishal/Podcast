import { randomUUID } from "node:crypto";
import { hashIncomingToken } from "@articlepod/core";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import { prisma } from "./prisma";
import { filterUnexpiredAudioEpisodes, isAudioAvailable } from "./audio-retention";

export type PrimaryAuthUserRecord = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  role: string;
  billingLanePreference?: string;
  createdAt: Date;
};

export type PrimarySandboxBillingAccountRecord = {
  userId: string;
  billingProvider: string | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  billingPriceId: string | null;
  billingPlanCode: string;
  billingStatus: string;
  billingEntitlementStatus: string;
  billingLastPaymentStatus: string;
  billingLastInvoiceId: string | null;
  billingCurrentPeriodEnd: Date | null;
  billingCancelAtPeriodEnd: boolean;
  billingLastStripeEventId: string | null;
  billingLastStripeEventCreatedAt: Date | null;
  billingLastSubscriptionEventAt: Date | null;
  billingLastInvoiceEventAt: Date | null;
  billingUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrimaryAuthSessionWithUser = {
  id: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  user: PrimaryAuthUserRecord;
};

export type PrimaryFeedTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  tokenValue: string | null;
  active: boolean;
  createdAt: Date;
  rotatedAt: Date | null;
};

export type PrimaryShareTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  tokenValue: string | null;
  scope: string;
  expiresAt: Date | null;
  createdAt: Date;
};

function requirePrimaryStore() {
  if (!webPrimaryStore) {
    throw new Error("Azure Table primary store is not configured.");
  }
  return webPrimaryStore;
}

export async function findPrimaryUserById(userId: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.user.findUnique({
      where: { id: userId }
    });
  }

  return requirePrimaryStore().findUserById(userId);
}

export async function findPrimaryUserByEmail(email: string): Promise<PrimaryAuthUserRecord | null> {
  if (!webUsesAzureTablePrimary()) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
        role: true,
        billingLanePreference: true,
        createdAt: true
      }
    });
    return user;
  }

  const user = await requirePrimaryStore().findUserByEmail(email);
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    billingLanePreference: user.billingLanePreference,
    createdAt: user.createdAt
  };
}

export async function findPrimaryUserByBillingCustomerId(customerId: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.user.findUnique({
      where: { billingCustomerId: customerId }
    });
  }

  return requirePrimaryStore().findUserByBillingCustomerId(customerId);
}

export async function listPrimaryUsers(limit = 100) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        billingLanePreference: true,
        complimentaryPro: true,
        billingProvider: true,
        billingCustomerId: true,
        billingSubscriptionId: true,
        billingPriceId: true,
        billingPlanCode: true,
        billingStatus: true,
        billingEntitlementStatus: true,
        billingLastPaymentStatus: true,
        billingLastInvoiceId: true,
        billingCurrentPeriodEnd: true,
        billingCancelAtPeriodEnd: true,
        billingLastStripeEventId: true,
        billingLastStripeEventCreatedAt: true,
        billingLastSubscriptionEventAt: true,
        billingLastInvoiceEventAt: true,
        billingUpdatedAt: true,
        isPaid: true,
        submissionCount: true,
        extraSubmissionCredits: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  return requirePrimaryStore().listUsers(limit);
}

export async function createPrimaryUser(input: {
  email: string;
  passwordHash?: string | null;
  name?: string | null;
  role: string;
}) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash ?? null,
        name: input.name ?? null,
        role: input.role
      }
    });
  }

  return requirePrimaryStore().createUser({
    id: randomUUID(),
    email: input.email,
    passwordHash: input.passwordHash ?? null,
    name: input.name ?? null,
    role: input.role
  });
}

export async function updatePrimaryUser(
  userId: string,
    input: Partial<{
      email: string;
      passwordHash: string | null;
      name: string | null;
      role: string;
      billingLanePreference: string;
      complimentaryPro: boolean;
    billingProvider: string | null;
    billingCustomerId: string | null;
    billingSubscriptionId: string | null;
    billingPriceId: string | null;
    billingPlanCode: string;
    billingStatus: string;
    billingEntitlementStatus: string;
    billingLastPaymentStatus: string;
    billingLastInvoiceId: string | null;
    billingCurrentPeriodEnd: Date | null;
    billingCancelAtPeriodEnd: boolean;
    billingLastStripeEventId: string | null;
    billingLastStripeEventCreatedAt: Date | null;
    billingLastSubscriptionEventAt: Date | null;
    billingLastInvoiceEventAt: Date | null;
    billingUpdatedAt: Date | null;
    firstSeenAt: Date | null;
    firstSeenCountryCode: string | null;
    firstSeenRegionCode: string | null;
    firstSeenCity: string | null;
    lastSeenAt: Date | null;
    lastSeenCountryCode: string | null;
    lastSeenRegionCode: string | null;
    lastSeenCity: string | null;
    ttsProvider: string;
    ttsVoice: string;
    isPaid: boolean;
    submissionCount: number;
    extraSubmissionCredits: number;
  }>
) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.user.update({
      where: { id: userId },
      data: input
    });
  }

  return requirePrimaryStore().updateUser(userId, input);
}

export async function findPrimaryBillingWebhookEvent(provider: string, providerEventId: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.billingWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider,
          providerEventId
        }
      }
    });
  }

  return requirePrimaryStore().findBillingWebhookEvent(provider, providerEventId);
}

export async function findPrimarySandboxBillingAccountByUserId(userId: string): Promise<PrimarySandboxBillingAccountRecord | null> {
  if (!webUsesAzureTablePrimary()) {
    return prisma.sandboxBillingAccount.findUnique({
      where: { userId }
    });
  }

  return requirePrimaryStore().findSandboxBillingAccountByUserId(userId);
}

export async function findPrimarySandboxBillingAccountByBillingCustomerId(
  customerId: string
): Promise<PrimarySandboxBillingAccountRecord | null> {
  if (!webUsesAzureTablePrimary()) {
    return prisma.sandboxBillingAccount.findUnique({
      where: { billingCustomerId: customerId }
    });
  }

  return requirePrimaryStore().findSandboxBillingAccountByBillingCustomerId(customerId);
}

export async function upsertPrimarySandboxBillingAccount(
  input: {
    userId: string;
    billingProvider?: string | null;
    billingCustomerId?: string | null;
    billingSubscriptionId?: string | null;
    billingPriceId?: string | null;
    billingPlanCode?: string;
    billingStatus?: string;
    billingEntitlementStatus?: string;
    billingLastPaymentStatus?: string;
    billingLastInvoiceId?: string | null;
    billingCurrentPeriodEnd?: Date | null;
    billingCancelAtPeriodEnd?: boolean;
    billingLastStripeEventId?: string | null;
    billingLastStripeEventCreatedAt?: Date | null;
    billingLastSubscriptionEventAt?: Date | null;
    billingLastInvoiceEventAt?: Date | null;
    billingUpdatedAt?: Date | null;
    createdAt?: Date;
  }
) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.sandboxBillingAccount.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        billingProvider: input.billingProvider ?? null,
        billingCustomerId: input.billingCustomerId ?? null,
        billingSubscriptionId: input.billingSubscriptionId ?? null,
        billingPriceId: input.billingPriceId ?? null,
        billingPlanCode: input.billingPlanCode ?? "STARTER",
        billingStatus: input.billingStatus ?? "NONE",
        billingEntitlementStatus: input.billingEntitlementStatus ?? "INACTIVE",
        billingLastPaymentStatus: input.billingLastPaymentStatus ?? "NONE",
        billingLastInvoiceId: input.billingLastInvoiceId ?? null,
        billingCurrentPeriodEnd: input.billingCurrentPeriodEnd ?? null,
        billingCancelAtPeriodEnd: input.billingCancelAtPeriodEnd ?? false,
        billingLastStripeEventId: input.billingLastStripeEventId ?? null,
        billingLastStripeEventCreatedAt: input.billingLastStripeEventCreatedAt ?? null,
        billingLastSubscriptionEventAt: input.billingLastSubscriptionEventAt ?? null,
        billingLastInvoiceEventAt: input.billingLastInvoiceEventAt ?? null,
        billingUpdatedAt: input.billingUpdatedAt ?? null,
        ...(input.createdAt ? { createdAt: input.createdAt } : {})
      },
      update: {
        ...(input.billingProvider !== undefined ? { billingProvider: input.billingProvider } : {}),
        ...(input.billingCustomerId !== undefined ? { billingCustomerId: input.billingCustomerId } : {}),
        ...(input.billingSubscriptionId !== undefined ? { billingSubscriptionId: input.billingSubscriptionId } : {}),
        ...(input.billingPriceId !== undefined ? { billingPriceId: input.billingPriceId } : {}),
        ...(input.billingPlanCode !== undefined ? { billingPlanCode: input.billingPlanCode } : {}),
        ...(input.billingStatus !== undefined ? { billingStatus: input.billingStatus } : {}),
        ...(input.billingEntitlementStatus !== undefined ? { billingEntitlementStatus: input.billingEntitlementStatus } : {}),
        ...(input.billingLastPaymentStatus !== undefined ? { billingLastPaymentStatus: input.billingLastPaymentStatus } : {}),
        ...(input.billingLastInvoiceId !== undefined ? { billingLastInvoiceId: input.billingLastInvoiceId } : {}),
        ...(input.billingCurrentPeriodEnd !== undefined ? { billingCurrentPeriodEnd: input.billingCurrentPeriodEnd } : {}),
        ...(input.billingCancelAtPeriodEnd !== undefined ? { billingCancelAtPeriodEnd: input.billingCancelAtPeriodEnd } : {}),
        ...(input.billingLastStripeEventId !== undefined ? { billingLastStripeEventId: input.billingLastStripeEventId } : {}),
        ...(input.billingLastStripeEventCreatedAt !== undefined
          ? { billingLastStripeEventCreatedAt: input.billingLastStripeEventCreatedAt }
          : {}),
        ...(input.billingLastSubscriptionEventAt !== undefined
          ? { billingLastSubscriptionEventAt: input.billingLastSubscriptionEventAt }
          : {}),
        ...(input.billingLastInvoiceEventAt !== undefined ? { billingLastInvoiceEventAt: input.billingLastInvoiceEventAt } : {}),
        ...(input.billingUpdatedAt !== undefined ? { billingUpdatedAt: input.billingUpdatedAt } : {})
      }
    });
  }

  return requirePrimaryStore().upsertSandboxBillingAccount(input);
}

export async function createPrimaryBillingWebhookEvent(input: {
  provider: string;
  providerEventId: string;
  eventType: string;
  eventCreatedAt?: Date | null;
  objectId?: string | null;
  userId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  invoiceId?: string | null;
  status?: string;
  errorMessage?: string | null;
  processedAt?: Date | null;
}) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.billingWebhookEvent.create({
      data: {
        provider: input.provider,
        providerEventId: input.providerEventId,
        eventType: input.eventType,
        eventCreatedAt: input.eventCreatedAt ?? null,
        objectId: input.objectId ?? null,
        userId: input.userId ?? null,
        customerId: input.customerId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        invoiceId: input.invoiceId ?? null,
        status: input.status ?? "PROCESSED",
        errorMessage: input.errorMessage ?? null,
        processedAt: input.processedAt ?? new Date()
      }
    });
  }

  return requirePrimaryStore().createBillingWebhookEvent({
    id: randomUUID(),
    provider: input.provider,
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    eventCreatedAt: input.eventCreatedAt ?? null,
    objectId: input.objectId ?? null,
    userId: input.userId ?? null,
    customerId: input.customerId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    invoiceId: input.invoiceId ?? null,
    status: input.status ?? "PROCESSED",
    errorMessage: input.errorMessage ?? null,
    processedAt: input.processedAt ?? new Date()
  });
}

export async function createPrimarySession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.session.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt
      }
    });
  }

  return requirePrimaryStore().createSession({
    id: randomUUID(),
    userId: input.userId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt
  });
}

export async function findPrimarySessionWithUserByTokenHash(tokenHash: string): Promise<PrimaryAuthSessionWithUser | null> {
  if (!webUsesAzureTablePrimary()) {
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            passwordHash: true,
            name: true,
            role: true,
            createdAt: true
          }
        }
      }
    });
    return session;
  }

  const store = requirePrimaryStore();
  const session = await store.findSessionByTokenHash(tokenHash);
  if (!session) {
    return null;
  }
  const user = await store.findUserById(session.userId);
  if (!user) {
    return null;
  }
  return {
    id: session.id,
    tokenHash: session.tokenHash,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    user: {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    }
  };
}

export async function deletePrimarySessionByTokenHash(tokenHash: string): Promise<void> {
  if (!webUsesAzureTablePrimary()) {
    const session = await prisma.session.findUnique({ where: { tokenHash }, select: { id: true } });
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return;
  }

  await requirePrimaryStore().deleteSessionByTokenHash(tokenHash);
}

export async function findPrimaryActiveFeedTokenByUserId(userId: string, kind: "item" | "digest") {
  if (!webUsesAzureTablePrimary()) {
    return kind === "item"
      ? prisma.feedToken.findFirst({
          where: { userId, active: true },
          orderBy: { createdAt: "desc" }
        })
      : prisma.digestFeedToken.findFirst({
          where: { userId, active: true },
          orderBy: { createdAt: "desc" }
        });
  }

  return requirePrimaryStore().findActiveFeedTokenByUserId(userId, kind);
}

export async function findPrimaryActiveFeedTokenByValue(
  tokenValue: string,
  kind: "item" | "digest"
): Promise<PrimaryFeedTokenRecord | null> {
  if (!webUsesAzureTablePrimary()) {
    return kind === "item"
      ? prisma.feedToken.findFirst({
          where: { tokenValue, active: true }
        })
      : prisma.digestFeedToken.findFirst({
          where: { tokenValue, active: true }
        });
  }

  return requirePrimaryStore().findFeedTokenByValue(tokenValue, kind);
}

export async function deactivatePrimaryFeedTokens(userId: string, kind: "item" | "digest", rotatedAt: Date) {
  if (!webUsesAzureTablePrimary()) {
    return kind === "item"
      ? prisma.feedToken.updateMany({
          where: { userId, active: true },
          data: { active: false, rotatedAt }
        })
      : prisma.digestFeedToken.updateMany({
          where: { userId, active: true },
          data: { active: false, rotatedAt }
        });
  }

  const count = await requirePrimaryStore().deactivateFeedTokens(userId, kind, rotatedAt);
  return { count };
}

export async function createPrimaryFeedToken(input: {
  userId: string;
  tokenHash: string;
  tokenValue?: string | null;
  kind: "item" | "digest";
}) {
  if (!webUsesAzureTablePrimary()) {
    return input.kind === "item"
      ? prisma.feedToken.create({
          data: {
            userId: input.userId,
            tokenHash: input.tokenHash,
            tokenValue: input.tokenValue ?? null,
            active: true
          }
        })
      : prisma.digestFeedToken.create({
          data: {
            userId: input.userId,
            tokenHash: input.tokenHash,
            tokenValue: input.tokenValue ?? null,
            active: true
          }
        });
  }

  return requirePrimaryStore().createFeedToken({
    id: randomUUID(),
    userId: input.userId,
    tokenHash: input.tokenHash,
    tokenValue: input.tokenValue ?? null,
    kind: input.kind
  });
}

export async function findPrimaryUserByFeedTokenHash(tokenHash: string, kind: "item" | "digest"): Promise<PrimaryAuthUserRecord | null> {
  if (!webUsesAzureTablePrimary()) {
    const token =
      kind === "item"
        ? await prisma.feedToken.findFirst({
            where: { tokenHash, active: true },
            include: { user: true }
          })
        : await prisma.digestFeedToken.findFirst({
            where: { tokenHash, active: true },
            include: { user: true }
          });
    if (!token) {
      return null;
    }
    return {
      id: token.user.id,
      email: token.user.email,
      passwordHash: token.user.passwordHash,
      name: token.user.name,
      role: token.user.role,
      createdAt: token.user.createdAt
    };
  }

  const store = requirePrimaryStore();
  const token = await store.findFeedTokenByHash(tokenHash, kind);
  if (!token) {
    return null;
  }
  const user = await store.findUserById(token.userId);
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt
  };
}

export async function repairPrimaryFeedTokenHashFromValue(
  tokenValue: string,
  kind: "item" | "digest"
): Promise<(PrimaryAuthUserRecord & { repairedTokenHash: string }) | null> {
  const token = await findPrimaryActiveFeedTokenByValue(tokenValue, kind);
  if (!token) {
    return null;
  }

  const repairedTokenHash = hashIncomingToken(tokenValue);
  if (token.tokenHash !== repairedTokenHash || token.tokenValue !== tokenValue) {
    if (!webUsesAzureTablePrimary()) {
      if (kind === "item") {
        await prisma.feedToken.update({
          where: { id: token.id },
          data: {
            tokenHash: repairedTokenHash,
            tokenValue
          }
        });
      } else {
        await prisma.digestFeedToken.update({
          where: { id: token.id },
          data: {
            tokenHash: repairedTokenHash,
            tokenValue
          }
        });
      }
    } else {
      const tableKey = kind === "item" ? "feedTokens" : "digestFeedTokens";
      const partitionKey = kind === "item" ? "feed" : "digestFeed";
      await requirePrimaryStore().upsertRawEntity(tableKey, {
        partitionKey,
        rowKey: token.id,
        id: token.id,
        userId: token.userId,
        tokenHash: repairedTokenHash,
        tokenValue,
        active: token.active,
        createdAt: token.createdAt.toISOString(),
        rotatedAt: token.rotatedAt?.toISOString() ?? null
      });
    }
  }

  const user = await findPrimaryUserById(token.userId);
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    repairedTokenHash
  };
}

export async function createPrimaryShareToken(input: {
  userId: string;
  tokenHash: string;
  tokenValue?: string | null;
  scope?: string;
  expiresAt?: Date;
}) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.shareToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        tokenValue: input.tokenValue ?? null,
        scope: input.scope ?? "read_only",
        expiresAt: input.expiresAt
      }
    });
  }

  return requirePrimaryStore().createShareToken({
    id: randomUUID(),
    userId: input.userId,
    tokenHash: input.tokenHash,
    tokenValue: input.tokenValue ?? null,
    scope: input.scope ?? "read_only",
    expiresAt: input.expiresAt
  });
}

export async function findPrimaryShareTokenById(id: string): Promise<PrimaryShareTokenRecord | null> {
  if (!webUsesAzureTablePrimary()) {
    return prisma.shareToken.findUnique({
      where: { id }
    });
  }

  return requirePrimaryStore().findShareTokenById(id);
}

export async function findPrimaryShareTokenByUserIdAndScope(
  userId: string,
  scope: string
): Promise<PrimaryShareTokenRecord | null> {
  if (!webUsesAzureTablePrimary()) {
    return prisma.shareToken.findFirst({
      where: { userId, scope },
      orderBy: { createdAt: "asc" }
    });
  }

  return requirePrimaryStore().findShareTokenByUserIdAndScope(userId, scope);
}

export async function listPrimaryShareTokensByUserIdAndScopePrefix(
  userId: string,
  scopePrefix: string
): Promise<PrimaryShareTokenRecord[]> {
  if (!webUsesAzureTablePrimary()) {
    return prisma.shareToken.findMany({
      where: {
        userId,
        scope: {
          startsWith: scopePrefix
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  return requirePrimaryStore().listShareTokensByUserIdAndScopePrefix(userId, scopePrefix);
}

export async function deletePrimaryShareTokensByUserIdAndScope(userId: string, scope: string): Promise<number> {
  if (!webUsesAzureTablePrimary()) {
    const result = await prisma.shareToken.deleteMany({
      where: { userId, scope }
    });
    return result.count;
  }

  return requirePrimaryStore().deleteShareTokensByUserIdAndScope(userId, scope);
}

export async function findPrimaryUserByShareTokenHash(tokenHash: string): Promise<PrimaryAuthUserRecord | null> {
  if (!webUsesAzureTablePrimary()) {
    const share = await prisma.shareToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (!share) {
      return null;
    }
    return {
      id: share.user.id,
      email: share.user.email,
      passwordHash: share.user.passwordHash,
      name: share.user.name,
      role: share.user.role,
      createdAt: share.user.createdAt
    };
  }

  const store = requirePrimaryStore();
  const share = await store.findShareTokenByHash(tokenHash);
  if (!share) {
    return null;
  }
  const user = await store.findUserById(share.userId);
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt
  };
}

export async function findPrimaryShareTokenWithUserByHash(tokenHash: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.shareToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
  }

  const store = requirePrimaryStore();
  const share = await store.findShareTokenByHash(tokenHash);
  if (!share) {
    return null;
  }
  const user = await store.findUserById(share.userId);
  if (!user) {
    return null;
  }
  return {
    ...share,
    user
  };
}

export async function findPrimaryOAuthIdentityWithUser(provider: string, providerUserId: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.oAuthIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId
        }
      },
      include: {
        user: true
      }
    });
  }

  const store = requirePrimaryStore();
  const identity = await store.findOAuthIdentity(provider, providerUserId);
  if (!identity) {
    return null;
  }
  const user = await store.findUserById(identity.userId);
  if (!user) {
    return null;
  }
  return {
    id: identity.id,
    userId: identity.userId,
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    emailAtLink: identity.emailAtLink,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
    user
  };
}

export async function listPrimaryOAuthIdentitiesByUser(userId: string): Promise<Array<{ provider: string }>> {
  if (!webUsesAzureTablePrimary()) {
    return prisma.oAuthIdentity.findMany({
      where: { userId },
      select: {
        provider: true
      }
    });
  }

  const identities = await requirePrimaryStore().listOAuthIdentitiesByUser(userId);
  return identities.map((identity) => ({
    provider: identity.provider
  }));
}

export async function createPrimaryOAuthIdentity(input: {
  userId: string;
  provider: string;
  providerUserId: string;
  emailAtLink?: string | null;
}) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.oAuthIdentity.create({
      data: {
        userId: input.userId,
        provider: input.provider,
        providerUserId: input.providerUserId,
        emailAtLink: input.emailAtLink ?? null
      }
    });
  }

  return requirePrimaryStore().createOAuthIdentity({
    id: randomUUID(),
    userId: input.userId,
    provider: input.provider,
    providerUserId: input.providerUserId,
    emailAtLink: input.emailAtLink ?? null
  });
}

export async function createPrimaryExtensionConnectCode(input: {
  userId: string;
  codeHash: string;
  label?: string | null;
  expiresAt: Date;
}) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.extensionConnectCode.create({
      data: {
        userId: input.userId,
        codeHash: input.codeHash,
        label: input.label ?? null,
        expiresAt: input.expiresAt
      }
    });
  }

  return requirePrimaryStore().createExtensionConnectCode({
    id: randomUUID(),
    userId: input.userId,
    codeHash: input.codeHash,
    label: input.label ?? null,
    expiresAt: input.expiresAt
  });
}

export async function findPrimaryExtensionConnectCodeWithUserByHash(codeHash: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.extensionConnectCode.findUnique({
      where: { codeHash },
      include: { user: true }
    });
  }

  const store = requirePrimaryStore();
  const connectCode = await store.findExtensionConnectCodeByHash(codeHash);
  if (!connectCode) {
    return null;
  }
  const user = await store.findUserById(connectCode.userId);
  if (!user) {
    return null;
  }
  return {
    ...connectCode,
    user
  };
}

export async function consumePrimaryExtensionConnectCode(codeHash: string, consumedAt: Date) {
  if (!webUsesAzureTablePrimary()) {
    const connectCode = await prisma.extensionConnectCode.findUnique({
      where: { codeHash },
      select: { id: true }
    });
    if (!connectCode) {
      return false;
    }
    await prisma.extensionConnectCode.update({
      where: { id: connectCode.id },
      data: { consumedAt }
    });
    return true;
  }

  return requirePrimaryStore().markExtensionConnectCodeConsumed(codeHash, consumedAt);
}

export async function createPrimaryExtensionToken(input: {
  userId: string;
  tokenHash: string;
  tokenValue?: string | null;
  label?: string | null;
  scope?: string;
  expiresAt?: Date | null;
}) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.extensionToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        tokenValue: input.tokenValue ?? null,
        label: input.label ?? null,
        scope: input.scope ?? "ingest:html_snapshot",
        expiresAt: input.expiresAt
      }
    });
  }

  return requirePrimaryStore().createExtensionToken({
    id: randomUUID(),
    userId: input.userId,
    tokenHash: input.tokenHash,
    tokenValue: input.tokenValue ?? null,
    label: input.label ?? null,
    scope: input.scope ?? "ingest:html_snapshot",
    expiresAt: input.expiresAt
  });
}

export async function findPrimaryExtensionTokenWithUserByHash(tokenHash: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.extensionToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
  }

  const store = requirePrimaryStore();
  const token = await store.findExtensionTokenByHash(tokenHash);
  if (!token) {
    return null;
  }
  const user = await store.findUserById(token.userId);
  if (!user) {
    return null;
  }
  return {
    ...token,
    user
  };
}

export async function touchPrimaryExtensionTokenLastUsed(tokenHash: string, lastUsedAt: Date) {
  if (!webUsesAzureTablePrimary()) {
    const token = await prisma.extensionToken.findUnique({ where: { tokenHash }, select: { id: true } });
    if (!token) {
      return;
    }
    await prisma.extensionToken.update({
      where: { id: token.id },
      data: { lastUsedAt }
    });
    return;
  }

  await requirePrimaryStore().touchExtensionTokenLastUsed(tokenHash, lastUsedAt);
}

export async function revokePrimaryExtensionTokensForUser(userId: string, revokedAt: Date) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.extensionToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt }
    });
  }

  const count = await requirePrimaryStore().revokeExtensionTokensForUser(userId, revokedAt);
  return { count };
}

export async function findPrimaryDigestSettingsByUserId(userId: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.userDigestSettings.findUnique({
      where: { userId }
    });
  }

  return requirePrimaryStore().findDigestSettingsByUserId(userId);
}

export async function upsertPrimaryDigestSettings(input: {
  userId: string;
  timezone: string;
  dailyEmailEnabled: boolean;
  dailyPodcastEnabled: boolean;
  dailyHour: number;
  dailyMinute: number;
  dailyLengthMinutes: number;
  dailyNextRunAt?: Date | null;
  weeklyEmailEnabled: boolean;
  weeklyPodcastEnabled: boolean;
  weeklyDayOfWeek: number;
  weeklyHour: number;
  weeklyMinute: number;
  weeklyLengthMinutes: number;
  weeklyNextRunAt?: Date | null;
}) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.userDigestSettings.upsert({
      where: { userId: input.userId },
      update: input,
      create: input
    });
  }

  return requirePrimaryStore().upsertDigestSettings({
    id: randomUUID(),
    userId: input.userId,
    timezone: input.timezone,
    dailyEmailEnabled: input.dailyEmailEnabled,
    dailyPodcastEnabled: input.dailyPodcastEnabled,
    dailyHour: input.dailyHour,
    dailyMinute: input.dailyMinute,
    dailyLengthMinutes: input.dailyLengthMinutes,
    dailyNextRunAt: input.dailyNextRunAt ?? null,
    weeklyEmailEnabled: input.weeklyEmailEnabled,
    weeklyPodcastEnabled: input.weeklyPodcastEnabled,
    weeklyDayOfWeek: input.weeklyDayOfWeek,
    weeklyHour: input.weeklyHour,
    weeklyMinute: input.weeklyMinute,
    weeklyLengthMinutes: input.weeklyLengthMinutes,
    weeklyNextRunAt: input.weeklyNextRunAt ?? null
  });
}

export async function listPrimaryDigestRunsByUser(userId: string, limit = 20) {
  if (!webUsesAzureTablePrimary()) {
    const runs = await prisma.digestRun.findMany({
      where: { userId },
      orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        episode: {
          select: {
            id: true,
            audioPath: true,
            audioBytes: true,
            mimeType: true,
            publishedAt: true,
            expiresAt: true
          }
        }
      }
    });
    return runs.map((run) => ({
      ...run,
      episode: run.episode && isAudioAvailable(run.episode.expiresAt) ? run.episode : null
    }));
  }

  const store = requirePrimaryStore();
  const [runs, digestEpisodes] = await Promise.all([store.listDigestRunsByUser(userId, limit), store.listDigestEpisodesForUser(userId)]);
  const episodesByRunId = new Map(filterUnexpiredAudioEpisodes(digestEpisodes).map((episode) => [episode.digestRunId, episode]));
  return runs.map((run) => ({
    ...run,
    episode: episodesByRunId.get(run.id)
      ? {
          id: episodesByRunId.get(run.id)?.id,
          audioPath: episodesByRunId.get(run.id)?.audioPath,
          audioBytes: episodesByRunId.get(run.id)?.audioBytes,
          mimeType: episodesByRunId.get(run.id)?.mimeType,
          publishedAt: episodesByRunId.get(run.id)?.publishedAt
        }
      : null
  }));
}

export async function findPrimaryUserDemographicSurvey(userId: string) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.userDemographicSurvey.findUnique({
      where: { userId }
    });
  }

  return requirePrimaryStore().findUserDemographicSurvey(userId);
}

export async function upsertPrimaryUserDemographicSurvey(input: {
  userId: string;
  status: string;
  ageBand?: string | null;
  genderIdentity?: string | null;
  genderSelfDescribe?: string | null;
  completedAt?: Date | null;
  skippedAt?: Date | null;
  deletedAt?: Date | null;
}) {
  if (!webUsesAzureTablePrimary()) {
    return prisma.userDemographicSurvey.upsert({
      where: { userId: input.userId },
      update: input,
      create: input
    });
  }

  return requirePrimaryStore().upsertUserDemographicSurvey({
    id: randomUUID(),
    userId: input.userId,
    status: input.status,
    ageBand: input.ageBand ?? null,
    genderIdentity: input.genderIdentity ?? null,
    genderSelfDescribe: input.genderSelfDescribe ?? null,
    completedAt: input.completedAt ?? null,
    skippedAt: input.skippedAt ?? null,
    deletedAt: input.deletedAt ?? null
  });
}
