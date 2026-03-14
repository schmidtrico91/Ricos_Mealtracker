import React from 'react';

export default function MacroDisplay({ label, current, target, color }) {
  const percentage = Math.min((current / target) * 100, 100);
  const isOverTarget = Number(current || 0) > Number(target || 0);

  const resolveBarClass = () => {
    if (!isOverTarget) {
      return 'bg-teal-500';
    }
    if (color === 'carbs') {
      return 'bg-amber-500';
    }
    if (color === 'fat') {
      return 'bg-orange-400';
    }
    return 'bg-teal-500';
  };
  
  return (
    <div className="flex flex-col items-center flex-1">
      <span className="text-xs text-gray-500 mb-1">{label}</span>
      <span className="text-sm font-semibold text-gray-800">
        {Math.round(current)} / {target}g
      </span>
      <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${resolveBarClass()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
