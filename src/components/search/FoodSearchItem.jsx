import React from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

export default function FoodSearchItem({ food, onSelect, showNutrition = true }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(food)}
      className="w-full flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-teal-200 transition-all"
    >
      <div className="min-w-0 pr-3 text-left">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h4 className="font-medium text-gray-800">{food.name}</h4>
          {food.brand ? (
            <Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-700">
              {food.brand}
            </Badge>
          ) : null}
          {food.source ? (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              {food.source}
            </Badge>
          ) : null}
        </div>
        {showNutrition ? (
          <>
            <p className="text-sm text-gray-500 mt-0.5">
              {Math.round(food.calories_per_100g || 0)} kcal / 100 g
            </p>
            {(food.protein_per_100g || food.carbs_per_100g || food.fat_per_100g) ? (
              <p className="mt-1 text-xs text-gray-400">
                P {Math.round((food.protein_per_100g || 0) * 10) / 10} g | C {Math.round((food.carbs_per_100g || 0) * 10) / 10} g | F {Math.round((food.fat_per_100g || 0) * 10) / 10} g
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
        <Plus className="w-5 h-5 text-teal-600" />
      </div>
    </motion.button>
  );
}
