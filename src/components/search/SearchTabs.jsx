import React from 'react';
import { cn } from "@/lib/utils";

const tabs = [
  { id: 'search', label: 'Suchen' },
  { id: 'history', label: 'Verlauf' },
  { id: 'create', label: 'Erstellen' }
];

export default function SearchTabs({ activeTab, onTabChange }) {
  return (
    <div className="flex gap-6 px-4 pt-6 pb-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "text-lg font-medium transition-colors",
            activeTab === tab.id
              ? "text-gray-900"
              : "text-gray-400 hover:text-gray-600"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}