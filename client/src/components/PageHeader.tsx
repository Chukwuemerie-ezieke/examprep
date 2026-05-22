import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

interface PageHeaderProps {
  title: string;
  /** Optional right-side action (e.g. a button). */
  action?: React.ReactNode;
  /** Container width — matches the page's content width. */
  maxWidth?: "max-w-3xl" | "max-w-5xl" | "max-w-6xl";
}

/**
 * Shared inner-page header: brand logo, "Home" back button, page title.
 * Used on /practice, /cbt, /study-tips, /history for visual consistency.
 */
export function PageHeader({ title, action, maxWidth = "max-w-5xl" }: PageHeaderProps) {
  return (
    <div className="border-b border-border bg-card/50">
      <div className={`${maxWidth} mx-auto px-4 py-3`}>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer hover-elevate active-elevate rounded-md px-2 py-1 -ml-2" data-testid="brand-home">
              <Logo size={28} />
              <span className="hidden sm:inline text-xs font-semibold text-foreground">ExamPrep</span>
            </div>
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-sm sm:text-base font-semibold text-foreground truncate flex-1" data-testid="page-title">
            {title}
          </h1>
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1 hidden sm:inline-flex" data-testid="button-back-home">
              <ArrowLeft className="w-3 h-3" /> Home
            </Button>
          </Link>
          {action}
        </div>
      </div>
    </div>
  );
}
