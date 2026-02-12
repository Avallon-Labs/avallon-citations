"use client";

import Image from "next/image";
import {
  BarChart3,
  Phone,
  Mail,
  MessageSquare,
  Users,
  FileText,
  Wrench,
  Settings,
  Building2,
} from "lucide-react";

const navGroups = [
  {
    items: [{ name: "Dashboard", icon: BarChart3 }],
  },
  {
    items: [
      { name: "Calls", icon: Phone },
      { name: "Emails", icon: Mail },
      { name: "Chats", icon: MessageSquare },
    ],
  },
  {
    items: [
      { name: "Agents", icon: Users },
      { name: "Extraction", icon: FileText, active: true },
      { name: "Tools", icon: Wrench },
    ],
  },
];

export default function Sidebar() {
  return (
    <div className="h-screen w-64 border-r border-border bg-background flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center h-14 px-4">
        <Image
          src="/assets/avallon-logo.svg"
          alt="Avallon"
          width={100}
          height={24}
          priority
          className="h-6 w-auto"
        />
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-auto px-3 py-2">
        {navGroups.map((group, gi) => (
          <div key={gi} className="px-3 py-2">
            <div className="space-y-1">
              {group.items.map((item) => (
                <button
                  key={item.name}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    item.active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-2">
        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md hover:bg-muted/50 hover:text-foreground transition-colors">
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <div className="border-t border-border/50 pt-2">
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground/70">
            <Building2 className="h-4 w-4" />
            <span>Avallon Demo</span>
          </div>
        </div>
      </div>
    </div>
  );
}
