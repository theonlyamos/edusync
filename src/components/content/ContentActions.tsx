'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { MoreVertical, Pencil, Eye, Download, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ContentActionsProps {
  contentId: string;
  contentType: string;
  content: any;
  onDelete: () => void;
  onEdit: () => void;
}

export function ContentActions({
  contentId,
  contentType,
  content,
  onDelete,
  onEdit,
}: ContentActionsProps) {
  const { toast } = useToast();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this content?')) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/content/${contentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete content');
      }

      toast({
        title: 'Content Deleted',
        description: 'The content has been successfully deleted.',
      });

      onDelete();
    } catch (error) {
      console.error('Error deleting content:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete content. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    // Create a JSON blob and trigger download
    const exportData = {
      type: contentType,
      content: content,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contentType}-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Content Exported',
      description: 'The content has been exported successfully.',
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <Eye className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Content</DialogTitle>
            <DialogDescription>
              Preview how this content will appear to students
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {/* Content preview will be rendered by parent component */}
            {content}
          </div>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
} 