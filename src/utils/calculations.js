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

// Activity Level Multipliers (Harris-Benedict standard, commonly used with Mifflin-St Jeor)
const activityMultipliers = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    super_active: 1.9,
};

/**
 * Calculates Total Daily Energy Expenditure (TDEE) based on BMR and activity level.
 * @param {number} bmr - Basal Metabolic Rate in calories per day.
 * @param {string} activityLevel - Activity level ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'super_active').
 * @returns {number} Calculated TDEE in calories per day, or NaN if inputs are invalid.
 */
export const calculateTdee = (bmr, activityLevel) => {
    if (typeof bmr !== 'number' || isNaN(bmr) || bmr <= 0) {
        console.error("calculateTdee: Invalid BMR value.");
        return NaN;
    }
    if (!activityMultipliers[activityLevel]) {
        console.error("calculateTdee: Invalid activity level specified.");
        return NaN;
    }

    return bmr * activityMultipliers[activityLevel];
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

// Function to predict weight using a first-order linear difference equation
// based on the provided formula: W(t+1) = r*W(t) + b
// W(t) is weight in kg on day t
// r = 1 - m * (10 * 0.453592) / 3500
// b = (I - m * c) / 3500
// m is activity factor (from activityMultipliers)
// I is fixed daily intake (approx 0.8 * TDEE_0, where TDEE_0 is TDEE at initial weight)
// c = 6.25 * H_cm - 5 * A + 5 (non-weight part of Mifflin-St Jeor)
export const predictWeightLinearDifference = ({ lastEntry, targetCaloricIntake, userProfile, predictionDays }) => {
    console.log('predictWeightLinearDifference: Inputs:', { lastEntry, targetCaloricIntake, userProfile, predictionDays });

    if (!lastEntry || typeof lastEntry.weight !== 'number' || isNaN(lastEntry.weight) || !lastEntry.date || !(lastEntry.date instanceof Date) || isNaN(lastEntry.date.getTime())) {
        console.error("predictWeightLinearDifference: Invalid last entry data.");
        return [];
    }
    if (!userProfile || typeof userProfile.sex !== 'string' || !userProfile.dateOfBirth || !(userProfile.dateOfBirth instanceof Date) || isNaN(userProfile.dateOfBirth.getTime()) || typeof userProfile.height !== 'number' || isNaN(userProfile.height) || userProfile.height <= 0 || typeof userProfile.activityLevel !== 'string') {
         console.error("predictWeightLinearDifference: Invalid user profile data.");
         return [];
    }
     if (typeof targetCaloricIntake !== 'number' || isNaN(targetCaloricIntake) || targetCaloricIntake < 0) {
         console.warn("predictWeightLinearDifference: Invalid target caloric intake. Prediction may be inaccurate or empty.");
         // We might still attempt prediction if other data is valid, but log a warning
     }
    if (typeof predictionDays !== 'number' || isNaN(predictionDays) || predictionDays <= 0) {
        console.warn("predictWeightLinearDifference: Invalid prediction days. Returning empty prediction.");
        return [];
    }

    // Convert last entry weight to kg if necessary
    let W0_kg = lastEntry.weight;
    if (lastEntry.weightUnit === 'lbs') {
        W0_kg = lastEntry.weight * 0.453592;
    }

    const age = calculateAge(userProfile.dateOfBirth);
    const heightInCm = userProfile.height * 2.54;
    const activityFactor = activityMultipliers[userProfile.activityLevel];

    // Calculate the constant 'c' (non-weight part of Mifflin-St Jeor)
    let c = (6.25 * heightInCm) - (5 * age);
    if (userProfile.sex === 'male') {
        c += 5;
    } else if (userProfile.sex === 'female') {
        c -= 161;
    } else {
        console.error("predictWeightLinearDifference: Cannot calculate constant 'c' due to invalid sex.");
        return [];
    }

    // Calculate the constant 'r'
    // r = 1 - m * (10 * 0.453592) / 3500
    const r = 1 - (activityFactor * (10 * 0.453592) / 3500);

    // Calculate the constant 'b'
    // b = (I - m * c) / 3500
    const I = targetCaloricIntake;  // Use the calculated target caloric intake
    const b = (I - (activityFactor * c)) / 3500;

    console.log('predictWeightLinearDifference: Calculated constants:', { r, b, c, I, activityFactor, W0_kg });

    // Calculate the equilibrium weight W_infinity = b / (1 - r)
    let W_infinity_kg = NaN;
    if (1 - r !== 0) {
        W_infinity_kg = b / (1 - r);
    }
    console.log('predictWeightLinearDifference: Calculated equilibrium weight (kg):', W_infinity_kg);

    // Calculate the last recorded lean body mass in kg
    const lastWeightKg = W0_kg; // Last weight in kg
    const lastBodyFatPercentage = lastEntry.bodyFat; // Last body fat percentage
    const lastFatMassKg = lastWeightKg * (lastBodyFatPercentage / 100);
    const lastLeanBodyMassKg = lastWeightKg - lastFatMassKg;

    console.log('predictWeightLinearDifference: Last Lean Body Mass (kg):', lastLeanBodyMassKg);
    
    // Calculate prediction points using the explicit solution: W(t) = W_infinity + (W0 - W_infinity) * r^t
    // t represents the number of days *after* the last entry date
    const predictionPoints = [];
    const lastEntryTimestamp = lastEntry.date.getTime();

    predictionPoints.push({
        x: lastEntryTimestamp,
        y: lastEntry.weight,
        bodyFat: lastEntry.bodyFat
    });

    for (let t = 1; t <= predictionDays; t++) {
        const futureDate = addDays(lastEntry.date, t);
        const futureTimestamp = futureDate.getTime();

        // Calculate the predicted weight in kg for day t
        let Wt_kg;
        if (!isNaN(W_infinity_kg)) {
            Wt_kg = W_infinity_kg + (W0_kg - W_infinity_kg) * Math.pow(r, t);
        }

        // Convert the predicted weight back to the last entry's original unit for consistency with other chart data
        let Wt_display = Wt_kg;
        if (lastEntry.weightUnit === 'lbs') {
            Wt_display = Wt_kg * 2.20462;
        }

        // Simple linear interpolation for body fat percentage change over time
        // This is a simplification; a more complex model would be needed for accurate BF% prediction
        // Assuming a linear change from the last recorded BF% towards a target BF% (e.g., ~15% for men, ~20% for women)
        // Or, a simple linear decrease/increase based on weight change
        // Let's use a simple linear change towards a hypothetical target BF% over the prediction period
        const lastBodyFat = lastEntry.bodyFat;
        const targetBodyFat = userProfile.sex === 'male' ? 15 : 20; // Hypothetical target BF%
        const bfChangePerDay = (targetBodyFat - lastBodyFat) / predictionDays;  // Rate of change per day

        let predictedBodyFat = lastBodyFat + (bfChangePerDay * t);
        if (!isNaN(Wt_kg) && Wt_kg > 0 && !isNaN(lastLeanBodyMassKg)) {
            // Ensure predicted weight is not less than lean body mass to avoid negative fat mass
            const predictedFatMassKg = Math.max(0, Wt_kg - lastLeanBodyMassKg);
            predictedBodyFat = (predictedFatMassKg / Wt_kg) * 100;

            // Ensure predicted body fat stays within a reasonable range (e.g., 5% to 40%)
            predictedBodyFat = Math.max(5, Math.min(40, predictedBodyFat));
        }

        if (!isNaN(Wt_display)) {
            predictionPoints.push({
                x: futureTimestamp,
                y: Wt_display,
                bodyFat: predictedBodyFat
            });
        }
    }

    console.log('predictWeightLinearDifference: Generated predictionPoints:', predictionPoints);
    return predictionPoints;
}

// Placeholder for predictWeightCalorieModel (will be replaced by linear difference model)
// Keeping it here for now to avoid breaking the BodyMetricsDashboard component before the update
export const predictWeightCalorieModel = ({ lastEntry, targetCaloricIntake, userProfile, predictionDays = 90 }) => {
    console.warn("Using placeholder predictWeightCalorieModel. Please update to use predictWeightLinearDifference.");
    // Return an empty array or some dummy data if needed
    return [];
};

