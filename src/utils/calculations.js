// src/utils/calculations.js
import { addDays } from 'date-fns';

/**
 * Calculates the Basal Metabolic Rate (BMR) using the Mifflin-St Jeor equation.
 * BMR is the number of calories required to keep your body functioning at rest.
 * 
 * @param {object} params - Parameters for calculation
 * @param {'male' | 'female'} params.sex - The sex of the individual
 * @param {number} params.weight - The weight in kilograms
 * @param {number} params.height - The height in centimeters
 * @param {number} params.age - The age in years
 * @returns {number} The Basal Metabolic Rate (BMR) in calories per day
 */
export const calculateBmr = ({ sex, weight, height, age }) => {
    // Validate inputs
    if (typeof weight !== 'number' || weight <= 0 ||
        typeof height !== 'number' || height <= 0 ||
        typeof age !== 'number' || age <= 0 ||
        (sex !== 'male' && sex !== 'female')) {
            console.error('Invalid input for BMR calculation:', { sex, weight, height, age });
            return NaN; // Return Not-a-Number for invalid input
    }

    let bmr;
    if (sex === 'male') {
        // Mifflin-St Jeor equation for men: (10 * weight in kg) + (6.25 * height in cm) - (5 * age in years) + 5
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {    // sex === 'female'
        // Mifflin-St Jeor equation for women: (10 * weight in kg) + (6.25 * height in cm) - (5 * age in years) - 161
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }
    
    return bmr;
};

/**
 * Calculates the Total Daily Energy Expenditure (TDEE) based on BMR and activity level.
 * TDEE is an estimate of how many calories you burn per day.
 * 
 * Activity Level Multipliers:
 * - sedentary: 1.2 (little to no exercise)
 * - lightly_active: 1.375 (exercises 1-3 days/week)
 * - moderately_active: 1.55 (exercises 4-5 days/week)
 * - very_active: 1.725 (exercises 6-7 days/week)
 * - super_active: 1.9 (very intense exercise daily or phsyically demanding job)
 * 
 * @param { number } bmr - The Basal Metabolic Rate in calories per day
 * @param {'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'super_active'} activityLevel - The activity level of the individual
 * @returns {number} The calculated TDEE in calories per day
 */
export const calculateTdee = (bmr, activityLevel) => {
    // Validate inputs
    if (typeof bmr !== 'number' || isNaN(bmr) || bmr <= 0 || typeof activityLevel !== 'string' || activityLevel === '') {
        console.error('Invalid input for TDEE calculation:', { bmr, activityLevel });
        return NaN; // Return Not-a-Number for invalid input
    }

    let multiplier;
    switch (activityLevel) {
        case 'sedentary':
            multiplier = 1.2;
            break;
        case 'lightly_active':
            multiplier = 1.375;
            break;
        case 'moderately_active':
            multiplier = 1.55;
            break;
        case 'very_active':
            multiplier = 1.725;
            break;
        case 'super_active':
            multiplier = 1.9;
            break;
        default:
            console.error('Unknown activity level for TDEE calculation:', activityLevel);
            return NaN; // Return Not-a-Number for invalid input
    }

    return bmr * multiplier;
};

/**
 * Calculates points for a simple linear regression trend line
 * @param {Array<x: number, y: number>} datapoints - Array of data points with x (timestamp) and y (value).
 * @returns {Array<x: number, y: number>} Array of two points representing the start and end of the trend line.
 */
export const calculateLinearRegression = (dataPoints) => {
    if (dataPoints.length < 2) {
        return [];  // Need at least two points for a line
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
        return [];  // Avoid division by zero if all x values are the same
    }
    const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const b = (sumY - m * sumX) / n;

    // Calculate the y values for the trend line at the min and max x values
    const minX = validPoints[0].x;
    const maxX = validPoints[validPoints.length - 1].x;

    const trendLinePoints = [
        { x: minX, y: m * minX + b },
        { x: maxX, y: m * maxX + b },
    ];

    return trendLinePoints;
}

/**
 * Calculates prediction points using Double Exponential Smoothing (Holt's Method).
 * Predicts dynamically until a target weight is reached or a maximum prediction duration is met.
 * @param {Array<{x: number, y: number}>} dataPoints - Array of historical data points with x (timestamp) and y (value).
 * @param {number} alpha - Smoothing factor for the level (0 to 1).
 * @param {number} beta - Smoothing factor for the trend (0 to 1).
 * @param {number} targetValue - The weight at which to stop predicting.
 * @returns {Array<{x: number, y: number}>} Array of prediction points including the last historical point.
 */
export const calculateDoubleExponentialSmoothing = (dataPoints, alpha, beta, targetValue = null) => {
    if (dataPoints.length < 2 || alpha < 0 || alpha > 1 || beta < 0 || beta > 1) {
        // Need at least two points for initial trend, and valid alpha/beta
        return [];
    }

    // Filter and sort valid points
    const validPoints = dataPoints.filter(p => typeof p.x === 'number' && !isNaN(p.x) && typeof p.y === 'number' && !isNaN(p.y));
    if (validPoints.length < 2) {
        return []; // Need at least two points for initial level and trend
    }
    validPoints.sort((a, b) => a.x - b.x);


    // Initialize Level (L) and Trend (T)
    // Initial Level: Use the first data point's y-value
    let L = validPoints[0].y;
    // Initial Trend: Use the difference between the first two points
    let T = validPoints[1].y - validPoints[0].y; // Assuming equally spaced points for simplicity

    const predictedPoints = [];

    // Calculate smoothed values for historical data and store them for prediction
    // Start from the second point as the first is used for initialization
    for (let i = 1; i < validPoints.length; i++) {
        const previousL = L;
        const previousT = T;

        // Calculate new Level
        L = alpha * validPoints[i].y + (1 - alpha) * (previousL + previousT);

        // Calculate new Trend
        T = beta * (L - previousL) + (1 - beta) * previousT;
    }

    // Predict future points
    const lastHistoricalPoint = validPoints[validPoints.length - 1];
    const lastHistoricalTimestamp = lastHistoricalPoint.x;
    const lastHistoricalValue = lastHistoricalPoint.y; // Use the actual last value for the start of prediction line

    // Add the last historical point to the prediction array to connect the lines
    predictedPoints.push({
        x: lastHistoricalTimestamp,
        y: lastHistoricalValue
    });

    // Determine the time step for prediction (assuming daily entries for simplicity)
    // Calculate the average time difference between historical points
    let totalTimeDiff = 0;
    for (let i = 1; i < validPoints.length; i++) {
        totalTimeDiff += validPoints[i].x - validPoints[i-1].x;
    }
    const averageTimeStep = validPoints.length > 1 ? totalTimeDiff / (validPoints.length - 1) : 24 * 60 * 60 * 1000; // Default to 1 day in milliseconds if only 1 point


    // Predict future points
    const numFuturePoints = 30; // Predict 30 days into the future
    let currentTimestamp = lastHistoricalTimestamp;
    let currentL = L;
    let currentT = T;

    for (let i = 1; i <= numFuturePoints; i++) {
        currentTimestamp += averageTimeStep; // Move forward by the average time step

        // Predict the next value
        let predictedValue = currentL + currentT;

        // Optional: Adjust prediction towards a target value over time
        if (targetValue !== null && typeof targetValue === 'number' && !isNaN(targetValue)) {
            // Simple adjustment: gradually move prediction towards the target
            // The strength of this adjustment could be a separate parameter or based on distance
            const adjustmentFactor = 0.1; // Adjust by 10% of the difference each step
            predictedValue = predictedValue + (targetValue - predictedValue) * adjustmentFactor;
        }


        predictedPoints.push({
            x: currentTimestamp, // Use the calculated future timestamp
            y: predictedValue // The predicted value
        });

        // Update L and T for the next prediction step (using the predicted value as the "actual" for the next step)
        // This is a simplification; a more complex model would use the actual future values if available,
        // but for pure prediction, we use the forecast as the basis for the next forecast.
        currentL = alpha * predictedValue + (1 - alpha) * (currentL + currentT);
        currentT = beta * (currentL - L) + (1 - beta) * currentT; // L here is the L from the previous step
        L = currentL; // Update L for the next iteration's trend calculation

    }

    return predictedPoints;
};