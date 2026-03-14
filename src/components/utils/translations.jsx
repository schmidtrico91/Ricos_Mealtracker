export const translations = {
  en: {
    // Settings
    settings: "Settings",
    bodyData: "Body Data",
    height: "Height",
    weight: "Weight",
    goals: "Goals",
    goalType: "Goal Type",
    cut: "Cut",
    bulk: "Bulk",
    maintain: "Maintain",
    dailyTargets: "Daily Targets",
    calories: "Calories",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    save: "Save",
    saveGoal: "Save Goal",
    edit: "Edit",
    language: "Language",
    english: "English",
    german: "German",
    
    // Home page
    today: "Today",
    longTermProgress: "Long-term Progress",
    achieved: "achieved",
    addProgress: "Add today's progress",
    revertProgress: "Revert",
    alreadyLogged: "Already logged for today",
    noFoodsLogged: "You haven't eaten anything today yet",
    food: "Food",
    delete: "Delete",
    
    // Days
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
    sunday: "Sun",
    
    // Onboarding
    welcomeTo: "Welcome to",
    letsGetStarted: "Let's get started with your personalized nutrition plan!",
    areYou: "Are you...",
    male: "Male",
    female: "Female",
    howTallAreYou: "How tall are you?",
    whatIsYourWeight: "What is your current weight?",
    whatsYourGoal: "What's your goal?",
    loseFat: "Lose Fat",
    gainMuscle: "Gain Muscle",
    maintainWeight: "Maintain Weight",
    targetWeight: "What's your target weight?",
    timeframe: "What's your timeframe?",
    months: "months",
    perfectSetup: "Perfect! Let's set up your plan",
    back: "Back",
    next: "Next",
    finish: "Finish",
    
    // Search
    search: "Search",
    recent: "Recent",
    myFoods: "My Foods",
    create: "Create",
    logFood: "Log Food",
    name: "Name",
    per100g: "per 100g",
    skip: "Skip",
    enterFoodName: "Enter food name",
    howManyGrams: "How many grams?",
    foodName: "Food name",
    
    // Food detail
    weightGrams: "Weight (grams)",
    enterWeighedAmount: "Enter the actual weighed amount",
    
    // Macro display
    kcal: "kcal",
    
    // Messages
    areYouSure: "Are you sure?",
    deleteFood: "Delete this food entry?",
    cancel: "Cancel",
    
    // Motivational
    almostThere: "Almost there! Keep pushing!",
    halfwayThere: "Halfway there! Great progress!",
    onTrack: "You're on track!",
    greatStart: "Great start! Keep it up!",
    
    // Graph Modal
    calorieTracking: "Calorie Tracking",
    startDate: "Start date",
    endDate: "End date",
    clear: "Clear",
    noDataAvailable: "No data available yet",
    goal: "Goal",
    maintenance: "Maintenance",
  },
  de: {
    // Settings
    settings: "Einstellungen",
    bodyData: "Körperdaten",
    height: "Größe",
    weight: "Gewicht",
    goals: "Ziele",
    goalType: "Zieltyp",
    cut: "Abnehmen",
    bulk: "Zunehmen",
    maintain: "Halten",
    dailyTargets: "Tagesziele",
    calories: "Kalorien",
    protein: "Protein",
    carbs: "Kohlenhydrate",
    fat: "Fett",
    save: "Speichern",
    saveGoal: "Ziel speichern",
    edit: "Bearbeiten",
    language: "Sprache",
    english: "Englisch",
    german: "Deutsch",
    
    // Home page
    today: "Heute",
    longTermProgress: "Langzeitfortschritt",
    achieved: "erreicht",
    addProgress: "Tag verbuchen",
    revertProgress: "Rückgängig",
    alreadyLogged: "Heute bereits eingetragen",
    noFoodsLogged: "Du hast heute noch nichts gegessen",
    food: "Essen",
    delete: "Löschen",
    
    // Days
    monday: "Mo",
    tuesday: "Di",
    wednesday: "Mi",
    thursday: "Do",
    friday: "Fr",
    saturday: "Sa",
    sunday: "So",
    
    // Onboarding
    welcomeTo: "Willkommen bei",
    letsGetStarted: "Lass uns mit deinem personalisierten Ernährungsplan beginnen!",
    areYou: "Du bist...",
    male: "Männlich",
    female: "Weiblich",
    howTallAreYou: "Wie groß bist du?",
    whatIsYourWeight: "Was ist dein aktuelles Gewicht?",
    whatsYourGoal: "Was ist dein Ziel?",
    loseFat: "Fett verlieren",
    gainMuscle: "Muskeln aufbauen",
    maintainWeight: "Gewicht halten",
    targetWeight: "Was ist dein Zielgewicht?",
    timeframe: "Was ist dein Zeitrahmen?",
    months: "Monate",
    perfectSetup: "Perfekt! Lass uns deinen Plan erstellen",
    back: "Zurück",
    next: "Weiter",
    finish: "Fertig",
    
    // Search
    search: "Suchen",
    recent: "Letzte",
    myFoods: "Meine Lebensmittel",
    create: "Erstellen",
    logFood: "Eintragen",
    name: "Name",
    per100g: "pro 100g",
    skip: "Überspringen",
    enterFoodName: "Lebensmittelname eingeben",
    howManyGrams: "Wie viel Gramm?",
    foodName: "Lebensmittelname",
    
    // Food detail
    weightGrams: "Gewicht (Gramm)",
    enterWeighedAmount: "Tatsächlich gewogene Menge eingeben",
    
    // Macro display
    kcal: "kcal",
    
    // Messages
    areYouSure: "Bist du sicher?",
    deleteFood: "Diesen Eintrag löschen?",
    cancel: "Abbrechen",
    
    // Motivational
    almostThere: "Fast geschafft! Weiter so!",
    halfwayThere: "Halbzeit! Super Fortschritt!",
    onTrack: "Du bist auf dem richtigen Weg!",
    greatStart: "Toller Start! Weiter so!",
    
    // Graph Modal
    calorieTracking: "Kalorientracking",
    startDate: "Startdatum",
    endDate: "Enddatum",
    clear: "Löschen",
    noDataAvailable: "Noch keine Daten verfügbar",
    goal: "Ziel",
    maintenance: "Erhaltung",
  }
};

export const useTranslation = (language = 'en') => {
  const t = (key) => {
    return translations[language]?.[key] || translations['en'][key] || key;
  };
  
  return { t };
};