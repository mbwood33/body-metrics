// src/utils/calculations.js
import { addDays } from 'date-fns';

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
 * @param {number} targetWeight - The weight at which to stop predicting.
 * @returns {Array<{x: number, y: number}>} Array of prediction points including the last historical point.
 */
export const calculateDoubleExponentialSmoothing = (dataPoints, alpha, beta, targetWeight) => {
    console.log('calculateDoubleExponentialSmoothing: Input dataPoints', dataPoints);
    console.log('calculateDoubleExponentialSmoothing: Input alpha', alpha);
    console.log('calculateDoubleExponentialSmoothing: Input beta', beta);
    console.log('calculateDoubleExponentialSmoothing: Input targetWeight', targetWeight);


    // Filter and sort valid points
    const validPoints = dataPoints.filter(p => typeof p.x === 'number' && !isNaN(p.x) && typeof p.y === 'number' && !isNaN(p.y));
    if (validPoints.length < 2) {
        console.log('calculateDoubleExponentialSmoothing: Need at least 2 valid points for Double ES.');
        return []; // Need at least two points for initial level and trend
    }
    validPoints.sort((a, b) => a.x - b.x);

    console.log('calculateDoubleExponentialSmoothing: Valid points after filtering and sorting', validPoints);

    // Initialize Level (L) and Trend (T)
    // A common initialization for Holt's method
    let Lt = validPoints[0].y; // Initial Level is the first data point's value
    let Tt = 0; // Initial Trend is often initialized to 0 or the slope between the first two points

    if (validPoints.length > 1) {
        // Initialize trend using the slope between the first two points
        const timeDiff = validPoints[1].x - validPoints[0].x;
        if (timeDiff > 0) {
            Tt = (validPoints[1].y - validPoints[0].y) / (timeDiff / (1000 * 60 * 60 * 24)); // Trend per day
        }
    }


    const predictionPoints = [];
    // Add the last historical point to the prediction line for continuity
    predictionPoints.push({
        x: validPoints[validPoints.length - 1].x,
        y: validPoints[validPoints.length - 1].y
    });


    // Calculate smoothed values for historical data and update L and T
    for (let i = 1; i < validPoints.length; i++) {
        const prevLt = Lt;
        const timeDiff = (validPoints[i].x - validPoints[i-1].x) / (1000 * 60 * 60 * 24); // Time difference in days

        // Holt's method update equations
        Lt = alpha * validPoints[i].y + (1 - alpha) * (prevLt + Tt * timeDiff);
        Tt = beta * (Lt - prevLt) + (1 - beta) * Tt;

        console.log(`calculateDoubleExponentialSmoothing: Point ${i}, Lt: ${Lt.toFixed(2)}, Tt: ${Tt.toFixed(2)}`);
    }

    // Predict future points dynamically until target weight is reached
    let lastPredictedDate = new Date(validPoints[validPoints.length - 1].x);
    let predictedWeight = Lt; // Start prediction from the last calculated level
    let stepsIntoFuture = 1; // Start predicting one day ahead

    const maxPredictionDays = 365 * 5; // Safeguard: Don't predict more than 5 years

    while (predictedWeight > targetWeight && stepsIntoFuture <= maxPredictionDays) {
        // Forecast using the last calculated Level and Trend
        predictedWeight = Lt + Tt * stepsIntoFuture;

        // Ensure predicted weight doesn't go below a hard minimum (e.g., 0)
        predictedWeight = Math.max(predictedWeight, 0);

        const futureDate = addDays(lastPredictedDate, stepsIntoFuture);

        predictionPoints.push({
            x: futureDate.getTime(),
            y: predictedWeight
        });

        console.log(`calculateDoubleExponentialSmoothing: Predicted point ${stepsIntoFuture}, Date: ${futureDate.toLocaleDateString()}, Weight: ${predictedWeight.toFixed(1)}`);

        // If the predicted weight is now at or below the target, stop.
        if (predictedWeight <= targetWeight) {
             console.log(`calculateDoubleExponentialSmoothing: Target weight (${targetWeight.toFixed(1)}) reached or surpassed at step ${stepsIntoFuture}. Stopping prediction.`);
            break;
        }

        stepsIntoFuture++;
    }

    // If the loop finished without reaching the target (due to maxPredictionDays),
    // add a final point at the max prediction date with the last predicted weight.
    if (stepsIntoFuture > maxPredictionDays) {
        console.log(`calculateDoubleExponentialSmoothing: Max prediction days (${maxPredictionDays}) reached.`);
        // The last point added in the loop is already at the max prediction date or earlier if target was met.
        // If the loop completed because maxPredictionDays was reached *before* target,
        // the last point in predictionPoints is the final point.
    }


    console.log('calculateDoubleExponentialSmoothing: Final predictionPoints', predictionPoints);
    return predictionPoints;
};