export type ChangelogEntry = {
  version: string;
  date: string;
  highlights: string[];
};

const entries: ChangelogEntry[] = [
  {
    version: "1.7.7",
    date: "2025-11-22",
    highlights: [
      "Fix Android Discord OAuth Deep Linking.",
      "Sign Android APK Builds.",
      "Allow edits for breeding activity entries."
    ]
  },
  {
    version: "1.7.5",
    date: "2025-11-22",
    highlights: [
      "Add QR Code sharing for specimens.",
      "Add Read-only specimen sharing via QR Code.",
      "Add copy into account from shared specimen.",
      "Fix iOS/Android app schema for moltly://.",
      "Fix debouncing on notebook.",
      "Improve the more tab."

    ]
  },
  {
    version: "1.7.2",
    date: "2025-11-08",
    highlights: [
      "Add Species Quick Look and Species Profile with WSC links and one‑tap Save to Notebook.",
      "Show live WSC details on species pages."
    ]
  },
  {
    version: "1.7.1",
    date: "2025-11-08",
    highlights: [
      "Allow custom entry type names.",
      "Remove automatic timestamp from quick Notes.",
      "Add action bar to New Entry notes.",
      "Collapse more menu when clicking outside of it.",
      "Hide Health/Breeding/Analytics/Reminders/Notebook tabs by default."
    ]
  },
  {
    version: "1.6.2",
    date: "2025-11-06",
    highlights: [
      "Add Analytics Dashboard.",
      "Improve performance of data loading.",
      "Add Image Caching for Gallery and Specimen Cover Images.",
      "Add syncing with WSC (World Spider Catalog Bot) in Tarantula Addicts Discord for molt entries when signed in via Discord (discord.gg/ta)."
    ]
  },
  {
    version: "1.6.1",
    date: "2025-10-30",
    highlights: [
      "Add Dark/Theme Toggle.",
      "Set Dark Theme as default.",
      "Change C to F in molt entries."
    ]
  },
  {
    version: "1.6.0",
    date: "2025-10-30",
    highlights: [
      "Introduce dedicated Health Tracking with follow-up reminders.",
      "Add Breeding Logs for pairings, egg sacs, and sling outcomes.",
      "Include health and breeding data in export/import workflows.",
      "Add Google Authentication."
    ]
  },
  {
    version: "1.5.1",
    date: "2025-10-28",
    highlights: [
      "Add Image Gallery.",
      "Add Account Import/Export."
    ]
  },
  {
    version: "1.5.0",
    date: "2025-10-28",
    highlights: [
      "Add support for Apple Sign In.",
      "Improve error handling for OAuth providers.",
      "Improve Image Upload/Hosting via S3."
    ]
  },
  {
    version: "1.4.0",
    date: "2025-10-27",
    highlights: [
      "Redesign Notebook",
      "Add Change Password.",
      "Fix Mobile Scaling for Info Popup.",
      "Fix what's new in Info Popup.",
      "Add notifications for reminders."
    ]
  },
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
