export const DEMOGRAPHIC_SURVEY_STATUSES = ["PENDING", "SKIPPED", "COMPLETED"] as const;
export type DemographicSurveyStatus = (typeof DEMOGRAPHIC_SURVEY_STATUSES)[number];

export const DEMOGRAPHIC_AGE_BANDS = [
  "AGE_18_24",
  "AGE_25_34",
  "AGE_35_44",
  "AGE_45_54",
  "AGE_55_64",
  "AGE_65_PLUS",
  "PREFER_NOT_TO_SAY"
] as const;
export type DemographicAgeBand = (typeof DEMOGRAPHIC_AGE_BANDS)[number];

export const DEMOGRAPHIC_GENDER_IDENTITIES = [
  "WOMAN",
  "MAN",
  "NON_BINARY",
  "SELF_DESCRIBE",
  "PREFER_NOT_TO_SAY"
] as const;
export type DemographicGenderIdentity = (typeof DEMOGRAPHIC_GENDER_IDENTITIES)[number];

export type UserDemographicSurveyView = {
  status: DemographicSurveyStatus;
  ageBand: DemographicAgeBand | null;
  genderIdentity: DemographicGenderIdentity | null;
  genderSelfDescribe: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  deletedAt: string | null;
  updatedAt: string | null;
};

export function ageBandLabel(ageBand: DemographicAgeBand): string {
  switch (ageBand) {
    case "AGE_18_24":
      return "18-24";
    case "AGE_25_34":
      return "25-34";
    case "AGE_35_44":
      return "35-44";
    case "AGE_45_54":
      return "45-54";
    case "AGE_55_64":
      return "55-64";
    case "AGE_65_PLUS":
      return "65+";
    case "PREFER_NOT_TO_SAY":
      return "Prefer not to say";
    default:
      return ageBand;
  }
}

export function genderIdentityLabel(genderIdentity: DemographicGenderIdentity): string {
  switch (genderIdentity) {
    case "WOMAN":
      return "Woman";
    case "MAN":
      return "Man";
    case "NON_BINARY":
      return "Non-binary";
    case "SELF_DESCRIBE":
      return "Self-describe";
    case "PREFER_NOT_TO_SAY":
      return "Prefer not to say";
    default:
      return genderIdentity;
  }
}
