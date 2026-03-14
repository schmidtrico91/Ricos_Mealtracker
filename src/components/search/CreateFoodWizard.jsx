import React, { useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";

const STEPS = ['name', 'weight', 'protein', 'carbs', 'fat', 'calories'];

export default function CreateFoodWizard({ onComplete, onCancel, initialName = '' }) {
  const [step, setStep] = useState(initialName ? 'weight' : 'name');
  const [foodData, setFoodData] = useState({
    name: initialName,
    weight: 100,
    protein: 0,
    carbs: 0,
    fat: 0,
    calories: 0,
    protein_per_100g: 0,
    carbs_per_100g: 0,
    fat_per_100g: 0,
    calories_per_100g: 0
  });
  const [skippedMacros, setSkippedMacros] = useState({
    protein: false,
    carbs: false,
    fat: false
  });

  const calculateCaloriesFromMacros = () => {
    const p = skippedMacros.protein ? 0 : foodData.protein;
    const c = skippedMacros.carbs ? 0 : foodData.carbs;
    const f = skippedMacros.fat ? 0 : foodData.fat;
    return Math.round(p * 4 + c * 4 + f * 9);
  };

  const calculatePer100g = () => {
    if (foodData.weight === 0) return { protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 0, calories_per_100g: 0 };
    const multiplier = 100 / foodData.weight;
    return {
      protein_per_100g: Math.round(foodData.protein * multiplier * 10) / 10,
      carbs_per_100g: Math.round(foodData.carbs * multiplier * 10) / 10,
      fat_per_100g: Math.round(foodData.fat * multiplier * 10) / 10,
      calories_per_100g: Math.round(foodData.calories * multiplier)
    };
  };

  const handleNext = () => {
    if (step === 'name') {
      setStep('weight');
    } else if (step === 'weight') {
      setStep('protein');
    } else if (step === 'protein') {
      setStep('carbs');
    } else if (step === 'carbs') {
      setStep('fat');
    } else if (step === 'fat') {
      const anySkipped = skippedMacros.protein || skippedMacros.carbs || skippedMacros.fat;
      const calculatedCalories = calculateCaloriesFromMacros();
      const updatedData = { ...foodData, calories: calculatedCalories };
      if (anySkipped) {
        setFoodData(updatedData);
        setStep('calories');
      } else {
        completeFoodWithData(updatedData);
      }
    } else if (step === 'calories') {
      completeFoodWithData(foodData);
    }
  };

  const completeFoodWithData = (data) => {
    const per100g = calculatePer100gFromData(data);
    onComplete({
      name: data.name,
      weight: data.weight,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      calories: data.calories,
      protein_per_100g: per100g.protein_per_100g,
      carbs_per_100g: per100g.carbs_per_100g,
      fat_per_100g: per100g.fat_per_100g,
      calories_per_100g: per100g.calories_per_100g,
      is_custom: true
    });
  };

  const calculatePer100gFromData = (data) => {
    if (data.weight === 0) return { protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 0, calories_per_100g: 0 };
    const multiplier = 100 / data.weight;
    return {
      protein_per_100g: Math.round(data.protein * multiplier * 10) / 10,
      carbs_per_100g: Math.round(data.carbs * multiplier * 10) / 10,
      fat_per_100g: Math.round(data.fat * multiplier * 10) / 10,
      calories_per_100g: Math.round(data.calories * multiplier)
    };
  };

  const handleBack = () => {
    const stepIndex = STEPS.indexOf(step);
    if (stepIndex > 0) {
      if (step === 'calories' && !(skippedMacros.protein || skippedMacros.carbs || skippedMacros.fat)) {
        setStep('fat');
      } else {
        setStep(STEPS[stepIndex - 1]);
      }
    } else {
      onCancel();
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'name':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Neues Lebensmittel erstellen</h2>
            <Input
              value={foodData.name}
              onChange={(e) => setFoodData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Lebensmittelname"
              className="text-lg py-6"
              autoFocus
            />
            <p className="text-sm text-gray-400">Du kannst es spaeter auch als Mahlzeit speichern.</p>
          </div>
        );
        
      case 'weight':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Wie viel wiegt es?</h2>
            <p className="text-sm text-gray-500">Gib das Gewicht deiner Probe in Gramm ein.</p>
            
            <div className="text-center text-5xl font-bold text-gray-900">
              {foodData.weight} g
            </div>
            <Slider
              value={[foodData.weight]}
              onValueChange={([value]) => setFoodData(prev => ({ ...prev, weight: value }))}
              max={1000}
              step={5}
              className="py-4"
            />
            <div className="flex justify-between text-sm text-gray-400">
              <span>0 g</span>
              <span>1000 g</span>
            </div>
          </div>
        );

      case 'protein':
      case 'carbs':
      case 'fat':
        const macroLabels = {
          protein: 'Protein',
          carbs: 'Kohlenhydrate',
          fat: 'Fett'
        };
        const macroLabel = macroLabels[step] || step;
        const macroKey = step;
        const skipKey = step;
        
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Makros eingeben</h2>
            <p className="text-sm text-gray-500">{macroLabel} in der {foodData.weight}g Probe</p>
            
            <div className="space-y-4">
              <label className="text-sm text-gray-600">{macroLabel} (Gramm)</label>
              <div className="text-center text-4xl font-bold text-gray-900">
                {foodData[macroKey]} g
              </div>
              <Slider
                value={[foodData[macroKey]]}
                onValueChange={([value]) => setFoodData(prev => ({ ...prev, [macroKey]: value }))}
                max={200}
                step={0.1}
                className="py-4"
                disabled={skippedMacros[skipKey]}
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>0 g</span>
                <span>200 g</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id={`skip-${step}`}
                checked={skippedMacros[skipKey]}
                onCheckedChange={(checked) => setSkippedMacros(prev => ({ ...prev, [skipKey]: checked }))}
              />
              <label htmlFor={`skip-${step}`} className="text-sm text-gray-500">
                Ich kenne die {macroLabel}-Menge nicht
              </label>
            </div>
          </div>
        );
        
      case 'calories':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Kalorien in {foodData.weight}g</h2>
            <p className="text-sm text-gray-500">Kalorien werden aus den eingegebenen Makros berechnet.</p>

            <div className="text-center text-4xl font-bold text-gray-900">
              {foodData.calories} kcal
            </div>
            <Slider
              value={[foodData.calories]}
              onValueChange={([value]) => setFoodData(prev => ({ ...prev, calories: value }))}
              max={2000}
              step={5}
              className="py-4"
            />
            <div className="flex justify-between text-sm text-gray-400">
              <span>0 kcal</span>
              <span>2000 kcal</span>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-1">
              {!skippedMacros.protein && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Protein</span>
                  <span>{foodData.protein} g</span>
                </div>
              )}
              {!skippedMacros.carbs && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Kohlenhydrate</span>
                  <span>{foodData.carbs} g</span>
                </div>
              )}
              {!skippedMacros.fat && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Fett</span>
                  <span>{foodData.fat} g</span>
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 p-4 border-b">
        <button
          onClick={handleBack}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <span className="text-sm text-gray-500">
          {step !== 'name' && `Schritt ${STEPS.indexOf(step)} von ${STEPS.length - 1}`}
        </span>
      </div>
      
      <div className="flex-1 overflow-auto p-6 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderStep()}
            <div className="mt-8 pb-6">
              <Button
                onClick={handleNext}
                disabled={step === 'name' && !foodData.name.trim()}
                className="w-full bg-teal-500 hover:bg-teal-600 text-white py-6 rounded-xl text-lg font-medium"
              >
                {step === 'calories' || (step === 'fat' && !(skippedMacros.protein || skippedMacros.carbs || skippedMacros.fat)) ? (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Lebensmittel hinzufuegen
                  </>
                ) : (
                  'Weiter'
                )}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
