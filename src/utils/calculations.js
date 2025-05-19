// src/utils/calculations.js

import { addDays } from 'date-fns'; // Import addDays for prediction

/**
 * Helper function to calculate age from date of birth.
 * @param {Date} dateOfBirth - The user's date of birth as a Date object.
 * @returns {number} The calculated age in years, or NaN if the input is invalid.
 */
export const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth || !(dateOfBirth instanceof Date) || isNaN(dateOfBirth.getTime())) {
        return NaN;
    }
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
        age--;
    }
    return age;
};


/**
 * Calculates Basal Metabolic Rate (BMR) using the Mifflin-St Jeor equation.
 * @param {Object} params - Parameters for BMR calculation.
 * @param {string} params.sex - 'male' or 'female'.
 * @param {number} params.weight - Weight in kilograms.
 * @param {number} params.height - Height in centimeters.
 * @param {number} params.age - Age in years.
 * @returns {number} Calculated BMR in calories per day, or NaN if inputs are invalid.
 */
export const calculateBmr = ({ sex, weight, height, age }) => {
    // Validate inputs
    if (typeof sex !== 'string' || (sex !== 'male' && sex !== 'female') ||
        typeof weight !== 'number' || isNaN(weight) || weight <= 0 ||
        typeof height !== 'number' || isNaN(height) || height <= 0 ||
        typeof age !== 'number' || isNaN(age) || age <= 0) {
        console.error('Invalid inputs for BMR calculation:', { sex, weight, height, age });
        return NaN; // Return NaN for invalid inputs
    }

    let bmr = 0;
    if (sex === 'male') {
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else { // female
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }

    return bmr;
};

/**
 * Calculates Total Daily Energy Expenditure (TDEE) based on BMR and activity level.
 * @param {number} bmr - Basal Metabolic Rate in calories per day.
 * @param {string} activityLevel - Activity level ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'super_active').
 * @returns {number} Calculated TDEE in calories per day, or NaN if inputs are invalid.
 */
export const calculateTdee = (bmr, activityLevel) => {
    // Activity factors
    const activityFactors = {
        sedentary: 1.2,
        lightly_active: 1.375,
        moderately_active: 1.55,
        very_active: 1.725,
        super_active: 1.9,
    };

    // Validate inputs
    if (typeof bmr !== 'number' || isNaN(bmr) || bmr <= 0 ||
        typeof activityLevel !== 'string' || !activityFactors[activityLevel]) {
        console.error('Invalid inputs for TDEE calculation:', { bmr, activityLevel });
        return NaN; // Return NaN for invalid inputs
    }

    return bmr * activityFactors[activityLevel];
};


/**
 * Calculates points for a linear regression trend line.
 * @param {Array<Object>} dataPoints - Array of points { x: timestamp, y: value }.
 * @returns {Array<Object>} Array of { x: timestamp, y: value } points for the trend line.
 */
export const calculateLinearRegression = (dataPoints) => {
    if (dataPoints.length < 2) {
        return []; // Need at least two points for a line
    }

    // Filter out points with invalid x or y values
    const validPoints = dataPoints.filter(p => typeof p.x === 'number' && !isNaN(p.x) && typeof p.y === 'number' && !isNaN(p.y));

    if (validPoints.length < 2) {
         return [];
    }

    // Sort points by x (timestamp) to ensure correct min/max
    validPoints.sort((a, b) => a.x - b.x);


    // Calculate sums needed for linear regression (y = mx + b)
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    const n = validPoints.length;

    for (const point of validPoints) {
        sumX += point.x;
        sumY += point.y;
        sumXY += point.x * point.y;
        sumXX += point.x * point.x;
    }

    // Calculate slope (m) and y-intercept (b)
    const denominator = (n * sumXX - sumX * sumX);
    if (denominator === 0) {
        return []; // Avoid division by zero if all x values are the same
    }
    const m = (n * sumXY - sumX * sumY) / denominator;
    const b = (sumY - m * sumX) / n;

    // Calculate the y values for the trend line at the min and max x values
    const minX = validPoints[0].x;
    const maxX = validPoints[validPoints.length - 1].x;

    const trendLinePoints = [
        { x: minX, y: m * minX + b },
        { x: maxX, y: m * maxX + b },
    ];

    return trendLinePoints;
};


/**
 * Predicts future weight based on the last entry, target caloric intake, and user profile.
 * Uses a simplified model assuming a linear relationship between calorie deficit/surplus and weight change.
 * Also predicts body fat percentage based on a simple linear projection from the last entry's body fat and weight.
 *
 * @param {Object} params - Parameters for prediction.
 * @param {Object} params.lastEntry - The most recent body metrics entry { date: Date, weight: number, bodyFat: number, weightUnit: string }.
 * @param {number} params.targetCaloricIntake - The calculated target daily caloric intake.
 * @param {Object} params.userProfile - The user's profile { sex: string, dateOfBirth: Date, height: number (inches), activityLevel: string, weightGoalType: string, targetWeight: number|null, targetRate: number|null, weightUnit: string|null }.
 * @param {number} [params.predictionDays=90] - Number of days into the future to predict.
 * @returns {Array<Object>} An array of predicted points { x: timestamp, y: predictedWeight, bodyFat: predictedBodyFat }.
 */
export const predictWeightCalorieModel = ({ lastEntry, targetCaloricIntake, userProfile, predictionDays = 90 }) => {
    console.log('predictWeightCalorieModel: Received inputs:', { lastEntry, targetCaloricIntake, userProfile, predictionDays });

    // --- Detailed Input Validation ---
    let isValid = true;
    const validationErrors = [];

    if (!lastEntry || typeof lastEntry !== 'object') {
        isValid = false;
        validationErrors.push('lastEntry is missing or not an object.');
    } else {
        if (!(lastEntry.date instanceof Date) || isNaN(lastEntry.date.getTime())) {
            isValid = false;
            validationErrors.push('lastEntry.date is missing or not a valid Date.');
        }
        if (typeof lastEntry.weight !== 'number' || isNaN(lastEntry.weight) || lastEntry.weight <= 0) {
            isValid = false;
            validationErrors.push('lastEntry.weight is missing, not a number, or not positive.');
        }
         // Body fat is optional for the *weight* prediction itself, but needed for BF prediction
        if (typeof lastEntry.bodyFat !== 'number' || isNaN(lastEntry.bodyFat) || lastEntry.bodyFat < 0 || lastEntry.bodyFat > 100) {
             console.warn('predictWeightCalorieModel: lastEntry.bodyFat is missing or invalid. Body fat prediction may be inaccurate or skipped.', lastEntry.bodyFat);
             // Don't set isValid to false just for bodyFat if weight/date are okay, but warn.
        }
        if (typeof lastEntry.weightUnit !== 'string' || lastEntry.weightUnit === '') {
             isValid = false;
             validationErrors.push('lastEntry.weightUnit is missing or not a string.');
        }
    }

    if (typeof targetCaloricIntake !== 'number' || isNaN(targetCaloricIntake) || targetCaloricIntake < 0) {
        isValid = false;
        validationErrors.push('targetCaloricIntake is missing, not a number, or negative.');
    }

    if (!userProfile || typeof userProfile !== 'object') {
        isValid = false;
        validationErrors.push('userProfile is missing or not an object.');
    } else {
        if (typeof userProfile.sex !== 'string' || (userProfile.sex !== 'male' && userProfile.sex !== 'female')) {
            isValid = false;
            validationErrors.push('userProfile.sex is missing or invalid.');
        }
        if (!(userProfile.dateOfBirth instanceof Date) || isNaN(userProfile.dateOfBirth.getTime())) {
            isValid = false;
            validationErrors.push('userProfile.dateOfBirth is missing or not a valid Date.');
        }
        if (typeof userProfile.height !== 'number' || isNaN(userProfile.height) || userProfile.height <= 0) {
            isValid = false;
            validationErrors.push('userProfile.height is missing, not a number, or not positive.');
        }
        if (typeof userProfile.activityLevel !== 'string' || userProfile.activityLevel === '') {
             isValid = false;
             validationErrors.push('userProfile.activityLevel is missing or empty.');
        }
         if (typeof userProfile.weightGoalType !== 'string' || userProfile.weightGoalType === '') {
              isValid = false;
              validationErrors.push('userProfile.weightGoalType is missing or empty.');
         }
         // Check target weight/rate only if goal is not maintain
         if (userProfile.weightGoalType !== 'maintain') {
             if (typeof userProfile.targetWeight !== 'number' || isNaN(userProfile.targetWeight) || userProfile.targetWeight <= 0) {
                 isValid = false;
                 validationErrors.push('userProfile.targetWeight is missing, not a number, or not positive when goal is not maintain.');
             }
              if (typeof userProfile.targetRate !== 'number' || isNaN(userProfile.targetRate) || userProfile.targetRate <= 0) {
                 isValid = false;
                 validationErrors.push('userProfile.targetRate is missing, not a number, or not positive when goal is not maintain.');
             }
         }
         // Note: userProfile.weightUnit is used for converting target weight/rate, but not strictly required for the core prediction if target is null
    }

     if (typeof predictionDays !== 'number' || isNaN(predictionDays) || predictionDays <= 0) {
         isValid = false;
         validationErrors.push('predictionDays is missing, not a number, or not positive.');
     }


    if (!isValid) {
        console.error('Invalid inputs for calorie model prediction:', { lastEntry, targetCaloricIntake, userProfile, predictionDays });
        console.error('Validation Errors:', validationErrors);
        return []; // Return empty array if inputs are invalid
    }
    // --- End Detailed Input Validation ---


    // Constants
    const CALORIES_PER_LB = 3500; // Approximate calories in one pound of fat
    const DAYS_IN_WEEK = 7;

    // Convert last entry weight to lbs for calculation consistency if needed
    let lastWeightLbs = lastEntry.weight;
    if (lastEntry.weightUnit === 'kg') {
        lastWeightLbs = lastEntry.weight * 2.20462; // Convert kg to lbs
    }

    // Calculate the user's current TDEE based on the last entry's weight and profile
     // Need to convert weight back to kg for BMR calculation
     const lastWeightKg = lastWeightLbs * 0.453592;
     const age = calculateAge(userProfile.dateOfBirth); // Now calculateAge is available here
     const heightInCm = userProfile.height * 2.54; // Need height in cm

     const currentBmr = calculateBmr({
         sex: userProfile.sex,
         weight: lastWeightKg,
         height: heightInCm,
         age: age
     });

     const currentTdee = calculateTdee(currentBmr, userProfile.activityLevel);


    // Calculate the daily calorie deficit or surplus based on the target intake vs current TDEE
    // Note: This is a simplification. A more complex model would account for TDEE changing as weight changes.
    const dailyCalorieDifference = targetCaloricIntake - currentTdee;

    // Calculate daily weight change in lbs
    const dailyWeightChangeLbs = dailyCalorieDifference / CALORIES_PER_LB;

    const predictedPoints = [];
    let currentWeightLbs = lastWeightLbs;
    let currentBodyFat = lastEntry.bodyFat; // Start with the last recorded body fat
    let currentDate = new Date(lastEntry.date.getTime()); // Start from the last entry date

    // Calculate Lean Body Mass (LBM) from the last entry
    // Assuming lastEntry.weight is in lastEntry.weightUnit and lastEntry.bodyFat is percentage
    let lastWeightInKgForLBM = lastEntry.weight;
     if (lastEntry.weightUnit === 'lbs') {
         lastWeightInKgForLBM = lastEntry.weight * 0.453592; // Convert lbs to kg for LBM formula
     }

    // Using the Boer formula for LBM (common and relatively simple)
    // LBM (kg) = 0.407 * weight (kg) + 0.267 * height (cm) - 19.2 for men
    // LBM (kg) = 0.252 * weight (kg) + 0.473 * height (cm) - 48.3 for women
    let lastLbmKg = 0;
    const heightInCmForLBM = userProfile.height * 2.54; // Need height in cm

    if (userProfile.sex === 'male') {
        lastLbmKg = 0.407 * lastWeightInKgForLBM + 0.267 * heightInCmForLBM - 19.2;
    } else { // female
        lastLbmKg = 0.252 * lastWeightInKgForLBM + 0.473 * heightInCmForLBM - 48.3;
    }

    // Convert last LBM to the last entry's weight unit for consistency in calculation
    let lastLbmOriginalUnit = lastLbmKg;
     if (lastEntry.weightUnit === 'lbs') {
         lastLbmOriginalUnit = lastLbmKg * 2.20462; // Convert kg to lbs
     }


    // Add the last historical point as the starting point of the prediction line
    predictedPoints.push({
        x: currentDate.getTime(),
        y: lastEntry.weight, // Use weight in its original unit
        bodyFat: currentBodyFat // Use last recorded body fat (corrected variable name)
    });


    // Project future weight and body fat day by day
    for (let i = 1; i <= predictionDays; i++) {
        currentDate = addDays(currentDate, 1); // Move to the next day

        // Predict the new weight for the day in lbs
        currentWeightLbs += dailyWeightChangeLbs;

        // Convert the predicted weight back to the last entry's unit for consistency
        let predictedWeightOriginalUnit = currentWeightLbs;
        if (lastEntry.weightUnit === 'kg') {
            predictedWeightOriginalUnit = currentWeightLbs * 0.453592; // Convert lbs to kg
        }

        // Predict body fat percentage for the day
        // This is a very simple model: Assume LBM remains constant and all weight change is fat mass.
        // Fat Mass = Total Weight - LBM
        // Predicted Fat Mass (Original Unit) = Predicted Weight (Original Unit) - Last LBM (Original Unit)
        const predictedFatMassOriginalUnit = predictedWeightOriginalUnit - lastLbmOriginalUnit;

        // Ensure predicted fat mass is not negative
        const clampedPredictedFatMass = Math.max(0, predictedFatMassOriginalUnit);

        // Predicted Body Fat % = (Predicted Fat Mass / Predicted Weight) * 100
        // Avoid division by zero if predicted weight is zero or negative (shouldn't happen with positive daily change)
        let predictedBodyFat = 0;
        if (predictedWeightOriginalUnit > 0) {
             predictedBodyFat = (clampedPredictedFatMass / predictedWeightOriginalUnit) * 100;
        }

        // Ensure body fat percentage is within a reasonable range (e.g., 0-100)
        predictedBodyFat = Math.max(0, Math.min(100, predictedBodyFat));


        // Add the predicted point to the array
        predictedPoints.push({
            x: currentDate.getTime(), // Use timestamp for x-value
            y: predictedWeightOriginalUnit, // Predicted weight in the last entry's unit
            bodyFat: predictedBodyFat // Predicted body fat percentage
        });
    }

    console.log('predictWeightCalorieModel: Generated predictionPoints', predictedPoints);

    return predictedPoints;
};

// Removed Double Exponential Smoothing functions as they are no longer used
// export const calculateDoubleExponentialSmoothing = ...
