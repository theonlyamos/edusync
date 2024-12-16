"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Option = {
    label: string;
    value: string;
};

interface MultiSelectProps {
    options: Option[];
    selected: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    className?: string;
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Select options...",
    className,
}: MultiSelectProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const handleClickOutside = React.useCallback((event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
            setIsOpen(false);
        }
    }, []);

    React.useEffect(() => {
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [handleClickOutside]);

    const toggleOption = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((item) => item !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const removeOption = (valueToRemove: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(selected.filter((value) => value !== valueToRemove));
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <div
                className="flex min-h-[40px] w-full flex-wrap gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selected.length > 0 ? (
                    selected.map((value) => {
                        const option = options.find((opt) => opt.value === value);
                        return (
                            <Badge
                                key={value}
                                variant="secondary"
                                className="flex items-center gap-1"
                            >
                                {option?.label}
                                <button
                                    onClick={(e) => removeOption(value, e)}
                                    className="ml-1 rounded-full outline-none ring-offset-background hover:bg-secondary"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        );
                    })
                ) : (
                    <span className="text-muted-foreground">{placeholder}</span>
                )}
            </div>
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
                    <div className="overflow-y-auto max-h-[200px]">
                        {options
                            .filter((option) => !selected.includes(option.value))
                            .map((option) => (
                                <div
                                    key={option.value}
                                    onClick={() => toggleOption(option.value)}
                                    className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                >
                                    {option.label}
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
} 