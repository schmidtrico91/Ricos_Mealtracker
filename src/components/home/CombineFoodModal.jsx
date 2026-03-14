import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CombineFoodModal({ isOpen, onClose, selectedFoods, onCreateCombined, language = 'en' }) {
  const [foodName, setFoodName] = useState('');
  
  const totals = useMemo(() => {
    return selectedFoods.reduce((acc, food) => ({
      weight: acc.weight + (food.weight_grams || 0),
      calories: acc.calories + (food.calories || 0),
      protein: acc.protein + (food.protein || 0),
      carbs: acc.carbs + (food.carbs || 0),
      fat: acc.fat + (food.fat || 0)
    }), { weight: 0, calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [selectedFoods]);
  
  const handleCreate = () => {
    if (!foodName.trim()) return;
    onCreateCombined(foodName, totals);
    setFoodName('');
  };
  
  if (!isOpen) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Create Combined Food</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <div className="mb-6">
          <label className="block text-sm text-gray-600 mb-2">Food Name</label>
          <Input
            value={foodName}
            onChange={(e) => setFoodName(e.target.value)}
            placeholder="Tipp: Name + Gewicht"
            className="text-lg"
          />
        </div>
        
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-medium text-gray-700">Selected Foods:</h3>
          {selectedFoods.map((food) => (
            <div key={food.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">{food.food_name}</span>
              <span className="text-xs text-gray-500">{Math.round(food.weight_grams)}g</span>
            </div>
          ))}
        </div>
        
        <div className="bg-teal-50 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-medium text-teal-900 mb-3">Combined Totals:</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-teal-700">Calories</p>
              <p className="text-lg font-semibold text-teal-900">{Math.round(totals.calories)} kcal</p>
            </div>
            <div>
              <p className="text-xs text-teal-700">Weight</p>
              <p className="text-lg font-semibold text-teal-900">{Math.round(totals.weight)}g</p>
            </div>
            <div>
              <p className="text-xs text-teal-700">Protein</p>
              <p className="text-lg font-semibold text-teal-900">{Math.round(totals.protein)}g</p>
            </div>
            <div>
              <p className="text-xs text-teal-700">Carbs</p>
              <p className="text-lg font-semibold text-teal-900">{Math.round(totals.carbs)}g</p>
            </div>
            <div>
              <p className="text-xs text-teal-700">Fat</p>
              <p className="text-lg font-semibold text-teal-900">{Math.round(totals.fat)}g</p>
            </div>
          </div>
        </div>
        
        <Button
          onClick={handleCreate}
          disabled={!foodName.trim()}
          className="w-full py-6 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-lg font-medium"
        >
          Create Food
        </Button>
      </motion.div>
    </motion.div>
  );
}