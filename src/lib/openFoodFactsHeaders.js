const APP_IDENTITY = 'RicosMealtracker/1.0 (support@ricos-mealtracker.app)';

export const getOpenFoodFactsHeaders = () => ({
  // Browsers and some native stacks may block overriding User-Agent.
  // OFF also supports app identification via X-User-Agent.
  'X-User-Agent': APP_IDENTITY
});
