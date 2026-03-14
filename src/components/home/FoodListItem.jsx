import React, { useState } from 'react';
import { Pencil, Trash2, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from '../utils/translations';

export default function FoodListItem({ food, onEdit, onDelete, isSelected, onToggleSelect, language = 'en' }) {
  const { t } = useTranslation(language);
  const [lastTap, setLastTap] = useState(0);
  
  const handleDoubleTap = (e) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (lastTap && now - lastTap < DOUBLE_TAP_DELAY) {
      e.preventDefault();
      onToggleSelect(food);
      setLastTap(0);
    } else {
      setLastTap(now);
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      onTouchEnd={handleDoubleTap}
      className={`flex items-center justify-between py-3 px-4 rounded-xl border shadow-sm transition-all select-none ${
        isSelected 
          ? 'bg-teal-50 border-teal-500' 
          : 'bg-white border-gray-100'
      }`}
      style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {isSelected && (
        <div className="flex-shrink-0 mr-3">
          <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-gray-800 truncate">{food.food_name}</h4>
        <p className="text-xs text-gray-500 mt-0.5">
          {Math.round(food.protein)}g P / {Math.round(food.carbs)}g C / {Math.round(food.fat)}g F
        </p>
      </div>
      
      <div className="flex items-center gap-3 ml-4">
        <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
          {Math.round(food.calories)} {t('kcal')}
        </span>
        
        {!isSelected && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(food);
              }}
              className="p-2 text-gray-400 hover:text-teal-600 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(food);
              }}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
