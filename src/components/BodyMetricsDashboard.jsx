// src/components/BodyMetricsDashboard.jsx
import React, { useRef, useState, useEffect, useCallback } from 'react';

// import { db } from '../firebase';
// import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';

import { useAuth } from '../AuthContext.jsx';

// Import functions from the service file
import {
    fetchBodyMetricsEntries,
    addBodyMetricsEntry,
    updateBodyMetricsEntry,
    deleteBodyMetricsEntry
} from '../services/bodyMetricsService.js';

// Import the custom hook for CSV import
import useCsvImport from '../hooks/useCsvImport.js';

// import { Line } from 'react-chartjs-2';
// import {
//     Chart as ChartJS,
//     CategoryScale,
//     LinearScale,
//     PointElement,
//     LineElement,
//     Title,
//     Tooltip,
//     Legend,
//     TimeScale
// } from 'chart.js';

// // Import date adapter for Chart.js time scale
// import 'chartjs-adapter-date-fns';

// ChartJS.register(
//     CategoryScale,
//     LinearScale,
//     PointElement,
//     LineElement,
//     Title,
//     Tooltip,
//     Legend,
//     TimeScale
// );

import Plot from 'react-plotly.js';

// import Papa from 'papaparse';
import { addDays } from 'date-fns';

// Helper function to get today's date inYYYY-MM-DD format
const getTodaysDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper function for simple linear regression to calculate trend line points
// Takes an array of { x: number, y: number } points (x is timestamp)
// Returns an array of { x: number, y: number } points for the trend line
const calculateLinearRegression = (dataPoints) => {
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

/// Helper function for Double Exponential Smoothing (Holt's Method) prediction
// Takes an array of { x: number, y: number } points (x is timestamp, y is value)
// alpha: smoothing factor for level (0 to 1)
// beta: smoothing factor for trend (0 to 1)
// targetWeight: the weight at which to stop predicting (e.g., 5% body fat weight)
// Returns an array of { x: number, y: number } points for the prediction
const calculateDoubleExponentialSmoothing = (dataPoints, alpha, beta, targetWeight) => {
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



const BodyMetricsDashboard = () => {
    // Refs for the new entry form
    const dateRef = useRef();
    const weightRef = useRef();
    const bodyFatRef = useRef();

    // State for the new entry form and saving process
    const [weightUnit, setWeightUnit] = useState('lbs');
    const [saveError, setSaveError] = useState(''); // Use specific state for save errors
    const [saveLoading, setSaveLoading] = useState(false); // Use specific state for save loading
    const [saveMessage, setSaveMessage] = useState(''); // Use specific state for save success message

    // State for fetching and displaying historical entries
    const [entries, setEntries] = useState([]); // State for fetched entries
    const [fetchLoading, setFetchLoading] = useState(true); // State for fetch loading
    const [fetchError, setFetchError] = useState(''); // State for fetch errors

    // State for editing entries
    const [isEditing, setIsEditing] = useState(false);  // Initially not editing
    const [editingEntryId, setEditingEntryId] = useState(null); // No entry is being edited initially
    const [editFormData, setEditFormData] = useState(null); // No form data yet
    const [editError, setEditError] = useState(''); // State for edit form errors
    const [editMessage, setEditMessage] = useState(''); // State for edit form success message

    // State for Double Exponential Smoothing Prediction settings
    // These remain in the component as they are UI-related settings for the chart
    const [alpha, setAlpha] = useState(0.5); // Default alpha value for level smoothing
    const [beta, setBeta] = useState(0.3); // Default beta value for trend smoothing
    // predictionDays state is no longer needed for the prediction duration,
    // but we could keep it for a separate prediction forecast (e.g., "forecast for next X days")
    // For now, we'll remove it as the prediction is dynamic based on target weight.
    // const [predictionDays, setPredictionDays] = useState(30);


    const { currentUser } = useAuth();


    // Function to fetch historical entries using the service
    const handleFetchEntries = useCallback(async () => {
        if (!currentUser) {
            setEntries([]);
            setFetchLoading(false);
            setFetchError('');
            console.log('Fetch Entries: No user, clearing entries.');
            return;
        }

        setFetchLoading(true);
        setFetchError('');

        try {
            // Call the service function to fetch entries
            const fetchedEntries = await fetchBodyMetricsEntries(currentUser.uid);
            setEntries(fetchedEntries);
            setFetchLoading(false);
        } catch (error) {
            console.error('Fetch Entries Error: ', error);
            setFetchError(error.message); // Use the error message from the service
            setFetchLoading(false);
        }
    }, [currentUser]); // Dependency array for useCallback



    // --- Use the custom hook for CSV import ---
    // Pass the current user's ID and the handleFetchEntries callback to the hook
    const {
        selectedFile,
        parsedCsvData,
        csvHeaders,
        columnMapping,
        importError,
        importMessage,
        isParsing,
        setColumnMapping,
        handleFileSelect,
        handleConfirmMapping,
        handleImportCsv,
        clearImportState,
    } = useCsvImport(currentUser?.uid, handleFetchEntries);
  


    // Effect hook to fetch entries when the component mounts or currentUser changes
    useEffect(() => {
        handleFetchEntries(); // Call the wrapped fetch function
    }, [handleFetchEntries]); // handleFetchEntries is a dependency



    /**
     * Function to handle submission of the new entry form
     */
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Basic client-side validation
        if (!weightRef.current.value || !bodyFatRef.current.value || !dateRef.current.value) {
            setSaveError('Please fill in all fields.');
            setSaveMessage(''); // Clear success message if there's an error
            return;
        }

        const weight = parseFloat(weightRef.current.value);
        const bodyFat = parseFloat(bodyFatRef.current.value);

        if (isNaN(weight) || isNaN(bodyFat)) {
            setSaveError('Weight and Body Fat must be numbers.');
            setSaveMessage('');
            return;
        }
        if (bodyFat < 0 || bodyFat > 100) {
            setSaveError('Body Fat Percentage (%) must be between 0 and 100.');
            setSaveMessage('');
            return;
        }

        setSaveError('');
        setSaveMessage('');
        setSaveLoading(true);        

        try {
            const dateString = dateRef.current.value;
            // Convert the date string "YYYY-MM-DD" to a Date object for Firestore Timestamp
            const [year, month, day] = dateString.split('-').map(Number);
            const date = new Date(year, month - 1, day); // Month is 0-indexed in JS Date

            const entryData = {
                date: date, // Save as Date object
                weight: weight,
                bodyFat: bodyFat,
                weightUnit: weightUnit, // Save the unit used for this entry
            };

            // Call the service function to add the entry
            await addBodyMetricsEntry(currentUser.uid, entryData);

            setSaveMessage('Entry added successfully!');
            console.log('Save Entry: Successful.');

            // Clear the form fields after successful submission
            dateRef.current.value = getTodaysDate(); // Reset date field to today's date
            weightRef.current.value = '';
            bodyFatRef.current.value = '';

            // Re-fetch entries to update the table and graph
            handleFetchEntries(); // Use the wrapped fetch function

        } catch (error) {
            setSaveError(error.message); // Use the error message from the service
            console.error('Save Entry Error: ', error);
            setSaveMessage(''); // Clear success message if there's an error
        }

        setSaveLoading(false);
    };



    /**
     * Function to handle clicking the Edit button
     * @param {Object} entry - The entry object to be edited
     */
    const handleEditClick = (entry) => {
        setIsEditing(true); // Set the state to indicate we are now editing
        setEditingEntryId(entry.id); // Store the ID of the entry to be updated

        // Prepare the data to populate the edit form
        // The date needs to be formatted asYYYY-MM-DD for the date input field
        const formattedDate = entry.date instanceof Date && !isNaN(entry.date.getTime())
            ? entry.date.toISOString().split('T')[0]    // Get theYYYY-MM-DD part
            : getTodaysDate();  // Fallback in case of an invalid date (shouldn't happen, but good practice)

        const initialEditData = {
            date: formattedDate,
            weight: typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight),
            bodyFat: typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat),
            weightUnit: entry.weightUnit, // Keep the original unit for context/display in the form
        };

        setEditFormData(initialEditData); // Set the edit form data state

        console.log('handleEditClick: Prepared initial editFormData', initialEditData);
        // Clear edit messages/errors when opening the form
        setEditError('');
        setEditMessage('');
    };



    /**
     * Function to handle input changes within the edit form
     * @param {Object} e - The event object
     */
    const handleEditInputChange = (e) => {
        const { name, value } = e.target;

        // --- Console logs for debugging input changes ---
        console.log('handleEditInputChange: Input changed:', { name, value, eventType: e.type });
        // Note: Accessing editFormData here directly might show the old value; use functional update below
        // console.log('handleEditInputChange: Current editFormData BEFORE update:', editFormData);
        // --- End logging ---

        // Use functional state update for reliability, especially with multiple rapid changes
        setEditFormData(prevFormData => {
            // --- Console logs for debugging state updates ---
            console.log('handleEditInputChange: Previous editFormData (inside functional update):', prevFormData);
            const updatedData = {
                ...prevFormData, // Spread the previous state data
                [name]: value, // Update the specific field [name] with the new value
            };
            console.log('handleEditInputChange: Updated editFormData (inside functional update):', updatedData);
            // --- End logging ---
            return updatedData; // Return the new state object
        });

    };



    // Function to handle updating an entry in Firestore using the service
    const handleUpdateEntry = async (e) => {
        e.preventDefault(); // Prevent the default form submission and page reload

        // Clear previous messages and errors related to editing
        setEditError('');
        setEditMessage('');
        // Optional: Set a loading state for the save button if you added one

        // Basic validation
        // Check if the current user is logged in and if we have an ID for the entry being edited
        if (!currentUser || !editingEntryId) {
            setEditError('Cannot update entry: user not logged in or entry ID missing.');
            console.error('Update Entry Error: User or Entry ID missing.');
            return;
        }

        // Get the data from the edit form state and validate it
        const weight = parseFloat(editFormData?.weight);
        const bodyFat = parseFloat(editFormData?.bodyFat);
        const dateString = editFormData?.date; // Get the date string from form data

        // Check if essential fields are filled and numbers are valid
        if (!dateString || isNaN(weight) || isNaN(bodyFat)) {
            setEditError('Please fill in all fields with valid numbers.');
            // Note: Validation could be more specific (e.g., date format)
            return;
        }
        // Validate body fat percentage range
        if (bodyFat < 0 || bodyFat > 100) {
            setEditError('Body Fat Percentage must be between 0 and 100.');
            return;
        }

        try {
            // Prepare the updated data object
            // Convert the date string from the form ("YYYY-MM-DD") back into a Date object for Firestore
            const [year, month, day] = dateString.split('-').map(Number);
            // Note: Month is 0-indexed in JavaScript Date objects, so subtract 1
            const updatedDate = new Date(year, month - 1, day);

            const updatedData = {
                date: updatedDate, // Save the converted Date object
                weight: weight,    // Save the parsed number for weight
                bodyFat: bodyFat,  // Save the parsed number for body fat
                // We are not allowing changing weightUnit in the edit form currently, so do NOT include it here in the update.
                // Do NOT update 'createdAt' - it should reflect the original creation timestamp.
            };

            // Call the service function to update the entry
            await updateBodyMetricsEntry(currentUser.uid, editingEntryId, updatedData);

            // Handle successful update
            setEditMessage('Entry updated successfully!');
            console.log(`Update Entry: Successfully updated entry with ID: ${editingEntryId}`);

            // Re-fetch all entries to ensure the table and graph display the updated data
            // This is important to show the updated entry in the list and recalculate the chart data
            handleFetchEntries(); // Use the wrapped fetch function

            // Exit editing mode after a short delay to allow the user to see the success message
            setTimeout(() => {
                setIsEditing(false); // Set isEditing back to false
                setEditingEntryId(null); // Clear the ID of the entry that was being edited
                setEditFormData(null); // Clear the data from the edit form state
                setEditMessage(''); // Clear the success message after returning to the list view
                setEditError(''); // Also clear any leftover error message
            }, 1500); // Hide the edit form and messages after 1.5 seconds


        } catch (error) {
            // Handle errors during the update process
            setEditError(error.message); // Use the error message from the service
            console.error('Update Entry Error: ', error);
            setEditMessage(''); // Clear success message if there was an error
        }
        // Optional: Reset loading state here if you added one
    };



    // Function to handle entry deletion using the service
    const handleDeleteEntry = async (entryId) => {
        if (!currentUser || !entryId) {
            console.error('Delete Entry: No user or entry ID provided.');
            return;
        }

        // Optional confirm using browser's built-in confirm dialog
        if (window.confirm('Are you sure you want to delete this entry?')) {
            try {
                // Call the service function to delete the entry
                await deleteBodyMetricsEntry(currentUser.uid, entryId);

                console.log(`Delete Entry: Successfully deleted entry with ID: ${entryId}`);

                // Re-fetch entries after successful delete to update the display
                handleFetchEntries(); // Use the wrapped fetch function

            } catch (error) {
                console.error('Delete Entry Error: ', error);
                // Optional: You might want to add some state to display a delete error message
                setFetchError(error.message); // Use the error message from the service
            }
        }
    };



    // --- Prepare data for the chart ---
    // This logic runs every time the component renders, which is fine as it depends on the state (entries, weightUnit)

    // Filter out entries with invalid dates or values before preparing chart data
    const validEntries = entries.filter(entry =>
        entry.date instanceof Date && !isNaN(entry.date.getTime()) &&
        typeof entry.weight === 'number' && !isNaN(entry.weight) &&
        typeof entry.bodyFat === 'number' && !isNaN(entry.bodyFat)
    );

    // Sort valid entries by date
    validEntries.sort((a, b) => a.date.getTime() - b.date.getTime());


    // Calculate min and max timestamps from valid entries for chart axis manually
    let minTimestamp = Date.now();
    let maxTimestamp = 0;

    if (validEntries.length > 0) {
        minTimestamp = validEntries[0].date.getTime();
        maxTimestamp = validEntries[validEntries.length - 1].date.getTime();
    } else {
        minTimestamp = Date.now();
        maxTimestamp = Date.now();
    }

    // Calculate Lean Body Mass from the most recent entry for target weight calculation
    let targetWeight = null;
    let lastPredictedTimestamp = maxTimestamp; // Initialize with the last historical timestamp


    // --- Prepare data in Plotly format ---
    // Plotly expects an array of trace objects
    const plotlyData = [
        {
            // Weight trace
            x: validEntries.map(entry => entry.date), // Use Date objects directly for Plotly time series
            y: validEntries.map(entry => {
                let weightValue = entry.weight;
                // Apply conversion only if the entry's stored unit is different from the current state unit
                if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                    if (weightUnit === 'lbs') {
                         weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                    } else if (weightUnit === 'kg') {
                         weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                    }
                }
                return parseFloat(weightValue.toFixed(1));
            }),
            mode: 'lines+markers', // Show both lines and markers
            name: `Weight (${weightUnit})`,
            line: { color: 'rgb(75, 192, 192)' },
            marker: { size: 8 },
            type: 'scatter', // Scatter plot type for lines and markers
        },
        {
            // Fat Mass trace
            x: validEntries.map(entry => entry.date),
            y: validEntries.map(entry => {
                const weight = entry.weight;
                const bodyFatPercentage = entry.bodyFat;
                let fatMass = (weight * (bodyFatPercentage / 100));

                if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                    if (weightUnit === 'lbs') {
                        fatMass = entry.weightUnit === 'kg' ? fatMass * 2.20462 : fatMass;
                    } else if (weightUnit === 'kg') {
                        fatMass = entry.weightUnit === 'lbs' ? fatMass * 0.453592 : fatMass;
                    }
                }
                return parseFloat(fatMass.toFixed(1));
            }),
            mode: 'lines+markers',
            name: `Fat Mass (${weightUnit})`,
            line: { color: 'rgb(255, 99, 132)' }, // Reddish
            marker: { size: 8 },
            type: 'scatter',
        },
        {
            // Lean Mass trace
            x: validEntries.map(entry => entry.date),
            y: validEntries.map(entry => {
                const weight = entry.weight;
                const bodyFatPercentage = entry.bodyFat;
                let leanMass = (weight - (weight * (bodyFatPercentage / 100)));

                if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                    if (weightUnit === 'lbs') {
                        leanMass = entry.weightUnit === 'kg' ? leanMass * 2.20462 : leanMass;
                    } else if (weightUnit === 'kg') {
                        leanMass = entry.weightUnit === 'lbs' ? leanMass * 0.453592 : leanMass;
                    }
                }
                return parseFloat(leanMass.toFixed(1));
            }),
            mode: 'lines+markers',
            name: `Lean Mass (${weightUnit})`,
            line: { color: 'rgb(53, 162, 235)' }, // Bluish
            marker: { size: 8 },
            type: 'scatter',
        },
        {
            // Linear Regression Trend Line trace
            x: calculateLinearRegression(
                validEntries.map(entry => {
                    let weightValue = entry.weight;
                    // Convert weight to the *current display unit* before using in trend calculation
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                        } else if (entry.weightUnit === 'kg') {
                            weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                        }
                    }
                    return { x: entry.date.getTime(), y: weightValue };
                })
            ).map(point => new Date(point.x)), // Convert timestamps back to Date objects for Plotly
            y: calculateLinearRegression(
                validEntries.map(entry => {
                    let weightValue = entry.weight;
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                        } else if (entry.weightUnit === 'kg') {
                            weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                        }
                    }
                    return { x: entry.date.getTime(), y: weightValue };
                })
            ).map(point => parseFloat(point.y.toFixed(1))), // Map y values and format
            mode: 'lines',
            name: `Weight Trend (Linear)`,
            line: { color: 'rgb(0, 0, 0)', dash: 'dash' }, // Black dashed line
            type: 'scatter',
        },
        // ES Prediction trace will be added conditionally below
    ];

    if (validEntries.length > 0) {
        const lastEntry = validEntries[validEntries.length - 1];
        const lastWeight = lastEntry.weight;
        const lastBodyFatPercentage = lastEntry.bodyFat;

        // Calculate Lean Body Mass based on the last entry's data
        const leanBodyMass = lastWeight * (1 - (lastBodyFatPercentage / 100));

        // Calculate the target weight for 5% body fat
        // Target Weight = Lean Body Mass / (1 - Target Body Fat Percentage)
        const targetBodyFatPercentage = 5; // 5%
        targetWeight = leanBodyMass / (1 - (targetBodyFatPercentage / 100));

        console.log(`Calculated Lean Body Mass (from last entry): ${leanBodyMass.toFixed(1)} ${weightUnit}`);
        console.log(`Calculated Target Weight (for 5% Body Fat): ${targetWeight.toFixed(1)} ${weightUnit}`);

        // Calculate Double Exponential Smoothing prediction points
        const esPredictionPoints = calculateDoubleExponentialSmoothing(
            validEntries.map(entry => {
                let weightValue = entry.weight;
                // Convert weight to the *current display unit* before using in prediction calculation
                if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                    if (weightUnit === 'lbs') {
                        weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                    } else if (entry.weightUnit === 'kg') {
                        weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                    }
                }
                return { x: entry.date.getTime(), y: weightValue };
            }),
            alpha,
            beta,
            targetWeight // Pass the calculated target weight
        );

        // Update lastPredictedTimestamp based on the last point in the prediction
        if (esPredictionPoints.length > 0) {
            lastPredictedTimestamp = esPredictionPoints[esPredictionPoints.length - 1].x;
        }

        // Add the ES prediction trace to plotlyData
        const esTrace = {
            x: esPredictionPoints.map(point => new Date(point.x)), // Convert timestamps to Date objects for Plotly
            y: esPredictionPoints.map(point => parseFloat(point.y.toFixed(1))), // Map y values and format
            mode: 'lines',
            name: `Weight Prediction (ES)`,
            line: { color: 'rgb(255, 165, 0)', dash: 'dot' }, // Orange dotted line
            type: 'scatter',
        };
        plotlyData.push(esTrace);

    } else {
        console.log('Not enough data to calculate Lean Body Mass and Target Weight for prediction.');
    }


    // --- Plotly Layout (Options) ---
    const layout = {
        title: `Body Metrics Progress and Prediction (${weightUnit})`,
        xaxis: {
            title: 'Date',
            type: 'date', // Set x-axis type to 'date'
             range: [new Date(minTimestamp), new Date(lastPredictedTimestamp)], // Set initial range to include prediction end
             rangeslider: { visible: true }, // Add a range slider for easier navigation
        },
        yaxis: {
            title: `Measurement (${weightUnit})`,
        },
        hovermode: 'closest', // Show tooltip for the closest point
        // Add dragmode for pan/zoom
        dragmode: 'pan', // 'zoom' or 'pan'
        // Optional: Add a range slider or selector for easier navigation
        // shapes, annotations, and other layout customizations can go here
        margin: {
            l: 50, // left margin
            r: 50, // right margin
            b: 80, // bottom margin (increased for range slider)
            t: 50, // top margin
            pad: 4 // padding
        },
        // Ensure responsiveness
        autosize: true,
    };


    return (
        <div>
            <h1>Body Metrics Dashboard</h1>
            <h2>Log Body Metrics</h2>

            {saveError && <p style={{ color: 'red' }}>{saveError}</p>}
            {saveMessage && <p style={{ color: 'green' }}>{saveMessage}</p>}

            {/* Form for logging new entries */}
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="date">Date:</label>
                    {/* Date input pre-filled with today's date */}
                    <input type="date" id="date" ref={dateRef} required defaultValue={getTodaysDate()} />
                </div>
                <div>
                    <label htmlFor="weight">Weight ({weightUnit}):</label>
                    {/* Weight input */}
                    <input type="number" id="weight" ref={weightRef} required step="0.1" />
                    {/* Unit toggle buttons for new entries */}
                    <button type="button" onClick={() => setWeightUnit('lbs')} disabled={weightUnit === 'lbs'}>lbs</button>
                    <button type="button" onClick={() => setWeightUnit('kg')} disabled={weightUnit === 'kg'}>kg</button>
                </div>
                <div>
                    <label htmlFor="bodyFat">Body Fat Percentage (%):</label>
                    {/* Body Fat input */}
                    <input type="number" id="bodyFat" ref={bodyFatRef} required step="0.1" />
                </div>
                {/* Submit button for the new entry form */}
                <button type="submit" disabled={saveLoading}>
                    {saveLoading ? 'Saving...' : 'Save Entry'} {/* Button text changes when saving */}
                </button>
            </form>
            
            <hr style={{ margin: '40px 0'}} />

            {/* --- Section: CSV Import --- */}
            <div className="csv-import-section"> {/* Optional class for styling */}
                <h3>Import Entries from CSV</h3>

                 {/* Display import errors or messages */}
                 {importError && <p style={{ color: 'red' }}>{importError}</p>}
                 {importMessage && <p style={{ color: 'green' }}>{importMessage}</p>}

                {/* Conditional rendering based on import process state */}

                {/* 1. Show File Input: Visible initially, or after clearing/completing an import (if no error) */}
                {(!selectedFile && !isParsing && !importError) || (parsedCsvData && columnMapping.date && columnMapping.weight && columnMapping.bodyFat && !importError) ? (
                     <input
                        type="file"
                        accept=".csv" // Accept only CSV files
                        onChange={handleFileSelect} // Call handler from the hook
                        // Disable file input while parsing or mapping is ongoing
                        disabled={isParsing || (parsedCsvData && (!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat))}
                    />
                ) : null /* Don't render file input in parsing/mapping state */}

                {/* Show file name if selected (and not parsing) */}
                {selectedFile && !isParsing && <p>Selected file: {selectedFile.name}</p>}

                {/* 2. Show Parsing Status: Visible while PapaParse is working */}
                {isParsing && <p>Parsing CSV...</p>}


                {/* 3. Show Column Mapping Form: Visible after successful parsing IF mapping is not complete */}
                {parsedCsvData && (!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat) && csvHeaders.length > 0 ? (
                    <div className="column-mapping-form"> {/* Optional class */}
                        <h4>Map CSV Columns to Data Fields</h4>
                        <p>Select which column from your CSV corresponds to each required field:</p>

                        {/* Date Column Mapping Dropdown */}
                        <div>
                            <label htmlFor="dateColumn">Date Column:</label>
                            <select
                                id="dateColumn"
                                value={columnMapping.date} // Bind value to state from hook
                                onChange={(e) => setColumnMapping({...columnMapping, date: e.target.value})} // Update state via hook
                                required
                            >
                                <option value="">-- Select Column --</option>
                                {/* Populate options with headers extracted by PapaParse */}
                                {csvHeaders.map(header => (
                                    // Use header as both key and value
                                    <option key={header} value={header}>{header}</option>
                                ))}
                            </select>
                        </div>

                        {/* Weight Column Mapping Dropdown */}
                        <div>
                            <label htmlFor="weightColumn">Weight Column:</label>
                            <select
                                id="weightColumn"
                                value={columnMapping.weight} // Bind value to state from hook
                                onChange={(e) => setColumnMapping({...columnMapping, weight: e.target.value})} // Update state via hook
                                required
                            >
                                <option value="">-- Select Column --</option>
                                {csvHeaders.map(header => (
                                    <option key={header} value={header}>{header}</option>
                                ))}
                            </select>
                        </div>

                        {/* Body Fat Column Mapping Dropdown */}
                         <div>
                            <label htmlFor="bodyFatColumn">Body Fat (%) Column:</label>
                            <select
                                id="bodyFatColumn"
                                value={columnMapping.bodyFat} // Bind value to state from hook
                                onChange={(e) => setColumnMapping({...columnMapping, bodyFat: e.target.value})} // Update state via hook
                                required
                            >
                                <option value="">-- Select Column --</option>
                                {csvHeaders.map(header => (
                                    <option key={header} value={header}>{header}</option>
                                ))}
                            </select>
                        </div>

                        {/* Unit Selection for the Data IN the CSV */}
                         <div>
                            <label htmlFor="unitType">Weight Unit in CSV:</label>
                            <select
                                id="unitType"
                                value={columnMapping.unit} // Bind to the unit part of columnMapping state from hook
                                onChange={(e) => setColumnMapping({...columnMapping, unit: e.target.value})} // Update state via hook
                                required
                            >
                                <option value="lbs">lbs</option>
                                <option value="kg">kg</option>
                            </select>
                            {/* Updated label for clarity */}
                            <small>Select the unit used for **weight** in your CSV data. Body Fat is imported as percentage (%).</small>
                        </div>

                        {/* Confirm Mapping Button - Enabled when all required columns are selected */}
                        <button onClick={handleConfirmMapping} disabled={!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat}>Confirm Mapping</button>

                        {/* Button to clear/restart the import process */}
                        <button onClick={clearImportState}>Cancel/Clear Import</button> {/* Call handler from hook */}

                    </div>
                ) : null /* Don't render mapping form otherwise */}


                {/* 4. Show Ready to Import Section: Visible after parsing is successful AND mapping is complete */}
                {parsedCsvData && columnMapping.date && columnMapping.weight && columnMapping.bodyFat ? (
                    <div className="import-ready-section"> {/* Optional class */}
                        {/* Optional: Show a summary of rows to be imported */}
                        {!importMessage.includes('Importing') && ( // Don't show count message while importing
                            <p>{parsedCsvData.length} rows parsed. Ready to import with unit: {columnMapping.unit}.</p>
                        )}

                        {/* Final Import button - Calls the function that saves to Firestore */}
                        <button onClick={handleImportCsv} /* Optional: Add loading state here */>Import Mapped Data</button> {/* Call handler from hook */}

                        {/* Buttons to go back to mapping or clear */}
                        {/* Reset mapping state directly from hook's exposed setter */}
                        <button onClick={() => setColumnMapping({ date: '', weight: '', bodyFat: '', unit: 'lbs' })}>Remap Columns</button>
                        <button onClick={clearImportState}>Cancel/Clear Import</button> {/* Call handler from hook */}
                    </div>
                ) : null /* Don't render ready section otherwise */}


                {/* Show a message if parsing is complete but no data or headers were found, and no specific error is shown */}
                {!isParsing && !parsedCsvData && selectedFile && !importError && !importMessage && (
                    <p>No valid data or headers found in CSV after parsing. Ensure your CSV has headers and data rows.</p>
                )}
            </div>
            {/* --- End CSV Parsing Section --- */}

            <hr style={{ margin: '40px 0'}} /> {/* Separator line */}

            {/* --- Conditional Rendering for Historical Data/Edit Form --- */}
            {/* Show either the Edit Form OR the Historical Data (Table and Graph) */}
            {isEditing ? (
                // --- Section to display the Edit Form ---
                <div className="edit-form-container">
                    <h3>Edit Entry (ID: {editingEntryId})</h3>
                    {/* Display edit form errors/messages */}
                    {editError && <p style={{ color: 'red' }}>{editError}</p>}
                    {editMessage && <p style={{ color: 'green' }}>{editMessage}</p>}

                    {/* Edit Form - onSubmit calls the update function */}
                    <form key={editingEntryId} onSubmit={handleUpdateEntry}>
                        <div>
                            <label htmlFor="editDate">Date:</label>
                            <input
                                type="date"
                                id="editDate"
                                name="date" // Important for the onChange handler
                                value={editFormData?.date || ''} // Bind value to editFormData state (NO QUOTES!)
                                onChange={handleEditInputChange} // Call handler when input changes
                                required
                            />
                        </div>
                        <div>
                            {/* Display the unit from the edited entry's data */}
                            <label htmlFor="editWeight">Weight ({editFormData?.weightUnit || ''}):</label>
                            <input
                                type="number"
                                id="editWeight"
                                name="weight" // Important for the onChange handler
                                value={editFormData?.weight || ''} // Bind value to editFormData state (NO QUOTES!)
                                onChange={handleEditInputChange} // Call handler when input changes
                                required
                                step="0.1"
                            />
                            {/* Note: We are not allowing changing the unit during edit for simplicity */}
                        </div>
                        <div>
                            <label htmlFor="editBodyFat">Body Fat Percentage (%):</label>
                            <input
                                type="number"
                                id="editBodyFat"
                                name="bodyFat" // Important for the onChange handler
                                value={editFormData?.bodyFat || ''} // Bind value to editFormData state (NO QUOTES!)
                                onChange={handleEditInputChange} // Call handler when input changes
                                required
                                step="0.1"
                            />
                        </div>
                        {/* Submit button for the edit form */}
                         <button type="submit" /* Optional: Add loading state here */>Save Changes</button>
                    </form>
                    {/* The Cancel button to exit edit mode */}
                    <button onClick={() => setIsEditing(false)}>Cancel</button>
                </div>
            ) : (
                // --- Section to display Historical Data (Table and Graph) ---
                // Use a React Fragment <> to group elements without adding an extra DOM node
                <>
                    {/* Section to display historical data table */}
                    <h3>Historical Entries</h3>
                    {/* Show loading, error, or empty state messages for fetch */}
                    {fetchLoading && <p>Loading entries...</p>}
                    {fetchError && <p style={{ color: 'red' }}>{fetchError}</p>}
                     {/* Only show "No entries" if not loading/error, list is empty, AND we are NOT editing */}
                    {!fetchLoading && !fetchError && entries.length === 0 && <p>No entries logged yet.</p>}

                    {/* Display table if conditions met */}
                    {!fetchLoading && !fetchError && entries.length > 0 && (
                        <table className="historical-entries-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Weight</th>
                                    <th>Body Fat (%)</th>
                                    <th>Fat Mass</th>
                                    <th>Lean Mass</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Map over the entries array to create table rows */}
                                {entries.map((entry) => {
                                    // Ensure weight and bodyFat are numbers for calculations
                                    let weight = typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight);
                                    let bodyFatPercentage = typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat);

                                    // Calculate Fat Mass and Lean Mass in the entry's original unit
                                    const fatMassOriginalUnit = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage))
                                        ? (weight * (bodyFatPercentage / 100))
                                        : NaN;  // Set to NaN if inputs are invalid
                                    const leanMassOriginalUnit = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage))
                                        ? (weight - fatMassOriginalUnit)
                                        : NaN;  // Set to NaN if inputs are invalid


                                    // Apply conversion for DISPLAY in the table based on the *current* weightUnit state
                                    let weightDisplay = weight;
                                    let fatMassTableDisplay = fatMassOriginalUnit;
                                    let leanMassTableDisplay = leanMassOriginalUnit;


                                    // Perform the conversion if the entry's stored unit is different from the current unit state
                                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                                        if (weightUnit === 'lbs') {
                                             // Convert from the entry's unit (which must be kg if not lbs) to lbs
                                            weightDisplay = entry.weightUnit === 'kg' ? weight * 2.20462 : weight;
                                            fatMassTableDisplay = entry.weightUnit === 'kg' ? fatMassOriginalUnit * 2.20462 : fatMassOriginalUnit;
                                            leanMassTableDisplay = entry.weightUnit === 'kg' ? leanMassOriginalUnit * 2.20462 : leanMassOriginalUnit;
                                        } else if (weightUnit === 'kg') {
                                             // Convert from the entry's unit (which must be lbs if not kg) to kg
                                            weightDisplay = entry.weightUnit === 'lbs' ? weight * 0.453592 : weight;
                                            fatMassTableDisplay = entry.weightUnit === 'lbs' ? fatMassOriginalUnit * 0.453592 : fatMassOriginalUnit;
                                            leanMassTableDisplay = entry.weightUnit === 'lbs' ? leanMassOriginalUnit * 0.453592 : leanMassOriginalUnit;
                                        }
                                    }

                                    return (
                                        <tr key={entry.id}>
                                            <td>{entry.date instanceof Date ? entry.date.toLocaleDateString() : 'Invalid Date'}</td>
                                            <td>{typeof weightDisplay === 'number' && !isNaN(weightDisplay) ? weightDisplay.toFixed(1) : 'N/A'} {weightUnit}</td>
                                            <td>{typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage) ? bodyFatPercentage.toFixed(1) : 'N/A'} %</td>
                                            <td>{typeof fatMassTableDisplay === 'number' && !isNaN(fatMassTableDisplay) ? fatMassTableDisplay.toFixed(1) : 'N/A'} {weightUnit}</td>
                                            <td>{typeof leanMassTableDisplay === 'number' && !isNaN(leanMassTableDisplay) ? leanMassTableDisplay.toFixed(1) : 'N/A'} {weightUnit}</td>
                                            <td>
                                                <button className="edit-button" onClick={() => handleEditClick(entry)}>Edit</button>
                                                <button className="delete-button" onClick={() => handleDeleteEntry(entry.id)}>Delete</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    <hr style={{ margin: '40px 0'}} /> {/* Another separator line */}

                    {/* Section to display the graph */}
                    <h3>Progress Graph</h3>
                    {/* Show graph only if not loading/error and entries exist */}
                    {!fetchLoading && !fetchError && entries.length > 0 && (
                        <div style={{ width: '100%', maxWidth: '1280px', margin: '20px auto', height: '720px' }}>
                             {/* Render the Plotly chart */}
                            <Plot
                                data={plotlyData} // Pass the Plotly-formatted data
                                layout={layout} // Pass the Plotly layout
                                style={{ width: '100%', height: '100%' }} // Style for the container div
                                useResizeHandler={true} // Enable responsiveness
                            />
                        </div>
                    )}
                    {/* Show message if no entries logged and graph is not shown */}
                    {!fetchLoading && !fetchError && entries.length === 0 && <p>Log entries or import data to see your progress graph.</p>}
                </>
                // --- End Historical Data Section ---
            )}
            {/* --- Conditional Rendering Ends Here --- */}
        </div>
    );
};

export default BodyMetricsDashboard;