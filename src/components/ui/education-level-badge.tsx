import { cn } from "@/lib/utils";
import { type GradeLevel } from "@/lib/constants";

interface EducationLevelBadgeProps {
    level: GradeLevel;
    className?: string;
}

const getLevelColor = (level: GradeLevel) => {
    if (level.startsWith('primary')) {
        return 'bg-blue-100 text-blue-800';
    } else if (level.startsWith('jhs')) {
        return 'bg-green-100 text-green-800';
    } else if (level.startsWith('shs')) {
        return 'bg-purple-100 text-purple-800';
    }
    return 'bg-gray-100 text-gray-800';
};

export function EducationLevelBadge({ level, className }: EducationLevelBadgeProps) {
    return (
        <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
            getLevelColor(level),
            className
        )}>
            {level.toUpperCase()}
        </span>
    );
} 