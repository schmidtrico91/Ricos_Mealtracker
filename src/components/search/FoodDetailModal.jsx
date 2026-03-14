import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from '../utils/translations';

export default function FoodDetailModal({ food, isOpen, onClose, onLog, language = 'en', initialWeight = 100 }) {
  const [weight, setWeight] = useState(initialWeight);
  const { t } = useTranslation(language);
  
  useEffect(() => {
    if (isOpen && food) {
      setWeight(initialWeight);
    }
  }, [isOpen, food, initialWeight]);
  
  if (!food) return null;
  
  const multiplier = (weight || 0) / 100;
  const calculatedCalories = Math.round((food.calories_per_100g || 0) * multiplier);
  const calculatedProtein = Math.round((food.protein_per_100g || 0) * multiplier);
  const calculatedCarbs = Math.round((food.carbs_per_100g || 0) * multiplier);
  const calculatedFat = Math.round((food.fat_per_100g || 0) * multiplier);
  
  const handleLog = () => {
    onLog({
      food,
      weight: weight || 0,
      calories: calculatedCalories,
      protein: calculatedProtein,
      carbs: calculatedCarbs,
      fat: calculatedFat
    });
  };
  
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center pb-40"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-md rounded-3xl sm:rounded-2xl p-6 mx-4"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{food.name}</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{calculatedCalories}</p>
                <p className="text-sm text-gray-500">{t('kcal')}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('protein')}</span>
                  <span className="font-medium">{calculatedProtein}g</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">{t('carbs')}</span>
                  <span className="font-medium">{calculatedCarbs}g</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">{t('fat')}</span>
                  <span className="font-medium">{calculatedFat}g</span>
                </div>
              </div>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('weightGrams')}
              </label>
              <Input
                type="number"
                value={weight}
                onChange={(e) => {
                  const val = e.target.value;
                  setWeight(val === '' ? '' : Number(val));
                }}
                className="text-center text-lg font-medium"
                min={1}
              />
              <p className="text-xs text-gray-400 mt-1 text-center">
                {t('enterWeighedAmount')}
              </p>
            </div>
            
            <Button
              onClick={handleLog}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white py-6 rounded-xl text-lg font-medium"
            >
              {t('logFood')}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}