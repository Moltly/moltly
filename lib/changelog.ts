export type ChangelogEntry = {
  version: string;
  date: string;
  highlights: string[];
};

const entries: ChangelogEntry[] = [
  {
    version: "1.3.0",
    date: "2025-10-25",
    highlights: [
      "Make specimen name optional.",
      "Replaced Footer with Info/Help Popup.",
      "Bug Fixes and performance improvements.",
      "Add ability to log water changes."
    ]
  },
  {
    version: "1.2.3",
    date: "2025-10-24",
    highlights: [
      "Fix iOS layout issue when creating or editing an entry.",
      "Fix date inconsistency."
    ]
  },
  {
    version: "1.2.2",
    date: "2025-10-24",
    highlights: [
      "Release Candidate for final UI Design.",
    ]
  },
  {
    version: "1.2.1",
    date: "2025-10-24",
    highlights: [
      "Ability to delete account.",
      "Add ToS/Privacy Policy."
    ]
  },
  {
    version: "1.2.0",
    date: "2025-10-23",
    highlights: [
      "Rewritten with new UI.",
      "Support for No Account/Save locally.",
      "New Logo."
    ]
  },
  {
    version: "1.1.0",
    date: "2025-10-22",
    highlights: [
      "Add Research Notebook.",
    ]
  },
  {
    version: "1.0.3",
    date: "2025-10-22",
    highlights: [
      "Add ability to log feeding entries.",
      "Improve performance of data loading."
    ]
  },
  {
    version: "1.0.2",
    date: "2025-10-18",
    highlights: [
      "Add Specimen Dashboard",
      "Improve Authentication Security",
      "Add Logo"
    ]
  },
  {
    version: "1.0.1",
    date: "2025-10-18",
    highlights: [
      "Fixed bugs and improved the UI.",
      "Fixed an issue where larger phones such as the iPhone Pro Max would use the desktop layout instead of the mobile layout."
    ]
  },
  {
    version: "1.0.0",
    date: "2025-10-17",
    highlights: [
      "Initial public testing release."
    ]
  }
];

function compareVersions(a: string, b: string) {
  const aParts = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const aValue = aParts[index] ?? 0;
    const bValue = bParts[index] ?? 0;
    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
  }

  return 0;
}

const CHANGELOG = [...entries].sort((a, b) => compareVersions(b.version, a.version));

export function getUpdatesSince(lastSeenVersion?: string | null) {
  if (!lastSeenVersion) {
    return CHANGELOG;
  }

  return CHANGELOG.filter((entry) => compareVersions(entry.version, lastSeenVersion) === 1);
}
