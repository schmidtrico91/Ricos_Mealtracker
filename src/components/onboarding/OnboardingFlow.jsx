import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ChevronLeft } from 'lucide-react';
import { appClient } from '@/api/appClient';
import OnboardingSlide from './OnboardingSlide';

const STEPS = ['language', 'welcome', 'gender', 'age', 'height', 'weight', 'activity', 'goal', 'target', 'calculating', 'complete'];

export default function OnboardingFlow({ onComplete }) {
  const [step, setStep] = useState('language');
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState({
    language: 'de',
    gender: '',
    age: 25,
    height: 170,
    weight: 70,
    activity_level: '',
    goal: '',
    goalWeightChange: 5
  });

  const calculateBMR = () => {
    // Mifflin-St Jeor Equation
    if (data.gender === 'male') {
      return (10 * data.weight) + (6.25 * data.height) - (5 * data.age) + 5;
    } else {
      return (10 * data.weight) + (6.25 * data.height) - (5 * data.age) - 161;
    }
  };

  const getActivityMultiplier = () => {
    const multipliers = {
      sedentary: 1.2,
      lightly_active: 1.375,
      moderately_active: 1.55,
      very_active: 1.725,
      super_active: 1.9
    };
    return multipliers[data.activity_level] || 1.2;
  };

  const calculateTargets = () => {
    // Calculate BMR using Mifflin-St Jeor
    const bmr = calculateBMR();
    
    // Calculate TDEE (maintenance calories)
    const maintenance = Math.round(bmr * getActivityMultiplier());
    
    // Total calories needed = goal weight change * 9300
    const totalCaloriesNeeded = Math.round(data.goalWeightChange * 9300);
    
    // Adjust based on goal
    let dailyCalories;
    let targetWeight;
    if (data.goal === 'fat_loss') {
      dailyCalories = maintenance - 500;
      targetWeight = data.weight - data.goalWeightChange;
    } else {
      dailyCalories = maintenance + 300;
      targetWeight = data.weight + data.goalWeightChange;
    }
    
    // Macro calculations
    const protein = Math.round(data.weight * 2); // 2g per kg bodyweight
    const fat = Math.round((dailyCalories * 0.25) / 9); // 25% of calories from fat
    const carbs = Math.round((dailyCalories - protein * 4 - fat * 9) / 4);
    
    return {
      maintenance_calories: maintenance,
      daily_calories: dailyCalories,
      protein_target: protein,
      carbs_target: carbs,
      fat_target: fat,
      target_weight: targetWeight,
      goal_weight_change: data.goalWeightChange,
      total_calories_needed: totalCaloriesNeeded,
      cumulative_calories: 0,
      last_updated_date: new Date().toISOString().split('T')[0]
    };
  };

  const handleBack = () => {
    const stepIndex = STEPS.indexOf(step);
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1]);
    }
  };

  const handleNext = async () => {
    const stepIndex = STEPS.indexOf(step);
    if (isSaving) return;
    
    if (step === 'goal' && data.goal === 'maintain') {
      setStep('calculating');
      setIsSaving(true);
      
      setTimeout(async () => {
        const bmr = calculateBMR();
        const maintenance = Math.round(bmr * getActivityMultiplier());
        const protein = Math.round(data.weight * 2);
        const fat = Math.round((maintenance * 0.25) / 9);
        const carbs = Math.round((maintenance - protein * 4 - fat * 9) / 4);
        
        try {
          await appClient.entities.UserProfile.create({
            ...data,
            maintenance_calories: maintenance,
            daily_calories: maintenance,
            protein_target: protein,
            carbs_target: carbs,
            fat_target: fat,
            target_weight: data.weight,
            language: data.language,
            onboarding_completed: true
          });
          
          setStep('complete');
        } catch (error) {
          console.error('Error saving profile:', error);
          alert('Profil konnte nicht gespeichert werden. Bitte erneut versuchen.');
          setStep('goal');
        } finally {
          setIsSaving(false);
        }
      }, 2000);
      return;
    }
    
    if (step === 'target') {
      setStep('calculating');
      setIsSaving(true);
      
      // Simulate calculation time
      setTimeout(async () => {
        const targets = calculateTargets();
        
        try {
          const goalStartDate = new Date().toISOString().split('T')[0];
          const goalEndDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          
          await appClient.entities.UserProfile.create({
            ...data,
            ...targets,
            goal_start_date: goalStartDate,
            goal_end_date: goalEndDate,
            language: data.language,
            onboarding_completed: true
          });
          
          setStep('complete');
        } catch (error) {
          console.error('Error saving profile:', error);
          alert('Profil konnte nicht gespeichert werden. Bitte erneut versuchen.');
          setStep('target');
        } finally {
          setIsSaving(false);
        }
      }, 2000);
    } else if (step === 'complete') {
      onComplete();
    } else {
      setStep(STEPS[stepIndex + 1]);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'language':
        return (
          <OnboardingSlide
            title="Wähle deine Sprache"
            subtitle="Wähle deine bevorzugte Sprache für die App."
          >
            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setData(prev => ({ ...prev, language: 'en' }))}
                className={`w-40 h-40 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                  data.language === 'en'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-5xl mb-3">🇬🇧</span>
                <span className="font-medium text-gray-700">English</span>
              </button>
              <button
                onClick={() => setData(prev => ({ ...prev, language: 'de' }))}
                className={`w-40 h-40 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                  data.language === 'de'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-5xl mb-3">🇩🇪</span>
                <span className="font-medium text-gray-700">Deutsch</span>
              </button>
            </div>
            <Button
              onClick={handleNext}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg"
            >
              Weiter
            </Button>
          </OnboardingSlide>
        );
        
      case 'welcome':
        return (
          <OnboardingSlide
            title="Willkommen!"
            subtitle="Lass uns deine personalisierten Ernährungsziele in wenigen Schritten einrichten."
          >
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center mb-8">
              <span className="text-4xl text-white">🎯</span>
            </div>
            <Button
              onClick={handleNext}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg"
            >
              Los geht's
            </Button>
          </OnboardingSlide>
        );
        
      case 'gender':
        return (
          <OnboardingSlide
            title="Was ist dein Geschlecht?"
            subtitle="Das hilft uns, deinen Stoffwechsel genauer zu berechnen."
          >
            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setData(prev => ({ ...prev, gender: 'male' }))}
                className={`w-32 h-32 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                  data.gender === 'male'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-4xl mb-2">👨</span>
                <span className="font-medium text-gray-700">Männlich</span>
              </button>
              <button
                onClick={() => setData(prev => ({ ...prev, gender: 'female' }))}
                className={`w-32 h-32 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                  data.gender === 'female'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-4xl mb-2">👩</span>
                <span className="font-medium text-gray-700">Weiblich</span>
              </button>
            </div>
            <Button
              onClick={handleNext}
              disabled={!data.gender}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg disabled:opacity-50"
            >
              Weiter
            </Button>
          </OnboardingSlide>
        );
        
      case 'height':
        return (
          <OnboardingSlide
            title="Wie groß bist du?"
            subtitle="Deine Größe hilft uns, deinen idealen Bedarf zu berechnen."
          >
            <div className="text-center mb-8">
              <span className="text-6xl font-bold text-gray-900">{data.height}</span>
              <span className="text-2xl text-gray-500 ml-2">cm</span>
            </div>
            <div className="w-full max-w-xs mb-8">
              <Slider
                value={[data.height]}
                onValueChange={([value]) => setData(prev => ({ ...prev, height: value }))}
                min={140}
                max={220}
                step={1}
                className="py-4"
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>140 cm</span>
                <span>220 cm</span>
              </div>
            </div>
            <Button
              onClick={handleNext}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg"
            >
              Weiter
            </Button>
          </OnboardingSlide>
        );
        
      case 'age':
        return (
          <OnboardingSlide
            title="Wie alt bist du?"
            subtitle="Dein Alter hilft uns, deinen Stoffwechsel zu berechnen."
          >
            <div className="text-center mb-8">
              <span className="text-6xl font-bold text-gray-900">{data.age}</span>
              <span className="text-2xl text-gray-500 ml-2">Jahre</span>
            </div>
            <div className="w-full max-w-xs mb-8">
              <Slider
                value={[data.age]}
                onValueChange={([value]) => setData(prev => ({ ...prev, age: value }))}
                min={16}
                max={80}
                step={1}
                className="py-4"
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>16</span>
                <span>80</span>
              </div>
            </div>
            <Button
              onClick={handleNext}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg"
            >
              Weiter
            </Button>
          </OnboardingSlide>
        );

      case 'weight':
        return (
          <OnboardingSlide
            title="Was ist dein aktuelles Gewicht?"
            subtitle="Wir werden deinen Fortschritt von hier aus verfolgen."
          >
            <div className="text-center mb-8">
              <span className="text-6xl font-bold text-gray-900">{data.weight}</span>
              <span className="text-2xl text-gray-500 ml-2">kg</span>
            </div>
            <div className="w-full max-w-xs mb-8">
              <Slider
                value={[data.weight]}
                onValueChange={([value]) => setData(prev => ({ ...prev, weight: value }))}
                min={40}
                max={180}
                step={0.5}
                className="py-4"
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>40 kg</span>
                <span>180 kg</span>
              </div>
            </div>
            <Button
              onClick={handleNext}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg"
            >
              Weiter
            </Button>
          </OnboardingSlide>
        );
        
      case 'activity':
        return (
          <OnboardingSlide
            title="Wie aktiv bist du?"
            subtitle="Dein Aktivitätslevel bestimmt deinen Kalorienbedarf."
          >
            <div className="flex flex-col gap-3 mb-8 w-full max-w-md">
              <button
                onClick={() => setData(prev => ({ ...prev, activity_level: 'sedentary' }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  data.activity_level === 'sedentary'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="font-semibold text-gray-800 block">Wenig aktiv</span>
                <span className="text-xs text-gray-500">Wenig bis keine Bewegung</span>
              </button>
              <button
                onClick={() => setData(prev => ({ ...prev, activity_level: 'lightly_active' }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  data.activity_level === 'lightly_active'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="font-semibold text-gray-800 block">Leicht aktiv</span>
                <span className="text-xs text-gray-500">Leichte Bewegung 1-3 Tage/Woche</span>
              </button>
              <button
                onClick={() => setData(prev => ({ ...prev, activity_level: 'moderately_active' }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  data.activity_level === 'moderately_active'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="font-semibold text-gray-800 block">Moderat aktiv</span>
                <span className="text-xs text-gray-500">Moderate Bewegung 3-5 Tage/Woche</span>
              </button>
              <button
                onClick={() => setData(prev => ({ ...prev, activity_level: 'very_active' }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  data.activity_level === 'very_active'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="font-semibold text-gray-800 block">Sehr aktiv</span>
                <span className="text-xs text-gray-500">Intensive Bewegung 6-7 Tage/Woche</span>
              </button>
              <button
                onClick={() => setData(prev => ({ ...prev, activity_level: 'super_active' }))}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  data.activity_level === 'super_active'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="font-semibold text-gray-800 block">Extrem aktiv</span>
                <span className="text-xs text-gray-500">Sehr intensive Bewegung & körperlicher Beruf</span>
              </button>
            </div>
            <Button
              onClick={handleNext}
              disabled={!data.activity_level}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg disabled:opacity-50"
            >
              Weiter
            </Button>
          </OnboardingSlide>
        );
        
      case 'goal':
        return (
          <OnboardingSlide
            title="Was ist dein Ziel?"
            subtitle="Wähle aus, was du erreichen möchtest."
          >
            <div className="flex flex-col gap-4 mb-8 w-full max-w-xs">
              <button
                onClick={() => setData(prev => ({ ...prev, goal: 'fat_loss' }))}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                  data.goal === 'fat_loss'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl mb-2 block">🔥</span>
                <span className="font-semibold text-gray-800 block">Fett verlieren</span>
                <span className="text-sm text-gray-500">Kaloriendefizit zur Gewichtsreduktion</span>
              </button>
              <button
                onClick={() => setData(prev => ({ ...prev, goal: 'muscle_gain' }))}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                  data.goal === 'muscle_gain'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl mb-2 block">💪</span>
                <span className="font-semibold text-gray-800 block">Muskeln aufbauen</span>
                <span className="text-sm text-gray-500">Kalorienüberschuss für Muskelwachstum</span>
              </button>
              <button
                onClick={() => setData(prev => ({ ...prev, goal: 'maintain' }))}
                className={`p-6 rounded-2xl border-2 text-left transition-all ${
                  data.goal === 'maintain'
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl mb-2 block">⚖️</span>
                <span className="font-semibold text-gray-800 block">Halten</span>
                <span className="text-sm text-gray-500">Aktuelles Gewicht beibehalten</span>
              </button>
            </div>
            <Button
              onClick={handleNext}
              disabled={!data.goal}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg disabled:opacity-50"
            >
              Weiter
            </Button>
          </OnboardingSlide>
        );
        
      case 'target':
        return (
          <OnboardingSlide
            title={data.goal === 'fat_loss' ? "Wie viel Gewicht möchtest du verlieren?" : "Wie viel Gewicht möchtest du zunehmen?"}
            subtitle={data.goal === 'fat_loss' ? "Dein Abnehmziel in Kilogramm" : "Dein Muskelaufbauziel in Kilogramm"}
          >
            <div className="text-center mb-8">
              <span className="text-6xl font-bold text-gray-900">{data.goalWeightChange}</span>
              <span className="text-2xl text-gray-500 ml-2">kg</span>
            </div>
            <div className="w-full max-w-xs mb-8">
              <Slider
                value={[data.goalWeightChange]}
                onValueChange={([value]) => setData(prev => ({ ...prev, goalWeightChange: value }))}
                min={1}
                max={30}
                step={0.5}
                className="py-4"
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>1 kg</span>
                <span>30 kg</span>
              </div>
            </div>
            <Button
              onClick={handleNext}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg"
            >
              Plan berechnen
            </Button>
          </OnboardingSlide>
        );
        
      case 'calculating':
        return (
          <OnboardingSlide
            title="Berechne deinen Plan..."
            subtitle="Wir erstellen deine personalisierten Ernährungsziele."
          >
            <div className="relative w-24 h-24">
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-teal-200"
              />
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-teal-500 border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </OnboardingSlide>
        );
        
      case 'complete':
        return (
          <OnboardingSlide
            title="Alles bereit!"
            subtitle="Dein personalisierter Ernährungsplan ist fertig."
          >
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mb-8">
              <span className="text-5xl text-white">✓</span>
            </div>
            <Button
              onClick={handleNext}
              className="w-full max-w-xs bg-teal-500 hover:bg-teal-600 py-6 rounded-xl text-lg"
            >
              Tracking starten
            </Button>
          </OnboardingSlide>
        );
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const showBackButton = stepIndex > 0 && step !== 'calculating' && step !== 'complete';

  return (
    <div className="fixed inset-0 bg-white z-50">
      {showBackButton && (
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 z-10 p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-gray-600" />
        </button>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={step}>
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
