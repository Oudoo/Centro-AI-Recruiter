// Hardcoded Centro CDX BPO role catalog. Used by /api/admin/match-jobs to rank
// candidate fit against open roles. Replace with a live Zoho Recruit Job Openings
// pull once Recruit OAuth scopes are added to the Self Client (Phase 2.5).

export type Role = {
  id: string;
  title: string;
  account?: string;
  shift: "morning" | "afternoon" | "overnight" | "rotating";
  languageRequirements: string[];
  minEnglishLevel:
    | "Beginner"
    | "Intermediate"
    | "Upper_Intermediate"
    | "Advanced"
    | "Native";
  minOverallScore: number;
  emphasis: string[]; // dimensions weighted highest for this role
  description: string;
  monthlySeats: number;
};

export const ROLE_CATALOG: Role[] = [
  {
    id: "CS-EN-MORNING",
    title: "Customer Service Agent (English)",
    account: "Generic English Voice",
    shift: "morning",
    languageRequirements: ["English"],
    minEnglishLevel: "Intermediate",
    minOverallScore: 3.0,
    emphasis: ["fluency", "composure"],
    description:
      "Inbound calls. Resolves billing, account, and basic technical issues. High call volume.",
    monthlySeats: 25
  },
  {
    id: "CS-EN-OVERNIGHT",
    title: "Customer Service Agent (English, Overnight)",
    account: "US-facing accounts",
    shift: "overnight",
    languageRequirements: ["English"],
    minEnglishLevel: "Intermediate",
    minOverallScore: 3.0,
    emphasis: ["composure", "fluency"],
    description:
      "Same as Morning CSA but covers US business hours. Pays a shift differential.",
    monthlySeats: 18
  },
  {
    id: "CS-AR-EN-BILINGUAL",
    title: "Bilingual Customer Service Agent (Arabic + English)",
    account: "MENA accounts",
    shift: "rotating",
    languageRequirements: ["Arabic", "English"],
    minEnglishLevel: "Upper_Intermediate",
    minOverallScore: 3.2,
    emphasis: ["fluency", "eq"],
    description:
      "Handles regional accounts requiring code-switching between Arabic and English. Premium tier.",
    monthlySeats: 12
  },
  {
    id: "TECH-SUPPORT-T1",
    title: "Technical Support Agent (Tier 1)",
    account: "SaaS / Telecom",
    shift: "rotating",
    languageRequirements: ["English"],
    minEnglishLevel: "Upper_Intermediate",
    minOverallScore: 3.3,
    emphasis: ["composure", "confidence", "fluency"],
    description:
      "Troubleshoots connectivity, account, and basic software issues. Requires reading documentation in real-time.",
    monthlySeats: 15
  },
  {
    id: "SR-CSA-TL",
    title: "Senior CSA / Team Lead Track",
    account: "Multiple",
    shift: "morning",
    languageRequirements: ["English"],
    minEnglishLevel: "Advanced",
    minOverallScore: 3.8,
    emphasis: ["composure", "eq", "confidence", "fluency"],
    description:
      "Existing CSA experience preferred. Path to Team Lead within 12 months. Coaching responsibilities.",
    monthlySeats: 5
  },
  {
    id: "BACK-OFFICE-DATA",
    title: "Back Office / Data Entry Specialist",
    account: "Operations support",
    shift: "morning",
    languageRequirements: ["English"],
    minEnglishLevel: "Intermediate",
    minOverallScore: 2.8,
    emphasis: ["confidence"],
    description:
      "Non-voice role. Accuracy and speed in data tasks. Lower English bar; rejected voice candidates often fit well here.",
    monthlySeats: 10
  },
  {
    id: "SALES-OUTBOUND",
    title: "Outbound Sales Agent",
    account: "B2C Sales",
    shift: "afternoon",
    languageRequirements: ["English"],
    minEnglishLevel: "Advanced",
    minOverallScore: 3.5,
    emphasis: ["confidence", "fluency", "eq"],
    description:
      "Cold + warm outreach. Requires high confidence under rejection. Commission-heavy compensation.",
    monthlySeats: 8
  },
  {
    id: "QA-ANALYST",
    title: "Quality Analyst",
    account: "Internal QA team",
    shift: "morning",
    languageRequirements: ["English"],
    minEnglishLevel: "Advanced",
    minOverallScore: 3.7,
    emphasis: ["eq", "fluency", "composure"],
    description:
      "Reviews call recordings, coaches agents. Strong English and EQ required. Path to QA Manager.",
    monthlySeats: 3
  }
];
