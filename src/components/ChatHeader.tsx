import { SofiaLogo } from "./SofiaLogo";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "./ui/sheet";

export function ChatHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link to="/chat" className="flex items-center gap-3">
          <SofiaLogo className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Sofia, assistente previdenciária
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Atendimento especializado em INSS (RGPS) e regimes próprios (RPPS)
            </p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/chat"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Chat
          </Link>
          <Link
            to="/sobre"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Sobre
          </Link>
          <Link
            to="/politica"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Política
          </Link>
        </nav>

        <Sheet>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[240px]">
            <nav className="flex flex-col gap-4 mt-8">
              <Link
                to="/chat"
                className="text-base font-medium text-foreground hover:text-primary transition-colors"
              >
                Chat
              </Link>
              <Link
                to="/sobre"
                className="text-base font-medium text-foreground hover:text-primary transition-colors"
              >
                Sobre
              </Link>
              <Link
                to="/politica"
                className="text-base font-medium text-foreground hover:text-primary transition-colors"
              >
                Política
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
