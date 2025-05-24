// src/components/BodyMetricsDashboard.jsx
import React, { useRef, useState, useMemo, useEffect } from 'react';

// Joy UI Imports
import {
    Typography,
    Input,
    Select,
    Option,
    Button,
    Box,
    Sheet,
    Table,
    FormControl,
    FormLabel,
    Divider
} from '@mui/joy';

import { useAuth } from '../AuthContext.jsx';

// Import custom hooks
import useBodyMetrics from '../hooks/useBodyMetrics.js';
import useCsvImport from '../hooks/useCsvImport.js';
import useUserProfile from '../hooks/useUserProfile.js';

// Import calculation functions from utils
import {
    calculateLinearRegression,
    calculateBmr,
    calculateTdee,
    predictWeightLinearDifference,
    calculateAge
} from '../utils/calculations.js';

// Import Plotly React component
import Plot from 'react-plotly.js';

// Helper function to get today's date inYYYY-MM-DD format
const getTodaysDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const BodyMetricsDashboard = () => {
    // Refs for the new entry form
    const dateRef = useRef();
    const weightRef = useRef();
    const bodyFatRef = useRef();

    // State for weight unit (remains in component as it's UI state for the form/chart)
    const [weightUnit, setWeightUnit] = useState('lbs');

    // State for prediction days
    const [predictionDays, setPredictionDays] = useState(90);  // Default to 90 days

    // Use the custom hook for body metrics data management
    // Destructure all state and functions needed from the hook
    const {
        entries,
        fetchLoading,
        fetchError,
        saveError,
        saveLoading,
        saveMessage,
        isEditing,
        editingEntryId,
        editFormData,
        editError,
        editMessage,
        handleSubmit: handleHookSubmit,
        handleEditClick,
        handleEditInputChange,
        handleUpdateEntry: handleHookUpdateEntry,
        handleDeleteEntry,
        handleCancelEdit,
        currentUser,
        setSaveError: setHookSaveError,
        setSaveMessage: setHookSaveMessage,
        setEditError: setHookEditError,
        setEditMessage: setHookEditMessage,
        handleFetchEntries // Make sure handleFetchEntries is destructured here
    } = useBodyMetrics();

    // Use the custom hook for CSV import
    // Pass the current user's ID and the handleFetchEntries callback to the hook
    const csvImportHook = useCsvImport(currentUser?.uid, handleFetchEntries);

    const {
        selectedFile,
        parsedCsvData,
        csvHeaders,
        columnMapping,
        importError,
        importMessage,
        isParsing,
        isImporting, // Added isImporting from the hook
        setColumnMapping,
        handleFileSelect,
        handleConfirmMapping,
        handleImportCsv,
        clearImportState,
    } = csvImportHook;

    // Use the new custom hook for user profile data
    const {
        userProfile,
        profileLoading,
        profileError,
        saveProfile,
        setProfileError,
        setProfileMessage,
        profileMessage = '',
        saveProfileLoading,
    } = useUserProfile(currentUser?.uid);

    // State for local user profile form data
    const [localProfileData, setLocalProfileData] = useState({
        sex: userProfile?.sex || '',
        dateOfBirth: userProfile?.dateOfBirth ? userProfile.dateOfBirth.toISOString().split('T')[0] : '',
        height: userProfile?.height || '',
        activityLevel: userProfile?.activityLevel || '',
        weightGoalType: userProfile?.weightGoalType || 'maintain',
        targetWeight: userProfile?.targetWeight || '',
        targetRate: userProfile?.targetRate || '',
    });

    // Update local form data when userProfile from the hook changes
    useEffect(() => {
        if (userProfile) {
            setLocalProfileData({
                sex: userProfile.sex || '',
                dateOfBirth: userProfile.dateOfBirth ? userProfile.dateOfBirth.toISOString().split('T')[0] : '',
                height: userProfile.height || '',
                activityLevel: userProfile.activityLevel || '',
                weightGoalType: userProfile.weightGoalType || 'maintain',
                targetWeight: userProfile.targetWeight || '',
                targetRate: userProfile.targetRate || '',
            });
        }
    }, [userProfile]);

    // Handler for local profile form input changes
    const handleProfileInputChange = (e) => {
        const { name, value } = e.target;
        setLocalProfileData(prevData => ({
            ...prevData,
            [name]: value,
        }));
    };

    // Hanlder for saving the user profile
    const handleSaveProfile = (e) => {
        e.preventDefault();

        // Basic validation for profile data
        if (!localProfileData.sex || !localProfileData.dateOfBirth || !localProfileData.height || !localProfileData.activityLevel) {
            setProfileError('Please fill in all required fields.');
            setProfileMessage('');
            return;
        }

        const height = parseFloat(localProfileData.height);
        if (isNaN(height) || height <= 0) {
            setProfileError('Please enter a valid height.');
            setProfileMessage('');
            return;
        }

        // Validation for weight goal fields if goal is not 'maintain'
        if (localProfileData.weightGoalType !== 'maintain') {
            const targetWeight = parseFloat(localProfileData.targetWeight)
            const targetRate = parseFloat(localProfileData.targetRate);

            if (isNaN(targetWeight) || targetWeight <= 0) {
                setProfileError('Please enter a valid target weight.');
                setProfileMessage('');
                return;
            }
            if (isNaN(targetRate) || targetRate <= 0) {
                setProfileError('Please enter a valid target rate (lbs/week).');
                setProfileMessage('');
                return;
            }
        }

        // Convert dateOfBirth to a Date object for saving
        const [year, month, day] = localProfileData.dateOfBirth.split('-').map(Number);
        const dateOfBirth = new Date(year, month - 1, day);

        // Prepare data for saving
        const profileDataToSave = {
            ...localProfileData,
            height: height,
            dateOfBirth: dateOfBirth,
            targetWeight: localProfileData.weightGoalType !== 'maintain' ? parseFloat(localProfileData.targetWeight) : null,
            targetRate: localProfileData.weightGoalType !== 'maintain' ? parseFloat(localProfileData.targetRate) : null,
            weightUnit: weightUnit,
        };

        // Call the saveProfile function from the hook
        saveProfile(profileDataToSave);
    };

    // --- Calculate BMR, TDEE, Target Caloric Intake, and Prediction using useMemo ---
    const {
        bmr,
        tdee,
        targetCaloricIntake,
        linearDifferencePredictionPoints,
        milestonePoints,
        plotlyData,
        minTimestamp,
        lastPredictedTimestamp,
        annotations
    } = useMemo(() => {
        let calculatedBmr = NaN;
        let calculatedTdee = NaN;
        let calculatedTargetCaloricIntake = NaN;
        let predictedPoints = [];
        const foundMilestonePoints = [];

        // Find the most recent weight entry
        const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;

        // Check if we have both user profile data and a recent weight entry
        if (userProfile && latestEntry) {
            const age = calculateAge(userProfile.dateOfBirth);
            const sex = userProfile.sex;
            const activityLevel = userProfile.activityLevel;
            const heightInInches = userProfile.height;
            const weight = latestEntry.weight;
            const weightUnitEntry = latestEntry.weightUnit;

            // Ensure we have valid data points for calculation
            if (!isNaN(age) && typeof sex === 'string' && sex !== '' &&
                typeof activityLevel === 'string' && activityLevel !== '' &&
                typeof heightInInches === 'number' && !isNaN(heightInInches) && heightInInches > 0 &&
                typeof weight === 'number' && !isNaN(weight) && weight > 0 &&
                typeof weightUnitEntry === 'string' && weightUnitEntry !== ''
            ) {   
                // Convert heighit from inches to centimeters (1 inch = 2.54 cm)
                const heightInCm = heightInInches * 2.54;

                // Convert weight to kilograms if it's in lbs (1 lbs = 0.453592 kg)
                const weightInKg = weightUnitEntry === 'lbs' ? weight * 0.453592 : weight;

                // Calculate BMR
                calculatedBmr = calculateBmr({
                    sex: sex,
                    weight: weightInKg,
                    height: heightInCm,
                    age: age
                });

                // Calculate TDEE if BMR is valid
                if (!isNaN(calculatedBmr)) {
                    calculatedTdee = calculateTdee(calculatedBmr, activityLevel);

                    // Calculate Target Caloric Intake based on TDEE and weight goal
                    if (!isNaN(calculatedTdee) && userProfile.weightGoalType !== 'maintain' &&
                        typeof userProfile.targetRate === 'number' && !isNaN(userProfile.targetRate) && userProfile.targetRate > 0
                    ) {
                        // Calorie deficit/surplus needed per week to lose/gain 1 lb is approx 3500 calories
                        // Calorie deficit/surplus per day = (Target Rate in lbs/week * 3500 calories/lb) / 7 days/week
                        // Need to convert targetRate to lbs/week if it's stored in kg/week
                        let targetRateInLbsPerWeek = userProfile.targetRate;
                        // Assuming userProfile.weightUnit stores the unit the targetWeight/Rate are in
                        if (userProfile.weightUnit === 'kg') {
                            targetRateInLbsPerWeek = userProfile.targetRate * 2.20462;  // Convert kg/week to lbs/week
                        }

                        const dailyCalorieAdjustment = (targetRateInLbsPerWeek * 3500) / 7;

                        if (userProfile.weightGoalType === 'lose') {
                            calculatedTargetCaloricIntake = calculatedTdee - dailyCalorieAdjustment;
                        } else if (userProfile.weightGoalType === 'gain') {
                            calculatedTargetCaloricIntake = calculatedTdee + dailyCalorieAdjustment;
                        }

                        // Ensure caloric intake is not negative
                        if (calculatedTargetCaloricIntake < 0) {
                            calculatedTargetCaloricIntake = 0;
                        }
                    } else if (userProfile.weightGoalType === 'maintain' && !isNaN(calculatedTdee)) {
                        // If goal is maintain, target intake is TDEE
                        calculatedTargetCaloricIntake = calculatedTdee;
                    }

                    // --- Calculate Linear Difference Model Prediction ---
                    // Add checks for essential user profile properties before calling the prediction model
                    if (!isNaN(calculatedTargetCaloricIntake) && latestEntry && userProfile &&
                        typeof userProfile.sex === 'string' && userProfile.sex !== '' &&
                        userProfile.dateOfBirth instanceof Date && !isNaN(userProfile.dateOfBirth.getTime()) &&
                        typeof userProfile.height === 'number' && !isNaN(userProfile.height) && userProfile.height > 0 &&
                        typeof userProfile.activityLevel === 'string' && userProfile.activityLevel !== '' &&
                        typeof predictionDays === 'number' && !isNaN(predictionDays) && predictionDays >= 0
                    ) {
                        // Pass the last entry, calculated target intake, and user profile to the new model
                        predictedPoints = predictWeightLinearDifference({
                            lastEntry: latestEntry,
                            targetCaloricIntake: calculatedTargetCaloricIntake,
                            userProfile: userProfile,
                            predictionDays: predictionDays
                        });

                        // --- Find Milestone Points on the Prediction ---
                        const milestones = userProfile.weightGoalType === 'lose'
                            ? [40, 35, 30, 25, 20, 15, 10, 5]   // Body fat % milestones for loss
                            : [];   // Add gain milestones later if needed (e.g., target weight reached)
                                // TODO: Add milestones for weight goal gain
                                // TODO: Calculate body fat % milestones for weight loss based on current body fat percentage

                        let lastPredictedBodyFat = latestEntry.bodyFat; // Start with last historical BF%

                        // Interate through predicted points to find milestones
                        // Start from the second point (index 1) because the first point is the last historical entry
                        for (let i = 1; i < predictedPoints.length; i++) {
                            const point = predictedPoints[i];
                            const previousPoint = predictedPoints[i - 1];

                            // Check for Body Fat % milestones (only if losing and milestones defined)
                            if (userProfile.weightGoalType === 'lose' && milestones.length > 0) {
                                for (const milestoneBF of milestones) {
                                    // Check if the prediction crossed this milestone between the previous and current point
                                    // We need to check if the current point's BF is below the milestone
                                    // AND the previous point's BF was above or equal to the milestone
                                    if (point.bodyFat <= milestoneBF && previousPoint.bodyFat > milestoneBF) {
                                        // Check if this milestone hasn't been added yet
                                        if (!foundMilestonePoints.some(m => m.label === `${milestoneBF}% BF`)) {
                                            foundMilestonePoints.push({
                                                x: point.x, // Timestamp of the predicted point
                                                y: point.y, // Predicted weight at this point
                                                bodyFat: point.bodyFat, // Predicted body fat at this point
                                                label: `${milestoneBF}% BF`
                                            });
                                        }
                                    }
                                }
                            }

                            // Check for Target Weight milestone
                            if (userProfile.weightGoalType !== 'maintain' && userProfile.targetWeight !== null && typeof userProfile.targetWeight === 'number' && !isNaN(userProfile.targetWeight)) {
                                // Need to convert target weight to the unit of the predicted points (which is the lastEntry's unit)
                                let targetWeightInPredictionUnit = userProfile.targetWeight;
                                // Assuming userProfile.weightUnit is the unit the targetWeight is in
                                if (userProfile.weightUnit && userProfile.weightUnit !== latestEntry.weightUnit) {
                                    if (userProfile.weightUnit === 'lbs') {
                                        targetWeightInPredictionUnit = userProfile.weightUnit === 'kg' ? targetWeightInPredictionUnit * 2.20462 : targetWeightInPredictionUnit;
                                    } else if (latestEntry.weightUnit === 'kg') {
                                        targetWeightInPredictionUnit = userProfile.weightUnit === 'lbs' ? targetWeightInPredictionUnit * 0.453592 : targetWeightInPredictionUnit;
                                    }
                                }

                                // Check if the prediction crossed the target weight
                                const lastPredictedWeight = previousPoint.y;

                                // Check if current weight is below target AND previous was above (for loss)
                                if (userProfile.weightGoalType === 'lose' && point.y <= targetWeightInPredictionUnit && lastPredictedWeight > targetWeightInPredictionUnit) {
                                    // Ensure we only add the first time it crosses the target
                                    if (!foundMilestonePoints.some(m => m.label.startsWith('Target Weight'))) {
                                        foundMilestonePoints.push({
                                            x: point.x,
                                            y: point.y,
                                            bodyFat: point.bodyFat,
                                            label: `Target Weight (${userProfile.targetWeight.toFixed(1)} ${userProfile.weightUnit || ''})` // Use the user's entered target and unit
                                        });
                                    }
                                }
                                // Check if current weight is above target AND previous was below (for gain)
                                if (userProfile.weightGoalType === 'gain' && point.y >= targetWeightInPredictionUnit && lastPredictedWeight < targetWeightInPredictionUnit) {
                                    // Ensure we only add the first time it crosses the target
                                    if (!foundMilestonePoints.some(m => m.label.startsWith('Target Weight'))) {
                                        foundMilestonePoints.push({
                                            x: point.x,
                                            y: point.y,
                                            bodyFat: point.bodyFat,
                                            label: `Target Weight (${userProfile.targetWeight.toFixed(1)} ${userProfile.weightUnit || ''})` // Use the user's entered target and unit
                                        });
                                    }
                                }
                            }
                        }

                        // Sort milestone points by date
                        foundMilestonePoints.sort((a, b) => a.x - b.x);
                    } else {
                        console.warn("Skipping linear difference prediction due to invalid or missing user profile/entry data.");
                        // Optionally, set a state here to display a message to the user
                    }        
                }
            }
        }

        // Calculate min and max timestamps for the chart axis based on historical and predicted data
        let minTimestamp = Date.now();
        let maxTimestamp = Date.now();

        const allPoints = [...entries, ...predictedPoints]; // Combine historical and predicted points

        if (allPoints.length > 0) {
            // Filter out points with invalid dates before finding min/max
            const validPointsWithDates = allPoints.filter(p => p.date instanceof Date && !isNaN(p.date.getTime()) || typeof p.x === 'number' && !isNaN(p.x));

            if (validPointsWithDates.length > 0) {
                minTimestamp = validPointsWithDates[0].date?.getTime() || validPointsWithDates[0].x;
                maxTimestamp = validPointsWithDates[0].date?.getTime() || validPointsWithDates[0].x;

                for (const point of validPointsWithDates) {
                    const timestamp = point.date?.getTime() || point.x;
                    if (typeof timestamp === 'number' && !isNaN(timestamp)) {
                        if (timestamp < minTimestamp) {
                            minTimestamp = timestamp;
                        }
                        if (timestamp > maxTimestamp) {
                            maxTimestamp = timestamp;
                        }
                    }
                }
            }
        }

        // Determine the end timestamp for the chart based on the prediction points
        let lastPredictedTimestamp = maxTimestamp;
        if (predictedPoints.length > 0) {
            lastPredictedTimestamp = predictedPoints[predictedPoints.length - 1].x
        }

        // --- Prepare data in Plotly format ---
        // Plotly expects an array of trace objects
        const plotlyData = [
            {
                // Weight trace (Historical Data)
                // Converts Date objects to UTC ISO strings for consistent plotting
                x: entries.map(entry => entry.date instanceof Date ? entry.date.toISOString() : null).filter(x => x !== null),  // Filter out null dates
                y: entries.map(entry => {
                    let weightValue = entry.weight;
                    // Apply conversion only if the entry's stored unit is different from the current state unit
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                        } else if (entry.weightUnit === 'kg') {
                            weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                        }
                    }
                    return typeof weightValue === 'number' && !isNaN(weightValue) ? parseFloat(weightValue.toFixed(1)) : null;
                }),
                mode: 'lines+markers',
                name: `Weight (${weightUnit})`,
                line: { color: 'rgb(75, 192, 192)' },
                marker: { size: 8 },
                type: 'scatter',
            },
            {
                // Fat Mass trace (Historical Data)
                // Converts Date objects to UTC ISO strings for consistent plotting
                x: entries.map(entry => entry.date instanceof Date ? entry.date.toISOString() : null).filter(x => x !== null),  // Filter out null dates
                y: entries.map(entry => {
                    const weight = entry.weight;
                    const bodyFatPercentage = entry.bodyFat;
                    let fatMass = (weight * (bodyFatPercentage / 100));
                    
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            fatMass = entry.weightUnit === 'kg' ? fatMass * 2.20462 : fatMass;
                        } else if (entry.weightUnit === 'kg') {
                            fatMass = entry.weightUnit === 'lbs' ? fatMass * 0.453592 : fatMass;
                        }
                    }
                    return typeof fatMass === 'number' && !isNaN(fatMass) ? parseFloat(fatMass.toFixed(1)) : null;
                }),
                mode: 'lines+markers',
                name: `Fat Mass (${weightUnit})`,
                line: { color: 'rgb(255, 99, 132)' },
                marker: { size: 8 },
                type: 'scatter',
            },
            {
                // Lean Mass trace (Historical Data)
                // Converts Date objects to UTC ISO strings for consistent plotting
                x: entries.map(entry => entry.date instanceof Date ? entry.date.toISOString() : null).filter(x => x !== null),  // Filter out null dates
                y: entries.map(entry => {
                    const weight = entry.weight;
                    const bodyFatPercentage = entry.bodyFat;
                    let leanMass = (weight - (weight * (bodyFatPercentage / 100)));
                    
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            leanMass = entry.weightUnit === 'kg' ? leanMass * 2.20462 : leanMass;
                        } else if (entry.weightUnit === 'kg') {
                            leanMass = entry.weightUnit === 'lbs' ? leanMass * 0.453592 : leanMass;
                        }
                    }
                    return typeof leanMass === 'number' && !isNaN(leanMass) ? parseFloat(leanMass.toFixed(1)) : null;
                }),
                mode: 'lines+markers',
                name: `Lean Mass (${weightUnit})`,
                line: { color: 'rgb(53, 162, 235)' },
                marker: { size: 8 },
                type: 'scatter',
            },
            {
                // Linear Regression Trend Line trace
                // Convert timestamps to UTC ISO strings for consistent plotting
                x: calculateLinearRegression(
                    entries.map(entry => {
                        // Use date's timestamp as the x-value for linear regression
                        const xValue = entry.date instanceof Date && !isNaN(entry.date.getTime()) ? entry.date.getTime() : NaN;

                        let weightValue = entry.weight;
                        // Convert weight to the *current display unit* before using in trend calculation
                        if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                            if (weightUnit === 'lbs') {
                                weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                            } else if (weightUnit === 'kg') {
                                weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                            }
                        }
                        return { x: xValue, y: weightValue };
                    })
                ).map(point => new Date(point.x).toISOString()),    // Convert timestamps back to UTC ISO strings for Plotly
                y: calculateLinearRegression(
                    entries.map(entry => {
                        // Use date's timestamp as the x-value for linear regression
                        const xValue = entry.date instanceof Date && !isNaN(entry.date.getTime()) ? entry.date.getTime() : NaN;

                        let weightValue = entry.weight;
                        if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                            if (weightUnit === 'lbs') {
                                weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                            } else if (weightUnit === 'kg') {
                                weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                            }
                        }
                        return { x: xValue, y: weightValue };
                    })
                ).map(point => typeof point.y === 'number' && !isNaN(point.y) ? parseFloat(point.y.toFixed(1)) : null), // Map y value and format
                mode: 'lines',
                name: 'Weight Trend (Linear)',
                line: { color: 'rgb(0, 0, 0)', dash: 'dash' },
                type: 'scatter',
            },
            // --- Linear Difference Model Prediction trace ---
            {
                x: predictedPoints.map(point => new Date(point.x).toISOString()),
                y: predictedPoints.map(point => typeof point.y === 'number' && !isNaN(point.y) ? parseFloat(point.y.toFixed(1)) : null),
                mode: 'lines',
                name: 'Weight Prediction (Linear Difference)',
                line: { color: 'rgb(255, 165, 0)' },
                type: 'scatter',
            },
        ];

        // Add Milestone points as annotations
        const annotations = foundMilestonePoints.map(milestone => ({
            x: new Date(milestone.x).toISOString(),
            y: milestone.y,
            xref: 'x',
            yref: 'y',
            text: milestone.label,
            showarrow: true,
            arrowhead: 2,
            ax: 0,  // Annotation arrow x-position
            ay: -40,    // Annotation arrow y-position (offset from the point)
            bgcolor: 'rgba(255, 255, 255, 0.8)',    // Background color for the text
            bordercolor: '#c0c0c0', // Border color for the text box
            borderwidth: 1,
            borderpad: 4,   // Padding around the text
            // Optional: Customize font, opacity, etc.
        }));

        return {
            bmr: calculatedBmr,
            tdee: calculatedTdee,
            targetCaloricIntake: calculatedTargetCaloricIntake,
            linearDifferencePredictionPoints: predictedPoints,
            milestonePoints: foundMilestonePoints,
            plotlyData: plotlyData,
            minTimestamp: minTimestamp,
            lastPredictedTimestamp: lastPredictedTimestamp,
            annotations: annotations
        };
    }, [entries, weightUnit, userProfile, predictionDays]);
    
    const memoizedLayout = useMemo(() => {
        return {
            title: `Body Metrics Progress and Prediction (${weightUnit})`,
            xaxis: {
                title: 'Date',
                type: 'date',
                range: [new Date(minTimestamp), new Date(lastPredictedTimestamp)],
                rangeslider: { visible: true },
            },
            yaxis: {
                title: `Measurement (${weightUnit})`,
            },
            hovermode: 'closest',   // Show tooltip for the closest point
            dragmode: 'pan',
            // shapes, annotations, and other layout customizations go here
            margin: {
                l: 50,
                r: 50,
                b: 50,
                t: 50,
                pad: 4
            },
            // Ensure responsiveness
            autosize: true,
            annotations: annotations
        };
    }, [weightUnit, minTimestamp, lastPredictedTimestamp, annotations]);

    // Local function to handle the new entry form submission
    const handleFormSubmit = (e) => {
        e.preventDefault();

        // Basic client-side validation
        if (!weightRef.current.value || !bodyFatRef.current.value || !dateRef.current.value) {
            setHookSaveError('Please fill in all fields.');
            setHookSaveMessage(''); // Clear success message if there's an error
            return;
        }

        const weight = parseFloat(weightRef.current.value);
        const bodyFat = parseFloat(bodyFatRef.current.value);

        if (isNaN(weight) || isNaN(bodyFat)) {
            setHookSaveError('Weight and Body Fat must be numbers.');
            setHookSaveMessage('');
            return;
        }
        if (bodyFat < 0 || bodyFat > 100) {
            setHookSaveError('Body Fat Percentage (%) must be between 0 and 100.');
            setHookSaveMessage(''); // Clear success message if there's an error
            return;
        }

        // Clear previous errors/messages before submitting
        setHookSaveError('');
        setHookSaveMessage('');
        // Optional: Set saveLoading state here if you have a button that uses it

        // Prepare entry data and call the hook's handleSubmit
        const dateString = dateRef.current.value;
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day);

        const entryData = {
            date: date,
            weight: weight,
            bodyFat: bodyFat,
            weightUnit: weightUnit,
        };

        handleHookSubmit(entryData);

        // Clear the form fields after submission (assuming hook handles success message)
        // Only clear if there were no validation errors
        // Note: The hook's saveLoading state might not be immediately false here,
        // so clearing based on saveError might not be perfect.
        // A better approach might be to clear the form in the hook's success path.
        // For now, we'll leave it as is, but be aware.
        if (!saveError) {
            dateRef.current.value = getTodaysDate();
            weightRef.current.value = '';
            bodyFatRef.current.value = '';
        }
    };

    // Local function to handle the edit form submission
    const handleEditFormSubmit = (e) => {
        e.preventDefault();

        // Basic validation for edit form
        if (!editFormData?.date || isNaN(parseFloat(editFormData?.weight)) || isNaN(parseFloat(editFormData?.bodyFat))) {
            setHookEditError('Please fill in all fields with valid numbers.');
            setHookEditMessage('');
            return;
        }
        if (parseFloat(editFormData?.bodyFat) < 0 || parseFloat(editFormData?.bodyFat) > 100) {
            setHookEditError('Body Fat Percentage must be between 0 and 100.');
            setHookEditMessage('');
            return;
        }

        // Clear previous errors/messages before submitting
        setHookEditError('');
        setHookEditMessage('');

        // Prepare updated data and call the hook's handleUpdateEntry
        const dateString = editFormData.date;
        const [year, month, day] = dateString.split('-').map(Number);
        const updatedDate = new Date(year, month - 1, day);

        const updatedData = {
            date: updatedDate,
            weight: parseFloat(editFormData.weight),
            bodyFat: parseFloat(editFormData.bodyFat),
            // weightUnit is not updated in the edit form
        };

        handleHookUpdateEntry(updatedData);
    };

    return (
        <Box sx={{ p: 3, maxWidth: '1200px', margin: 'auto' }}>
            <Typography level="h1" component="h1" sx={{ mb: 4, textAlign: 'center' }}>
                Body Metrics Dashboard
            </Typography>

            <Sheet variant="outlined" sx={{ p: 3, borderRadius: 'md', mb: 4 }}>
                <Typography level="h2" component="h2" sx={{ mb: 2 }}>User Profile</Typography>
                {profileLoading && <Typography>Loading profile...</Typography>}
                {profileError && <Typography color="danger">{profileError}</Typography>}
                {profileMessage && <Typography color="success">{profileMessage}</Typography>}

                <form onSubmit={handleSaveProfile}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                        <FormControl>
                            <FormLabel htmlFor="sex">Sex:</FormLabel>
                            <Select
                                id="sex"
                                name="sex"
                                value={localProfileData.sex}
                                onChange={(e, newValue) => handleProfileInputChange({ target: { name: 'sex', value: newValue } })}
                                required
                            >
                                <Option value="">-- Select --</Option>
                                <Option value="male">Male</Option>
                                <Option value="female">Female</Option>
                            </Select>
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="dateOfBirth">Date of Birth:</FormLabel>
                            <Input 
                                type="date" 
                                id="dateOfBirth" 
                                name="dateOfBirth"
                                value={localProfileData.dateOfBirth}
                                onChange={handleProfileInputChange}
                                required />
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="height">Height (inches):</FormLabel>
                            <Input
                                type="number"
                                id="height"
                                name="height"
                                value={localProfileData.height}
                                onChange={handleProfileInputChange}
                                required
                                step="0.1" />
                        </FormControl>
                        <FormControl>
                            <FormLabel htmlFor="activityLevel">Activity Level:</FormLabel>
                            <Select
                                id="activityLevel"
                                name="activityLevel"
                                value={localProfileData.activityLevel}
                                onChange={(e, newValue) => handleProfileInputChange({ target: { name: 'activityLevel', value: newValue } })}
                                required
                            >
                                <Option value="">-- Select --</Option>
                                <Option value="sedentary">Sedentary (little to no exercise)</Option>
                                <Option value="lightly_active">Lightly active (exercise 1-3 days/week)</Option>
                                <Option value="moderately_active">Moderately active (exercise 3-5 days/week)</Option>
                                <Option value="very_active">Very active (exercise 6-7 days/week)</Option>
                                <Option value="super_active">Super active (very intense exercise daily, or physical job)</Option>
                            </Select>
                        </FormControl>
                    </Box>

                    <Box sx={{ mt: 3, mb: 2 }}>
                        <Typography level="h4" component="h4" sx={{ mb: 1 }}>Weight Goal</Typography>
                        <FormControl sx={{ mb: 1 }}>
                            <FormLabel htmlFor="weightGoalType">Goal Type:</FormLabel>
                            <Select
                                id="weightGoalType"
                                name="weightGoalType"
                                value={localProfileData.weightGoalType}
                                onChange={(e, newValue) => handleProfileInputChange({ target: { name: 'weightGoalType', value: newValue } })}
                            >
                                <Option value="maintain">Maintain Weight</Option>
                                <Option value="lose">Lose Weight</Option>
                                <Option value="gain">Gain Weight</Option>
                            </Select>
                        </FormControl>

                        {localProfileData.weightGoalType !== 'maintain' && (
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                                <FormControl>
                                    <FormLabel htmlFor="targetWeight">Target Weight ({weightUnit}):</FormLabel>
                                    <Input
                                        type="number"
                                        id="targetWeight"
                                        name="targetWeight"
                                        value={localProfileData.targetWeight}
                                        onChange={handleProfileInputChange}
                                        required={localProfileData.weightGoalType !== 'maintain'}
                                        slotProps={{ input: { step: 0.1 } }}
                                    />
                                </FormControl>
                                <FormControl>
                                    <FormLabel htmlFor="targetRate">Target Rate ({weightUnit}/week):</FormLabel>
                                    <Input
                                        type="number"
                                        id="targetRate"
                                        name="targetRate"
                                        value={localProfileData.targetRate}
                                        onChange={handleProfileInputChange}
                                        required={localProfileData.weightGoalType !== 'maintain'}
                                        slotProps={{ input: { step: 0.1 } }}
                                    />
                                </FormControl>
                            </Box>
                        )}
                    </Box>

                    {/* Adjusted styling for the Save Profile button */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                            type="submit"
                            loading={saveProfileLoading}
                            sx={{
                                height: '36px', // Adjusted height
                                width: '200px', // Adjusted width
                            }}
                        >
                            Save Profile
                        </Button>
                    </Box>
                </form>

                {!isNaN(bmr) && <Typography sx={{ mt: 2 }}>Calculated BMR: {bmr.toFixed(0)} calories/day</Typography>}
                {!isNaN(tdee) && <Typography>Calculated TDEE: {tdee.toFixed(0)} calories/day</Typography>}

                {!isNaN(targetCaloricIntake) && (
                    <Typography>Target Caloric Intake: {targetCaloricIntake.toFixed(0)} calories/day</Typography>
                )}

                {milestonePoints.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                        <Typography level="h4" component="h4">Predicted Milestones:</Typography>
                        <ul>
                            {milestonePoints.map((milestone, index) => (
                                <Typography component="li" key={index}>
                                    {milestone.label}: {new Date(milestone.x).toLocaleDateString()} - {milestone.y.toFixed(1)} {weightUnit} ({milestone.bodyFat.toFixed(1)}% BF)
                                </Typography>
                            ))}
                        </ul>
                    </Box>
                )}
            </Sheet>

            <Divider sx={{ my: 4 }} />

            <Typography level="h2" component="h2" sx={{ mb: 2 }}>Log Body Metrics</Typography>

            {saveError && <Typography color="danger">{saveError}</Typography>}
            {saveMessage && <Typography color="success">{saveMessage}</Typography>}

            <form onSubmit={handleFormSubmit}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2, mb: 2 }}>
                    <FormControl>
                        <FormLabel htmlFor="date">Date:</FormLabel>
                        <Input type="date" id="date" ref={dateRef} required defaultValue={getTodaysDate()} />
                    </FormControl>
                    <FormControl>
                        <FormLabel htmlFor="weight">Weight ({weightUnit}):</FormLabel>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Input type="number" id="weight" ref={weightRef} required slotProps={{ input: { step: 0.1 } }} sx={{ flexGrow: 1}} />
                            <Button variant="outlined" onClick={() => setWeightUnit('lbs')} disabled={weightUnit === 'lbs'}>lbs</Button>
                            <Button variant="outlined" onClick={() => setWeightUnit('kg')} disabled={weightUnit === 'kg'}>kg</Button>
                        </Box>
                    </FormControl>
                    <FormControl>
                        <FormLabel htmlFor="bodyFat">Body Fat Percentage (%):</FormLabel>
                        <Input type="number" id="bodyFat" ref={bodyFatRef} required slotProps={{ input: { step: 0.1 } }} />
                    </FormControl>
                </Box>
                <Button type="submit" loading={saveLoading} sx={{ mt: 2 }}>
                    Save Entry
                </Button>
            </form>

            <Divider sx={{ my: 4 }} />


            <Sheet variant="outlined" sx={{ p: 3, borderRadius: 'md', mb: 4 }}>
                <Typography level="h3" component="h3" sx={{ mb: 2 }}>Import Entries from CSV</Typography>
                
                {/* 1. Show File Input */}
                {importError && <Typography color="danger">{importError}</Typography>}
                {importMessage && <Typography color="success">{importMessage}</Typography>}

                {(!selectedFile && !isParsing && !importError) || (parsedCsvData && columnMapping.date && columnMapping.weight && columnMapping.bodyFat && !importError) ? (
                    <Input
                        type="file"
                        accept=".csv"
                        onChange={handleFileSelect}
                        disabled={isParsing || (parsedCsvData && (!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat))}
                        sx={{ mb: 2 }}
                    />
                ) : null}

                {selectedFile && !isParsing && <Typography sx={{ mb: 1 }}>Selected file: {selectedFile.name}</Typography>}

                {/* 2. Show Parsing Status */}
                {isParsing && <Typography>Parsing CSV...</Typography>}

                {/* 3. Show Column Mapping Form */}
                {parsedCsvData && (!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat) && csvHeaders.length > 0 ? (
                    <Box sx={{ mt: 2 }}>
                        <Typography level="h4" component="h4" sx={{ mb: 1 }}>Map CSV Columns to Data Fields</Typography>
                        <Typography sx={{ mb: 2 }}>Select which column from your CSV corresponds to each required field:</Typography>

                        <FormControl sx={{ mb: 1 }}>
                            <FormLabel htmlFor="dateColumn">Date Column:</FormLabel>
                            <Select
                                id="dateColumn"
                                value={columnMapping.date}
                                onChange={(e, newValue) => setColumnMapping({ ...columnMapping, date: newValue })}
                                required
                            >
                                <Option value="">-- Select Column --</Option>
                                {csvHeaders.map(header => (
                                    <Option key={header} value={header}>{header}</Option>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl sx={{ mb: 1 }}>
                            <FormLabel htmlFor="weightColumn">Weight Column:</FormLabel>
                            <Select
                                id="weightColumn"
                                value={columnMapping.weight}
                                onChange={(e, newValue) => setColumnMapping({ ...columnMapping, weight: newValue })}
                                required
                            >
                                <Option value="">-- Select Column --</Option>
                                {csvHeaders.map(header => (
                                    <Option key={header} value={header}>{header}</Option>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl sx={{ mb: 1 }}>
                            <FormLabel htmlFor="bodyFatColumn">Body Fat Percentage (%):</FormLabel>
                            <Select
                                id="bodyFatColumn"
                                value={columnMapping.bodyFat}
                                onChange={(e, newValue) => setColumnMapping({ ...columnMapping, bodyFat: newValue })}
                                required
                            >
                                <Option value="">-- Select Column --</Option>
                                {csvHeaders.map(header => (
                                    <Option key={header} value={header}>{header}</Option>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl sx={{ mb: 2 }}>
                            <FormLabel htmlFor="unitType">Weight Unit in CSV:</FormLabel>
                            <Select
                                id="unitType"
                                value={columnMapping.unit}
                                onChange={(e, newValue) => setColumnMapping({ ...columnMapping, unit: newValue })}
                                required
                            >
                                <Option value="lbs">lbs</Option>
                                <Option value="kg">kg</Option>
                            </Select>
                            <Typography level="body2" sx={{ mt: 0.5 }}>Select the unit used for weight in your CSV data. Body Fat is imported as percentage (%).</Typography>
                        </FormControl>

                        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                            <Button onClick={handleConfirmMapping} disabled={!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat}>Confirm Mapping</Button>
                            <Button variant="outlined" onClick={clearImportState}>Cancel/Clear Import</Button>
                        </Box>
                    </Box>
                ) : null}

                {/* 4. Show Ready to Import Section */}
                {parsedCsvData && columnMapping.date && columnMapping.weight && columnMapping.bodyFat ? (
                    <Box sx={{ mt: 2 }}>
                        {!importMessage.includes('Importing') && (
                            <Typography sx={{ mb: 1 }}>{parsedCsvData.length} rows parsed. Ready to import with unit: {columnMapping.unit}.</Typography>
                        )}
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button onClick={handleImportCsv} loading={isImporting}>Import Mapped Data</Button>
                            <Button variant="outlined" onClick={() => setColumnMapping({ date: '', weight: '', bodyFat: '', unit: 'lbs' })}>Remap Columns</Button>
                            <Button variant="outlined" onClick={clearImportState}>Cancel/Clear Import</Button>
                        </Box>
                    </Box>
                ) : null}

                {!isParsing && !parsedCsvData && !importError && !importMessage && (
                    <Typography>No valid data or headers found in CSV after parsing. Ensure your CSV has headers and data rows.</Typography>
                )}
            </Sheet>

            <Divider sx={{ my: 4 }} />

            {/* --- Conditional Rendering for Historical Data/Edit Form --- */}
            {isEditing ? (
                <Sheet variant="outlined" sx={{ p: 3, borderRadius: 'md', mb: 4 }}>
                    <Typography level="h3" component="h3" sx={{ mb: 2 }}>Edit Entry (ID: {editingEntryId})</Typography>
                    {editError && <Typography color="danger">{editError}</Typography>}
                    {editMessage && <Typography color="success">{editMessage}</Typography>}

                    <form key={editingEntryId} onSubmit={handleEditFormSubmit}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2, mb: 2 }}>
                            <FormControl>
                                <FormLabel htmlFor="editDate">Date:</FormLabel>
                                <Input
                                    type="date"
                                    id="editDate"
                                    name="date"
                                    value={editFormData?.date || ''}
                                    onChange={handleEditInputChange}
                                    required
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel htmlFor="editWeight">Weight ({editFormData?.weightUnit || ''}):</FormLabel>
                                <Input
                                    type="number"
                                    id="editWeight"
                                    name="weight"
                                    value={editFormData?.weight || ''}
                                    onChange={handleEditInputChange}
                                    required
                                    slotProps={{ input: { step: 0.1 } }}
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel htmlFor="editBodyFat">Body Fat Percentage (%):</FormLabel>
                                <Input
                                    type="number"
                                    id="editBodyFat"
                                    name="bodyFat"
                                    value={editFormData?.bodyFat || ''}
                                    onChange={handleEditInputChange}
                                    required
                                    slotProps={{ input: { step: 0.1 } }}
                                />
                            </FormControl>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                            <Button type="submit">Save Changes</Button>
                            <Button variant="outlined" onClick={handleCancelEdit}>Cancel</Button>
                        </Box>
                    </form>
                </Sheet>
            ) : (
                <>
                    <Typography level="h3" component="h3" sx={{ mb: 2 }}>Historical Entries</Typography>
                    {fetchLoading && <Typography>Loading entries...</Typography>}
                    {fetchError && <Typography color="danger">{fetchError}</Typography>}
                    {!fetchLoading && !fetchError && entries.length === 0 && <Typography>No entries logged yet.</Typography>}

                    {!fetchLoading && !fetchError && entries.length > 0 && (
                        <Table
                            variant="outlined"
                            hoverRow
                            sx={{
                                '--TableCell-paddingY': '8px',
                                '--TableCell-paddingX': '16px',
                                '& thead th': {
                                    backgroundColor: 'background.level1',
                                    fontWeight: 'bold',
                                },
                                '& tbody tr:hover': {
                                    backgroundColor: 'background.level2',
                                },
                                borderRadius: 'md',
                                mb: 4
                            }}
                        >
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
                                {entries.map((entry) => {
                                    let weight = typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight);
                                    let bodyFatPercentage = typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat);

                                    const fatMassOriginalUnit = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage))
                                        ? (weight * (bodyFatPercentage / 100))
                                        : NaN;
                                    const leanMassOriginalUnit = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage))
                                        ? (weight - fatMassOriginalUnit)
                                        : NaN;

                                    let weightDisplay = weight;
                                    let fatMassTableDisplay = fatMassOriginalUnit;
                                    let leanMassTableDisplay = leanMassOriginalUnit;

                                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                                        if (weightUnit === 'lbs') {
                                            weightDisplay = entry.weightUnit === 'kg' ? weight * 2.20462 : weight;
                                            fatMassTableDisplay = entry.weightUnit === 'kg' ? fatMassOriginalUnit * 2.20462 : fatMassOriginalUnit;
                                            leanMassTableDisplay = entry.weightUnit === 'kg' ? leanMassOriginalUnit * 2.20462 : leanMassOriginalUnit;
                                        } else if (weightUnit === 'kg') {
                                            weightDisplay = entry.weightUnit === 'lbs' ? weight * 0.453592 : weight;
                                            fatMassTableDisplay = entry.weightUnit === 'lbs' ? fatMassOriginalUnit * 0.453592 : fatMassOriginalUnit;
                                            leanMassTableDisplay = entry.weightUnit === 'lbs' ? leanMassOriginalUnit * 0.453592 : leanMassOriginalUnit;
                                        }
                                    }
                                    return (
                                        <tr key={entry.id}>
                                            <td>{entry.date instanceof Date ? entry.date.toLocaleDateString() : 'Invalid Date'}</td>
                                            <td>{`${typeof weightDisplay === 'number' && !isNaN(weightDisplay) ? weightDisplay.toFixed(1) : 'N/A'} ${weightUnit}`}</td>
                                            <td>{typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage) ? bodyFatPercentage.toFixed(1) : 'N/A'} %</td>
                                            <td>{typeof fatMassTableDisplay === 'number' && !isNaN(fatMassTableDisplay) ? fatMassTableDisplay.toFixed(1) : 'N/A'} {weightUnit}</td>
                                            <td>{typeof leanMassTableDisplay === 'number' && !isNaN(leanMassTableDisplay) ? leanMassTableDisplay.toFixed(1) : 'N/A'} {weightUnit}</td>
                                            <td>
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Button variant="outlined" size="sm" onClick={() => handleEditClick(entry)}>Edit</Button>
                                                    <Button variant="outlined" color="danger" size="sm" onClick={() => handleDeleteEntry(entry.id)}>Delete</Button>
                                                </Box>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    )}

                    <Divider sx={{ my: 4 }} />

                    <Typography level="h3" component="h3" sx={{ mb: 2 }}>Progress Graph</Typography>

                    {/* Input for Prediction Days */}
                    <FormControl sx={{ mb: 3 }}>
                        <FormLabel htmlFor="predictionDays">Forecast Days:</FormLabel>
                        <Input
                            type="number"
                            id="predictionDays"
                            value={predictionDays}
                            onChange={(e) => setPredictionDays(parseInt(e.target.value) || 0)}
                            slotProps={{ input: { min: 0, step: 1 } }}
                            sx={{ width: '120px' }}
                            endDecorator={<Typography>days</Typography>}
                        />
                    </FormControl>

                    {/* Show graph only if not loading/error and entries exist */}
                    {!fetchLoading && !fetchError && entries.length > 0 && (
                        <Box sx={{ width: '100%', maxWidth: '1280px', margin: '20px auto', height: '720px' }}>
                            {/* Render the Plotly chart */}
                            <Plot
                                data={plotlyData}
                                layout={memoizedLayout}
                                style={{ width: '100%', height: '100%' }}
                                useResizeHandler={true}
                            />
                        </Box>
                    )}
                    {!fetchLoading && !fetchError && entries.length === 0 && <Typography>Log entries or import data to see your progress graph.</Typography>}
                </>
            )}
        </Box>
    );
};

export default BodyMetricsDashboard;
