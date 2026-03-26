import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

interface ClearAllDataModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ClearAllDataModal({
  open,
  onClose,
  onConfirm,
}: ClearAllDataModalProps) {
  const [isResetting, setIsResetting] = useState(false);

  async function handleConfirm() {
    setIsResetting(true);
    try {
      await onConfirm();
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => !o && !isResetting && onClose()}
    >
      <AlertDialogContent className="max-w-sm mx-auto">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <AlertDialogTitle className="text-base">
              Clear All Data
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm leading-relaxed">
            This will remove your account, videos, uploads, and all local data.
            <span className="block mt-2 font-semibold text-foreground">
              This cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 flex-col sm:flex-row">
          <AlertDialogCancel
            disabled={isResetting}
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isResetting}
            onClick={handleConfirm}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white focus-visible:ring-red-400"
          >
            {isResetting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Clearing...
              </>
            ) : (
              "Yes, Clear Everything"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
