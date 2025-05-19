// src/components/BodyMetricsDashboard.jsx
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';

import useBodyMetrics from '../hooks/useBodyMetrics.js';    // Import the custom hook for data management
import useCsvImport from '../hooks/useCsvImport.js';    // Import the custom hook for CSV import
import useUserProfile from '../hooks/useUserProfile.js';

// Import calculation functions from utils
import {
    calculateLinearRegression,
    calculateBmr,
    calculateTdee,
    predictWeightCalorieModel,
    calculateAge
} from '../utils/calculations.js';

import Plot from 'react-plotly.js'; // Import Plotly React component

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
        handleSubmit: handleHookSubmit, // Rename to avoid conflict with local form submit
        handleEditClick,
        handleEditInputChange,
        handleUpdateEntry: handleHookUpdateEntry, // Rename to avoid conflict
        handleDeleteEntry,
        handleCancelEdit,
        currentUser,
        handleFetchEntries,
        setSaveError: setHookSaveError,
        setSaveMessage: setHookSaveMessage,
        setEditError: setHookEditError,
        setEditMessage: setHookEditMessage,
    } = useBodyMetrics();

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
        isImporting,
        setColumnMapping,
        handleFileSelect,
        handleConfirmMapping,
        handleImportCsv,
        clearImportState,
    } = useCsvImport(currentUser?.uid, handleFetchEntries);
  
    // Use the new custom hook for user profile data
    const {
        userProfile,
        profileLoading,
        profileError,
        saveProfile,    // Function to save profile data
        setProfileError,    // Expose setter for local validation messages
        setProfileMessage,  // Expose setter for local success messages
        profileMessage, // Message state from the hook
        saveProfileLoading, // Loading state for saving profile
    } = useUserProfile(currentUser?.uid);   // Pass currentUser.uid to the profile hook

    // State for local user profile form data
    const [localProfileData, setLocalProfileData] = useState({
        sex: userProfile?.sex || '',
        dateOfBirth: userProfile?.dateOfBirth ? userProfile.dateOfBirth.toISOString().split('T')[0] : '',
        height: userProfile?.height || '',
        activityLevel: userProfile?.activityLevel || '',
        weightGoalType: userProfile?.weightGoalType || 'maintain',  // Default to maintain
        targetWeight: userProfile?.targetWeight || '',
        targetRate: userProfile?.targetRate || '',  // Rate in lbs/week
    });

    // Update local form data when userProfile from the hook changes
    useEffect(() => {
        if (userProfile) {
            setLocalProfileData({
                sex: userProfile.sex || '',
                dateOfBirth: userProfile.dateOfBirth ? userProfile.dateOfBirth.toISOString().split('T')[0] : '',
                height: userProfile.height || '',
                activityLevel: userProfile.activityLevel || '',
                weightGoalType: userProfile.weightGoalType || 'maintain',  // Default to maintain
                targetWeight: userProfile.targetWeight || '',
                targetRate: userProfile.targetRate || '',  // Rate in lbs/week
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
    }

    // Handler for saving the user profile
    const handleSaveProfile = (e) => {
        e.preventDefault();

        // Basic validation for profile data
        if (!localProfileData.sex || !localProfileData.dateOfBirth || !localProfileData.height || !localProfileData.activityLevel) {
            setProfileError('Please fill in all profile fields.');
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
            const targetWeight = parseFloat(localProfileData.targetWeight);
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

        // Convert dateOfBirth to a Date obejct for saving
        const [year, month, day] = localProfileData.dateOfBirth.split('-').map(Number);
        const dateOfBirth = new Date(year, month - 1, day);

        // Prepare data for saving
        const profileDataToSave = {
            ...localProfileData,
            height: height, // Save height as a number
            dateOfBirth: dateOfBirth, // Save dateOfBirth as a Date object
            targetWeight: localProfileData.weightGoalType !== 'maintain' ? parseFloat(localProfileData.targetWeight) : null,
            targetRate: localProfileData.weightGoalType !== 'maintain' ? parseFloat(localProfileData.targetRate) : null,
        };

        // Call the saveProfile function from the hook
        saveProfile(profileDataToSave);
    };

    // --- Calculate BMR, TDEE, Target Caloric Intake, and Prediction using useMemo ---
    const { bmr, tdee, targetCaloricIntake, caloriePredictionPoints, milestonePoints } = useMemo(() => {
        let calculatedBmr = NaN;
        let calculatedTdee = NaN;
        let calculatedTargetCaloricIntake = NaN;
        let predictedPoints = [];
        const foundMilestonePoints = [];

        // Find the most recent weight entry
        const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;

        // Ensure we have valid data points for calculation
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
                typeof weightUnitEntry === 'string' && weightUnitEntry !== '') {
                
                    // Convert height from inches to centimeters (1 inch = 2.54 cm)
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
                            typeof userProfile.targetRate === 'number' && !isNaN(userProfile.targetRate) && userProfile.targetRate > 0) {
                                
                                // Calorie deficit/surplus needed per week to lose/gain 1 lb in approx 3500 calories.
                                // Calorie deficit/surplus per day = (Target Rate in lbs/week * 3500 calories/lb) / 7 days/week
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
                                // TODO: Add warning message if caloric intake gets too low
                        } else if (userProfile.weightGoalType === 'maintain' && !isNaN(calculatedTdee)) {
                            // If goal is maintain, target intake is TDEE
                            calculatedTargetCaloricIntake = calculatedTdee;
                        }

                        // --- Calculate Calorie Model Prediction ---
                        if (!isNaN(calculatedTargetCaloricIntake) && latestEntry && userProfile &&
                            typeof userProfile.sex === 'string' && userProfile.sex !== '' &&
                            userProfile.dateOfBirth instanceof Date && !isNaN(userProfile.dateOfBirth.getTime()) &&
                            typeof userProfile.height === 'number' && !isNaN(userProfile.height) && userProfile.height > 0 &&
                            typeof userProfile.activityLevel === 'string' && userProfile.activityLevel !== '' &&
                            typeof userProfile.weightGoalType === 'string' && userProfile.weightGoalType !== '' &&
                            (userProfile.weightGoalType === 'maintain' || (typeof userProfile.targetWeight === 'number' && !isNaN(userProfile.targetWeight) && typeof userProfile.targetRate === 'number' && !isNaN(userProfile.targetRate) && userProfile.targetRate > 0))
                            ) {
                            // Pass the last entry, calculated target intake, and user profile to the new model
                            predictedPoints = predictWeightCalorieModel({
                                lastEntry: latestEntry, // Pass the full entry object
                                targetCaloricIntake: calculatedTargetCaloricIntake,
                                userProfile: userProfile,
                                predictionDays: predictionDays
                            });

                            // --- Find Milestone Points on the Prediction ---
                            const milestones = userProfile.weightGoalType === 'lose'
                                ? [30, 25, 20, 15, 10, 5]   // Body fat % milestones for loss
                                : [];   // Add gain milestones later if needed (e.g., target weight reached)
                                // TODO: Add milestones for weight goal gain
                                // TODO: Calculate body fat % milestones for weight loss based on current body fat percentage
                            
                            let lastPredictedBodyFat = latestEntry.bodyFat; // Start with last historical BF%

                            // Iterate through predicted points to find milestones
                            for (const point of predictedPoints) {
                                // Check for Body Fat % milestones (only if losing and milestones defined)
                                if (userProfile.weightGoalType === 'lose' && milestones.length > 0) {
                                    for (const milestoneBF of milestones) {
                                        // Check if the prediction crossed this milestone since the last point
                                        // We need to check if the current point's BF is below the milestone
                                        // AND the previous point's BF was above or equal to the milestone
                                        if (point.bodyFat <= milestoneBF && lastPredictedBodyFat > milestoneBF) {
                                            foundMilestonePoints.push({
                                                x: point.x, // Timestamp of the predicted point
                                                y: point.y, // Predicted weight at this point
                                                bodyFat: point.bodyFat, // Predicted body fat at this point
                                                label: `${milestoneBF}% BF` // Label for the milestone
                                            });
                                        }
                                    }
                                }

                                // Check for Target Weight milestone
                                if (userProfile.weightGoalType !== 'maintain' && userProfile.targetWeight !== null && typeof userProfile.targetWeight === 'number' && !isNaN(userProfile.targetWeight)) {
                                    // Need to convert target weight to the unit of the predicted points (which is the lastEntry's unit)
                                    let targetWeightInPredictionUnit = userProfile.targetWeight;
                                    // Assuming userProfile.weightUnit stores the unit the targetWeight is in
                                    if (userProfile.weightUnit && userProfile.weightUnit !== latestEntry.weightUnit) {
                                        if (latestEntry.weightUnit === 'lbs') {
                                            targetWeightInPredictionUnit = userProfile.weightUnit === 'kg' ? targetWeightInPredictionUnit * 2.20462 : targetWeightInPredictionUnit;
                                        } else if (latestEntry.weightUnit === 'kg') {
                                            targetWeightInPredictionUnit = userProfile.weightUnit === 'lbs' ? targetWeightInPredictionUnit * 0.453592 : targetWeightInPredictionUnit;
                                        }
                                    }

                                    // Check if the prediction crossed the target weight
                                    // Get weight from previous predicted point or last entry
                                    const lastPredictedWeight = predictedPoints.length > 1 && predictedPoints[predictedPoints.length - 2] ? predictedPoints[predictedPoints.length - 2].y : latestEntry.weight;

                                    // Check if current weight is below target AND previous was above (for loss)
                                    if (userProfile.weightGoalType === 'lose' && point.y <= targetWeightInPredictionUnit && lastPredictedWeight  > targetWeightInPredictionUnit) {
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

                                // Update last predicted body fat for the next iteration's check
                                lastPredictedBodyFat = point.bodyFat;
                            }

                            // Sort milestone points by date
                            foundMilestonePoints.sort((a, b) => a.x - b.x);
                        }
                    }
            }
        }
        return { 
            bmr: calculatedBmr, 
            tdee: calculatedTdee, 
            targetCaloricIntake: calculatedTargetCaloricIntake,
            caloriePredictionPoints: predictedPoints,
            milestonePoints: foundMilestonePoints
        };
    }, [userProfile, entries]); // Recalculate when userProfile or entries change

    // Local function to handle the new entry form submission
    const handleFormSubmit = (e) => {
        e.preventDefault();

        // Basic client-side validation
        if (!weightRef.current.value || !bodyFatRef.current.value || !dateRef.current.value) {
            setHookSaveError('Please fill in all fields.'); // Use setter from hook
            setHookSaveMessage(''); // Clear success message if there's an error
            return;
        }

        const weight = parseFloat(weightRef.current.value);
        const bodyFat = parseFloat(bodyFatRef.current.value);

        if (isNaN(weight) || isNaN(bodyFat)) {
            setHookSaveError('Weight and Body Fat must be numbers.'); // Use setter from hook
            setHookSaveMessage('');
            return;
        }
        if (bodyFat < 0 || bodyFat > 100) {
            setHookSaveError('Body Fat Percentage (% ) must be between 0 and 100.'); // Use setter from hook
            setHookSaveMessage('');
            return;
        }

        // Clear previous errors/messages before submitting
        setHookSaveError('');
        setHookSaveMessage('');


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

        handleHookSubmit(entryData); // Call the handleSubmit function from the hook

        // Clear the form fields after submission (assuming hook handles success message)
        // Only clear if there were no validation errors
        if (!saveError) { // Check local state for validation errors before clearing
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
            setHookEditError('Please fill in all fields with valid numbers.'); // Use setter from hook
            setHookEditMessage('');
            return;
        }
        if (parseFloat(editFormData?.bodyFat) < 0 || parseFloat(editFormData?.bodyFat) > 100) {
            setHookEditError('Body Fat Percentage must be between 0 and 100.'); // Use setter from hook
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

        handleHookUpdateEntry(updatedData); // Call the handleUpdateEntry function from the hook
    };



    // --- Prepare data for the chart (Memoized) ---
    const memoizedChartData = useMemo(() => {
        // Filter and sort valid entries inside useMemo
        const validEntries = entries.filter(entry =>
            entry.date instanceof Date && !isNaN(entry.date.getTime()) &&
            typeof entry.weight === 'number' && !isNaN(entry.weight) &&
            typeof entry.bodyFat === 'number' && !isNaN(entry.bodyFat)
        );

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

        // Get the user's target weight from the profile, converted to the current display unit
        let userTargetWeight = null;
        if (userProfile?.targetWeight !== null && typeof userProfile?.targetWeight === 'number' && !isNaN(userProfile?.targetWeight)) {
            userTargetWeight = userProfile.targetWeight;
            // Convert target weight to the current display unit if necessary
            // Assuming userProfile.weightUnit stores the unit the targetWeight is in
            if (userProfile.weightUnit && userProfile.weightUnit !== weightUnit) {
                if (weightUnit === 'lbs') {
                    userTargetWeight = userProfile.weightUnit === 'kg' ? userTargetWeight * 2.20462 : userTargetWeight;
                } else if (weightUnit === 'kg') {
                    userTargetWeight = userProfile.weightUnit === 'lbs' ? userTargetWeight * 0.453592 : userTargetWeight;
                }
            }
        }

        // Determine the end timestamp for the chart based on the prediction points
        let lastPredictedTimestamp = maxTimestamp;
        if (caloriePredictionPoints.length > 0) {
            lastPredictedTimestamp = caloriePredictionPoints[caloriePredictionPoints.length - 1].x;
        }

        // --- Prepare data in Plotly format ---
        // Plotly expects an array of trace objects
        const plotlyData = [
            // Weight trace (Historical Data)
            {
                x: validEntries.map(entry => entry.date.toISOString()),   // Convert Date objects to UTC ISO strings for consistent plotting
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
                    return typeof weightValue === 'number' && !isNaN(weightValue) ? parseFloat(weightValue.toFixed(1)) : null;
                }),
                mode: 'lines+markers',
                name: `Weight (${weightUnit})`,
                line: { color: 'rgb(75, 192, 192)' },
                marker: { size: 8 },
                type: 'scatter',
            },
            // Fat Mass trace (Historical Data)
            {
                x: validEntries.map(entry => entry.date.toISOString()), // Convert Date objects to UTC strings for consistent plotting
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
                    return typeof fatMass === 'number' && !isNaN(fatMass) ? parseFloat(fatMass.toFixed(1)) : null;
                }),
                mode: 'lines+markers',
                name: `Fat Mass (${weightUnit})`,
                line: { color: 'rgb(255, 99, 132)' },
                marker: { size: 8 },
                type: 'scatter',
            },
            // Lean Mass trace
            {
                x: validEntries.map(entry => entry.date.toISOString()),   // Convert Date objects to UTC ISO strings for consistent plotting
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
                    return typeof leanMass === 'number' && !isNaN(leanMass) ? parseFloat(leanMass.toFixed(1)) : null;
                }),
                mode: 'lines+markers',
                name: `Lean Mass (${weightUnit})`,
                line: { color: 'rgb(53, 162, 235)' },
                marker: { size: 8 },
                type: 'scatter',
            },
            // Linear Regression Trend Line trace
            {
                // Convert timestamps to UTC ISO strings for consistent plotting
                x: calculateLinearRegression(
                    validEntries.map(entry => {
                        let weightValue = entry.weight;
                        // Convert weight to the *current display unit* before using in trend calculation
                        if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                            if (weightUnit === 'lbs') {
                                weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                            } else if (weightUnit === 'kg') {
                                weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                            }
                        }
                        return { x: entry.date.getTime(), y: weightValue };
                    })
                ).map(point => new Date(point.x).toISOString()),    // Convert timestamps back to UTC ISO strings for Plotly
                y: calculateLinearRegression(
                    validEntries.map(entry => {
                        let weightValue = entry.weight;
                        if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                            if (weightUnit === 'lbs') {
                                weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                            } else if (weightUnit === 'kg') {
                                weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                            }
                        }
                        return { x: entry.date.getTime(), y: weightValue };
                    })
                ).map(point => parseFloat(point.y.toFixed(1))),
                mode: 'lines',
                name: `Weight Trend (Linear)`,
                line: { color: 'rgb(0, 0, 0)', dash: 'dash' },
                type: 'scatter',
            },
            // --- Calorie Model Prediction trace ---
            {
                x: caloriePredictionPoints.map(point => new Date(point.x).toISOString()),
                y: caloriePredictionPoints.map(point => typeof point.y === 'number' && !isNaN(point.y) ? parseFloat(point.y.toFixed(1)) : null),    // Map y values and format
                mode: 'lines',
                name: `Weight Prediction (Calorie Model)`,
                line: { color: 'rgb(255, 165, 0)' },
                type: 'scatter',
            },
        ];

        // Add a horizontal line for the target weight if it exists
        if (userTargetWeight !== null && typeof userTargetWeight === 'number' && !isNaN(userTargetWeight)) {
            plotlyData.push({
                x: [new Date(minTimestamp).toISOString(), new Date(lastPredictedTimestamp).toISOString()], // Extend across the chart range
                y: [userTargetWeight, userTargetWeight], // A constant line at the target weight
                mode: 'lines',
                name: `Target Weight (${userProfile.targetWeight?.toFixed(1) || 'N/A'} ${userProfile.weightUnit || ''})`, // Use the user's entered target and unit
                line: { color: 'rgb(0, 128, 0)', dash: 'dashdot' }, // Green dash-dot line
                type: 'scatter',
            });
        }        

        // Add Milestone points as annotations
        const annotations = milestonePoints.map(milestone => ({
            x: new Date(milestone.x).toISOString(), // Position annotation at the milestone date
            y: milestone.y, // Position annotation at the predicted weight
            xref: 'x', // Reference x-axis
            yref: 'y', // Reference y-axis
            text: milestone.label, // The label for the milestone
            showarrow: true, // Show an arrow pointing to the point
            arrowhead: 2, // Arrow style
            ax: 0, // Annotation arrow x-position
            ay: -40, // Annotation arrow y-position (offset from the point)
            bgcolor: 'rgba(255, 255, 255, 0.8)', // Background color for the text
            bordercolor: 'rgb(192, 192, 192)', // Border color for the text box
            borderwidth: 1, // Border width
            borderpad: 4, // Padding around the text
            // Optional: Customize font, opacity, etc.
        }));

        return {
            caloriePredictionPoints: caloriePredictionPoints,
            milestonePoints: milestonePoints,
            plotlyData: plotlyData, // Return the calculated plotlyData
            minTimestamp: minTimestamp, // Return the calculated minTimestamp
            lastPredictedTimestamp: lastPredictedTimestamp, // Return the calculated lastPredictedTimestamp
            annotations: annotations // Return the calculated annotations
        };

    }, [entries, weightUnit, caloriePredictionPoints, milestonePoints, userProfile, predictionDays]); // Dependencies for memoization

    // Destructure everything we need for the Plot
    const {
        plotlyData,
        minTimestamp,
        lastPredictedTimestamp,
        annotations
    } = memoizedChartData;

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
            hovermode: 'closest',
            dragmode: 'pan',
            annotations,    // show milestone annotations
        }
    }, [weightUnit, minTimestamp, lastPredictedTimestamp, annotations]); // Dependencies for layout memoization  


    return (
        <div>
            <h1>Body Metrics Dashboard</h1>

            <div className="user-profile-section">
                <h2>User Profile</h2>
                {profileLoading && <p>Loading profile...</p>}
                {profileError && <p style={{ color: 'red' }}>{profileError}</p>}
                {profileMessage && <p style={{ color: 'green' }}>{profileMessage}</p>}

                <form onSubmit={handleSaveProfile}>
                    <div>
                        <label htmlFor="sex">Sex:</label>
                        <select id="sex" name="sex" value={localProfileData.sex} onChange={handleProfileInputChange} required>
                            <option value="">-- Select --</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="dateOfBirth">Date of Birth:</label>
                        <input type="date" id="dateOfBirth" name="dateOfBirth" value={localProfileData.dateOfBirth} onChange={handleProfileInputChange} required />
                    </div>
                    <div>
                        <label htmlFor="height">Height (inches):</label> {/* Assuming inches for now, can add unit toggle later */}
                        <input type="number" id="height" name="height" value={localProfileData.height} onChange={handleProfileInputChange} required step="0.1" />
                    </div>
                    <div>
                        <label htmlFor="activityLevel">Activity Level:</label>
                        <select id="activityLevel" name="activityLevel" value={localProfileData.activityLevel} onChange={handleProfileInputChange} required>
                            <option value="">-- Select --</option>
                            <option value="sedentary">Sedentary (little to no exercise)</option>
                            <option value="lightly_active">Lightly active (exercise 1-3 days/week)</option>
                            <option value="moderately_active">Moderately active (exercise 3-5 days/week)</option>
                            <option value="very_active">Very active (exercise 6-7 days/week)</option>
                            <option value="super_active">Super active (very intense excercise daily, or physically demanding job)</option>
                        </select>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <h4>Weight Goal</h4>
                        <div>
                            <label htmlFor="weightGoalType">Goal Type:</label>
                            <select id="weightGoalType" name="weightGoalType" value={localProfileData.weightGoalType} onChange={handleProfileInputChange}>
                                <option value="maintain">Maintain Weight</option>
                                <option value="lose">Lose Weight</option>
                                <option value="gain">Gain Weight</option>
                            </select>
                        </div>
                        {localProfileData.weightGoalType !== 'maintain' && (
                            <>
                                <div>
                                    <label htmlFor="targetWeight">Target Weight ({weightUnit}):</label>
                                    <input type="number" id="targetWeight" name="targetWeight" value={localProfileData.targetWeight} onChange={handleProfileInputChange} required={localProfileData.weightGoalType !== 'maintain'} step="0.1" />
                                </div>
                                <div>
                                    <label htmlFor="targetRate">Target Rate ({weightUnit}/week):</label>
                                    <input type="number" id="targetRate" name="targetRate" value={localProfileData.targetRate} onChange={handleProfileInputChange} required={localProfileData.weightGoalType !== 'maintain'} step="0.1" />
                                </div>
                            </>
                        )}
                    </div>

                    <button type="submit" disabled={saveProfileLoading}>
                        {saveProfileLoading ? 'Saving  Profile...' : 'Save Profile'}
                    </button>
                </form>

                {!isNaN(bmr) && <p>Calculated BMR: {bmr.toFixed(0)} calories/day</p>}
                {!isNaN(tdee) && <p>Calculated TDEE: {tdee.toFixed(0)} calories/day</p>}
                
                {!isNaN(targetCaloricIntake) && (
                    <p>Target Caloric Intake: {targetCaloricIntake.toFixed(0)} calories/day</p>
                )}

                {milestonePoints.length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                        <h4>Predicted Milestones</h4>
                        <ul>
                            {milestonePoints.map((milestone, index) => (
                                <li key={index}>
                                    {milestone.label}: {new Date(milestone.x).toLocaleDateString()} - {milestone.y.toFixed(1)} {weightUnit} ({milestone.bodyFat.toFixed(1)}% BF)
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <hr style={{ margin: '40px 0'}} />

            <h2>Log Body Metrics</h2>

            {saveError && <p style={{ color: 'red' }}>{saveError}</p>}
            {saveMessage && <p style={{ color: 'green' }}>{saveMessage}</p>}

            <form onSubmit={handleFormSubmit}>
                <div>
                    <label htmlFor="date">Date:</label>
                    <input type="date" id="date" ref={dateRef} required defaultValue={getTodaysDate()} />
                </div>
                <div>
                    <label htmlFor="weight">Weight ({weightUnit}):</label>
                    <input type="number" id="weight" ref={weightRef} required step="0.1" />
                    <button type="button" onClick={() => setWeightUnit('lbs')} disabled={weightUnit === 'lbs'}>lbs</button>
                    <button type="button" onClick={() => setWeightUnit('kg')} disabled={weightUnit === 'kg'}>kg</button>
                </div>
                <div>
                    <label htmlFor="bodyFat">Body Fat Percentage (%):</label>
                    <input type="number" id="bodyFat" ref={bodyFatRef} required step="0.1" />
                </div>
                <button type="submit" disabled={saveLoading}>
                     {saveLoading ? 'Saving...' : 'Save Entry'}
                </button>
            </form>

            <hr style={{ margin: '40px 0'}} />

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
                            <label htmlFor="bodyFatColumn">Body Fat Percentage (%):</label>
                            <select
                                id="bodyFatColumn"
                                value={columnMapping.bodyFat} // Bind value to state from hook
                                onChange={(e) => setColumnMapping({...columnMapping, bodyFat: e.target.value})} // Update state via hook
                                required
                            >
                                <option value="">-- Select Column --</option>
                                {csvHeaders.map(header => (
                                    // Use header as both key and value
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
                {!isParsing && !parsedCsvData && !importError && !importMessage && (
                    <p>No valid data or headers found in CSV after parsing. Ensure your CSV has headers and data rows.</p>
                )}
            </div>
            {/* --- End CSV Import Section --- */}

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
                    <form key={editingEntryId} onSubmit={handleEditFormSubmit}> {/* Use local handleEditFormSubmit */}
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
                    <button onClick={handleCancelEdit}>Cancel</button> {/* Use handleCancelEdit from hook */}

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
                                        // Use the unique entry.id as the key for efficiency
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
                    <div style={{ marginBottom: '20px' }}>
                        <label htmlFor="predictionDays">Forecast Days:</label>
                        <input
                            type="number"
                            id="predictionDays"
                            value={predictionDays}
                            onChange={(e) => setPredictionDays(parseInt(e.target.value) || 0)}
                            min="0"
                            step="1"
                            style={{ marginLeft: '10px', width: '80px' }}
                        />
                        <span> days</span>
                    </div>                    
                    {/* Show graph only if not loading/error and entries exist */}
                    {!fetchLoading && !fetchError && entries.length > 0 && (
                        <div style={{ width: '100%', maxWidth: '1280px', margin: '20px auto', height: '720px' }}>
                             {/* Render the Plotly chart */}
                            <Plot
                                data={plotlyData} // Pass the Plotly-formatted data
                                layout={memoizedLayout} // Pass the Plotly layout
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