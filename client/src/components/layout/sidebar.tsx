import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  FolderKanban, 
  UploadCloud, 
  Globe2, 
  Cpu, 
  Settings, 
  HelpCircle,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  const navigation = [
    { name: 'Projects', href: '/', icon: FolderKanban },
    { name: 'New Conversion', href: '/upload', icon: UploadCloud },
    { name: 'Connected Sites', href: '/settings#sites', icon: Globe2 },
    { name: 'AI Models & Usage', href: '/settings#ai', icon: Cpu },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'w-64 shrink-0 border-r border-border bg-card/50 p-4 hidden lg:flex lg:flex-col justify-between min-h-[calc(100vh-4rem)]',
        className
      )}
    >
      <div className="space-y-6">
        <div>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pipeline
          </p>
          <div className="mt-2 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        {/* System Status info */}
        <div className="rounded-xl border border-border/80 bg-background/50 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              Engine Status
            </span>
            <Badge variant="success" withDot>Online</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            MCP WordPress connector active. Multi-model vision pipeline enabled.
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-border/60">
        <a
          href="https://elementor.com/help/how-to-build-and-edit-your-site-using-elementor-mcp/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <HelpCircle className="h-4 w-4" />
          <span>Elementor MCP Docs</span>
        </a>
      </div>
    </aside>
  );
}
