export function stringHashToInt(id: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash & 0x7fffffff) || Math.floor(Math.random() * 2147483647);
}

async function getLocalNotifications() {
  try {
    const mod = await import("@capacitor/local-notifications");
    return mod.LocalNotifications;
  } catch {
    return null;
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const LocalNotifications = await getLocalNotifications();
  if (!LocalNotifications) return false;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === "granted";
  } catch {
    return false;
  }
}

export type ReminderInfo = {
  id: string;
  dateISO: string;
  title: string;
  body?: string;
};

export async function scheduleReminderNotification(info: ReminderInfo): Promise<void> {
  const LocalNotifications = await getLocalNotifications();
  if (!LocalNotifications) return;
  const ok = await ensureNotificationPermission();
  if (!ok) return;

  const id = stringHashToInt(info.id);
  const [y, m, d] = info.dateISO.split("-").map((v) => Number(v));
  const when = new Date(y, (m ?? 1) - 1, d ?? 1, 9, 0, 0, 0);
  const now = new Date();
  const triggerDate = when.getTime() > now.getTime() ? when : new Date(now.getTime() + 10_000);

  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {}

  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: info.title,
        body: info.body ?? "Reminder due.",
        schedule: { at: triggerDate },
        smallIcon: undefined,
        actionTypeId: undefined,
        extra: { entryId: info.id, dateISO: info.dateISO },
      },
    ],
  });
}

export async function cancelReminderNotification(entryId: string): Promise<void> {
  const LocalNotifications = await getLocalNotifications();
  if (!LocalNotifications) return;
  const id = stringHashToInt(entryId);
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {}
}

