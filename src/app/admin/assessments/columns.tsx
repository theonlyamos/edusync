"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Assessment } from "@/types/assessment";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash } from "lucide-react";
import Link from "next/link";

const ActionCell = ({ assessment }: { assessment: Assessment }) => {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        asChild
      >
        <Link href={`/admin/assessments/${assessment._id}`}>
          <Eye className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        asChild
      >
        <Link href={`/admin/assessments/${assessment._id}/edit`}>
          <Edit className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive"
      >
        <Trash className="h-4 w-4" />
      </Button>
    </div>
  );
};

export const columns: ColumnDef<Assessment>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
  },
  {
    accessorKey: "subject",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Subject" />
    ),
  },
  {
    accessorKey: "grade",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Grade" />
    ),
  },
  {
    accessorKey: "duration",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Duration (mins)" />
    ),
  },
  {
    accessorKey: "totalMarks",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total Marks" />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionCell assessment={row.original} />,
  },
]; 