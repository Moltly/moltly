import { LucideIcon } from "lucide-react";
import Card from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  color?: "primary" | "success" | "warning" | "danger";
}

const colorClasses = {
  primary: "bg-[rgb(var(--primary-soft))] text-[rgb(var(--primary))]",
  success: "bg-[rgb(var(--success-soft))] text-[rgb(var(--success))]",
  warning: "bg-[rgb(var(--warning-soft))] text-[rgb(var(--warning))]",
  danger: "bg-[rgb(var(--danger-soft))] text-[rgb(var(--danger))]",
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "primary",
}: StatCardProps) {
  return (
    <Card className="p-4 hover:shadow-[var(--shadow-md)] transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-[rgb(var(--text-soft))] mb-1">{title}</p>
          <p className="text-2xl font-bold text-[rgb(var(--text))] mb-1">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-[rgb(var(--text-subtle))]">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("p-2.5 rounded-[var(--radius)] shrink-0", colorClasses[color])}>
            <Icon className="w-5 h-5" strokeWidth={2.5} />
          </div>
        )}
      </div>
    </Card>
  );
}
