// src/components/BodyMetricsDashboard.jsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { 
    collection, 
    addDoc, 
    serverTimestamp,
    query,
    orderBy,
    getDocs,
    deleteDoc,
    doc,
    updateDoc
} from 'firebase/firestore';
import { useAuth } from '../AuthContext.jsx';

import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

// Helper function to get today's date in YYYY-MM-DD format
const getTodaysDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const BodyMetricsDashboard = () => {
    const dateRef = useRef();
    const weightRef = useRef();
    const bodyFatRef = useRef();

    const [weightUnit, setWeightUnit] = useState('lbs');
    const [saveError, setSaveError] = useState(''); // Use specific state for save errors
    const [saveLoading, setSaveLoading] = useState(false); // Use specific state for save loading
    const [saveMessage, setSaveMessage] = useState(''); // Use specific state for save success message

    const [entries, setEntries] = useState([]); // State for fetched entries
    const [fetchLoading, setFetchLoading] = useState(true); // State for fetch loading
    const [fetchError, setFetchError] = useState(''); // State for fetch errors

    const [isEditing, setIsEditing] = useState(false);  // Initially not editing
    const [editingEntryId, setEditingEntryId] = useState(null); // No entry is being edited initially
    const [editFormData, setEditFormData] = useState(null); // No form data yet

    const [editError, setEditError] = useState(''); // State for edit form errors
    const [editMessage, setEditMessage] = useState(''); // State for edit form success message

    const { currentUser } = useAuth();
  
    const fetchEntries = useCallback(async () => {
        if (!currentUser) {
            setEntries([]);
            setFetchLoading(false);
            setFetchError('');
            console.log('Fetch Entries: No user, clearing entries.');
            return;
        }

        console.log('Fetch Entries: Attempting to fetch...');
        setFetchLoading(true);
        setFetchError(''); // Clear previous fetch errors before starting a new fetch

        try {
            const userMetricsCollectionRef = collection(
                db,
                'users',
                currentUser.uid,
                'bodyMetricsEntries'
            );

            const q = query(userMetricsCollectionRef, orderBy('date', 'asc'));

            const querySnapshot = await getDocs(q);

            const fetchedEntries = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();

                // Attempt to convert Firestore Timestamp to Date object
                const processedDate = data.date && typeof data.date.toDate === 'function' ? data.date.toDate() : null;

                fetchedEntries.push({
                    id: doc.id,
                    date: processedDate,
                    weight: data.weight,
                    // *** THE FIX IS HERE: Get the value from data.bodyFat ***
                    bodyFat: data.bodyFat, // Correctly use the field name 'bodyFat' from fetched data
                    weightUnit: data.weightUnit,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
                });
            });

            setEntries(fetchedEntries); // Update the entries state
            setFetchLoading(false);
            console.log('Fetch Entries: Fetched successfully. Number of entries:', fetchedEntries.length);
        } catch (error) {
            console.error('Fetch Entries Error: ', error);
            setFetchError('Failed to fetch entries: ' + error.message);
            setFetchLoading(false);
            setSaveMessage(''); // Clear save message if fetch fails
        }
    }, [currentUser]); // Dependency array for useCallback

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    // Function to handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!weightRef.current.value || !bodyFatRef.current.value || !dateRef.current.value) {
            return setFetchError('Please fill in all fields.');
        }

        const weight = parseFloat(weightRef.current.value);
        const bodyFat = parseFloat(bodyFatRef.current.value);

        if (isNaN(weight) || isNaN(bodyFat)) {
            return setSaveError('Weight and Body Fat must be numbers.');
        }
        if (bodyFat < 0 || bodyFat > 100) {
            return setSaveError('Body Fat Percentage must be between 0 and 100.');
        }

        setSaveError('');
        setSaveMessage('');
        setSaveLoading(true);        

        try {
            const userMetricsCollectionRef = collection(
                db,
                'users',
                currentUser.uid,
                'bodyMetricsEntries'
            );

            const weight = parseFloat(weightRef.current.value);
            const bodyFat = parseFloat(bodyFatRef.current.value);
            const dateString = dateRef.current.value;
            const [year, month, day] = dateString.split('-').map(Number);
            const date = new Date(year, month - 1, day);

            await addDoc(userMetricsCollectionRef, {
                date: date,
                weight: weight,
                bodyFat: bodyFat,
                weightUnit: weightUnit,
                createdAt: serverTimestamp(),
            });

            setSaveMessage('Entry added successfully!');
            console.log('Save Entry: Successful.');

            dateRef.current.value = getTodaysDate();
            weightRef.current.value = '';
            bodyFatRef.current.value = '';

            fetchEntries(); // Re-fetch entries after successful save

        } catch (error) {
            setSaveError('Failed to save entry: ' + error.message);
            console.error('Save Entry Error: ', error);
            setSaveMessage('');
        }

        setSaveLoading(false);
    };

    // Function to handle clicking the Edit button
    const handleEditClick = (entry) => {
        setIsEditing(true); // Set the state to indicate we are now editing
        setEditingEntryId(entry.id); // Store the ID of the entry to be updated

        // Prepare the data to populate the edit form
        // The date needs to be formatted as YYYY-MM-DD for the date input field
        const formattedDate = entry.date instanceof Date && !isNaN(entry.date.getTime())
            ? entry.date.toISOString().split('T')[0]    // Get the YYYY-MM-DD part
            : getTodaysDate();  // Fallback in case of an invalid date (shouldn't happen, but good practice)
        
        const initialEditData = {
            date: formattedDate,
            weight: typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight),
            bodyFat: typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat),
            weightUnit: entry.weightUnit, // Keep the original unit for context/display in the form
        };

        setEditFormData(initialEditData);

        console.log('handleEditClick: Prepared initial editFormData', initialEditData);
    };

    // Function to handle input changes within the edit form
    const handleEditInputChange = (e) => {
        const { name, value } = e.target;

        console.log('handleInputChange: Input changed:', { name, value});
        console.log('handleInputChange: Current editFormData BEFORE update:', editFormData);

        setEditFormData(prevFormData => {
            console.log('handleInputChange: Previous editFormData (inside functional update):', prevFormData);
            const updatedData = {
                ...prevFormData,
                [name]: value,
            };
            console.log('handleInputChange: Updated editFormData (inside functional update):', updatedData);
            return updatedData;
        });

        // Note: editFormData here will still show the old value right after setEditFormData call
        // The updated value is available in the next render cycle
    };

    // Function to handle entry update
    const handleUpdateEntry = async (e) => {
        e.preventDefault();     // Prevent the default form submission and page reload

        // Clear previous messages and errors related to editing
        setEditError('');   // Clear previous errors
        setEditMessage(''); // Clear previous success messages
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
        const dateString = editFormData?.date;

        // Check if essential fields are filled and numbers are valid
        if (!dateString || isNaN(weight) || isNaN(bodyFat)) {
            setEditError('Please fill in all fields with valid numbers.');
            return;
        }
        // Validate body fat percentage range
        if (bodyFat < 0 || bodyFat > 100) {
            setEditError('Body fat percentage must be between 0 and 100.');
            return;
        }

        try {
            // Get a reference to the specific document in Firestore to update
            const entryRef = doc(
                db,
                'users',
                currentUser.uid,
                'bodyMetricsEntries',
                editingEntryId
            );

            // Prepare the updated data object
            // Convert the date string from the form ("YYYY-MM-DD") back into a Date object for Firestore
            const [year, month, day] = dateString.split('-').map(Number);
            // Note: Month is 0-indexed in JavaScript Date objects, so subtract 1
            const updatedDate = new Date(year, month - 1, day);

            const updatedData = {
                date: updatedDate,
                weight: weight,
                bodyFat: bodyFat,
                // We are not allowing changing weightUnit in the edit form currently
            };

            // Prepare the update operation in Firestore
            await updateDoc(entryRef, updatedData);

            // Handle successful update
            setEditMessage('Entry updated successfully!');
            console.log(`Update Entry: Successfully updated entry with ID: ${editingEntryId}`);

            // Re-fetch all entries to ensure the table and graph display the updated data
            fetchEntries();

            // Exit editing mode after a short delay to allow the user to see the success message
            setTimeout(() => {
                setIsEditing(false);
                setEditingEntryId(null);
                setEditFormData(null);
                setEditMessage('');
                setEditError('');
            }, 1500);   // Hide the edit form and messages after 1.5 seconds
        } catch (error) {
            setEditError('Failed to update entry: ' + error.message);
            console.error('Update Entry Error: ', error);
            setEditMessage('');
        }
        // Optional: Reset loading state where if you have one
    };

    // Function to handle entry deletion
    const handleDeleteEntry = async (entryId) => {
        if (!currentUser || !entryId) {
            console.error('Delete Entry: No user or entry ID provided.');
            return;
        }

        // Optional confirm
        if (window.confirm('Are you sure you want to delete this entry?')) {
            try {
                // Get a reference to the document to delete
                const entryRef = doc(
                    db,
                    'users',
                    currentUser.uid,
                    'bodyMetricsEntries',
                    entryId // The ID of the document to delete
                );

                await deleteDoc(entryRef);

                console.log(`Delete Entry: Successfully deleted entry with ID: ${entryId}`);
                fetchEntries(); // Re-fetch entries after successful delete to update the display
            } catch (error) {
                console.error('Delete Entry Error: ', error);
                // You might want to add some state to display a delete error message
            }
        }
    }

    // --- Prepare data for the chart ---
    // This logic runs every time the component renders, which is fine as it depends on the state (entries, weightUnit)
    const chartData = {
        // Map dates for the X-axis labels
        labels: entries.map(entry =>
            entry.date instanceof Date && !isNaN(entry.date.getTime())
                ? entry.date.toLocaleDateString()
                : ''    // Use empty string for invalid dates
        ),
        datasets: [
            {
                label: `Weight (${weightUnit})`,
                data: entries.map(entry => {
                    let weightValue = typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight);

                    // Apply conversion only if the entry's stored unit is different from the current state unit
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            weightValue = weightValue * 2.20462;
                        } else if (weightUnit === 'kg') {
                            weightValue = weightValue * 0.453592;
                        }
                    }
                    return typeof weightValue === 'number' && !isNaN(weightValue) ? parseFloat(weightValue.toFixed(1)) : null;
                }),
                borderColor: 'rgb(75, 192, 192)',   // Line color
                backgroundColor: 'rgba(75, 192, 192, 0.5)', // Area under the line color
                tension: 0.1,   // Smooth the line (value between 0 and 1)
                pointRadius: 5, // Size of the points on the line
                pointHoverRadius: 7,    // Size of points on hover
            },
            // --- Add datasets for Fat Mass and Lean Mass (Optional for now, can add later)
            {
                label: `Fat Mass (${weightUnit})`,
                data: entries.map(entry => {
                    const weight = typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight);
                    const bodyFatPercentage = typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat);

                    // Only calculate if weight and body fat are valid numbers
                    let fatMass = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage))
                        ? (weight * (bodyFatPercentage / 100))
                        : NaN;  // Set to NaN if inputs are invalid

                    // Apply conversion based on the current weightUnit state
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            fatMass = fatMass * 2.20462;
                        } else if (weightUnit === 'kg') {
                            fatMass = fatMass * 0.453592;
                        }
                    }
                    // Return the processed fat mass value or null if not a valid number
                    return typeof fatMass === 'number' && !isNaN(fatMass) ? parseFloat(fatMass.toFixed(1)) : null;
                }),
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                tension: 0.1,
                pointRadius: 5,
                pointHoverRadius: 7,
            },
            {
                label: `Lean Mass (${weightUnit})`,
                data: entries.map(entry => {
                    const weight = typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight);
                    const bodyFatPercentage = typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat);
                    let leanMass = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage))
                        ? (weight - (weight * (bodyFatPercentage / 100)))
                        : NaN;  // Set to NaN if inputs are invalid

                    // Apply conversion based on the current weightUnit state
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            leanMass = leanMass * 2.20462;
                        } else if (weightUnit === 'kg') {
                            leanMass = leanMass * 0.453592;
                        }
                    }
                    return typeof leanMass === 'number' && !isNaN(leanMass) ? parseFloat(leanMass.toFixed(1)) : null;
                }),
                borderColor: 'rgb(53, 162, 135)',
                backgroundColor: 'rgba(53, 162, 235, 0.5)',
                tension: 0.1,
                pointRadius: 5,
                pointHoverRadius: 7,
            },
        ],
    };

    // --- Chart Options ---
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: `Body Metrics Progress Over Time (${weightUnit})`,
            },
            tooltip: {
                callbacks: {
                    title: function(context) {
                        const dateLabel = chartData.labels[context[0].dataIndex];
                        return dateLabel;
                    },
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }

                        if (context.raw !== null && typeof context.raw === 'number' && !isNaN(context.raw)) {
                            label += `${context.raw.toFixed(1)} ${weightUnit}`;
                        } else {
                            label += 'N/A';
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Date'
                }
            },
            y: {
                title: {
                    display: true,
                    text: `Measurement (${weightUnit})`
                },
            }
        }
    };
    // --- End Chart Options ---

    return (
        <div>
            <h2>Log Body Metrics</h2>
            {saveError && <p style={{ color: 'red' }}>{saveError}</p>}
            {saveMessage && <p style={{ color: 'green' }}>{saveMessage}</p>}

            <form onSubmit={handleSubmit}>
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
                <button type="submit" disabled={saveLoading}>Save Entry</button>
            </form>
            
            <hr style={{ margin: '40px 0'}} />

            {/* --- Conditional Rendering Starts Here --- */}
            {isEditing ? (
                // --- Section to display the Edit Form (when isEditing is true) ---
                <div className="edit-form-container">
                    <h3>Edit Entry (ID: {editingEntryId})</h3>
                    {console.log ('Render: isEditing is true. editFormData is:', editFormData)}
                    {/* Add state for edit form error/message display here if needed later */}
                    {editError && <p style={{ color: 'red' }}>{editError}</p>}
                    {editMessage && <p style={{ color: 'green' }}>{editMessage}</p>}

                    {/* Edit Form */}
                    <form key={editingEntryId} onSubmit={handleUpdateEntry}>
                        <div>
                            <label htmlFor="editDate">Date:</label>
                            <input
                                type="date"
                                id="editDate"
                                name="date" // Important for the onChange hanlder
                                value={editFormData?.date || ''}  // Bind value to editForm state
                                onChange={handleEditInputChange}    // Call hanlder when input changes
                                required />
                        </div>
                        <div>
                            {/* Display the unit from the edited entry's data */}
                            <label htmlFor="editWeight">Weight ({editFormData?.weightUnit || ''}):</label>
                            <input
                                type="number"
                                id="editWeight"
                                name="weight" // Important for the onChange hanlder
                                value={editFormData?.weight || ''}  // Bind value to editForm state
                                onChange={handleEditInputChange}    // Call hanlder when input changes
                                required
                                step="0.1" />
                                {/* Note: We are not allowing changing the unit during edit for simplicity */}
                        </div>
                        <div>
                            <label htmlFor="editBodyFat">Body Fat Percentage (%):</label>
                            <input
                                type="number"
                                id="editBodyFat"
                                name="bodyFat" // Important for the onChange hanlder
                                value={editFormData?.bodyFat || ''}  // Bind value to editForm state
                                onChange={handleEditInputChange}    // Call hanlder when input changes
                                required
                                step="0.1" />
                        </div>
                        {/* Save Changes button:Optional: Add disabled={saveLoading} if you implement a separate loading state for updates */}
                        <button type="submit">Save Changes</button>
                    </form>
                    {/* The Cancel button can remain outside the form if it just changes state */}
                    <button onClick={() => setIsEditing(false)}>Cancel</button>
                    {/* If the Save button was inside the form, you might put Cancel inside the form with type="button" */}
                </div>
                // --- End Edit Form Section ---
            ) : (
                // --- Section to display Historical Data (Table and Graph) (when isEditing is false) ---
                // Use a React Fragment to group the table and graph sections
                <>
                    {/* Section to display historical data */}
                    <h3>Historical Entries</h3>
                    {fetchLoading && <p>Loading entries...</p>}
                    {fetchError && <p style={{ color: 'red' }}>{fetchError}</p>}
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
                                    let weight = typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight);

                                    let bodyFatPercentage;
                                    // Process based on its type
                                    if (typeof entry.bodyFat === 'number') {
                                        bodyFatPercentage = entry.bodyFat;
                                    } else if (typeof entry.bodyFat === 'string') {
                                        bodyFatPercentage = parseFloat(entry.bodyFat);
                                    } else {
                                        bodyFatPercentage = parseFloat(entry.bodyFat);
                                    }

                                    // let fatMassDisplay = (weight * (bodyFatPercentage / 100));
                                    // let leanMassDisplay = weight - fatMassDisplay;

                                    // --- Calculate Fat Mass and Lean Mass based on processed values --- (Replaced the above two lines of code)
                                    const fatMassDisplay = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage)) ? (weight * (bodyFatPercentage / 100)) : NaN;
                                    const leanMassDisplay = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage)) ? (weight - fatMassDisplay) : NaN;

                                    // Apply conversion for display in table based on the current weightUnit state
                                    let weightDisplay = weight;
                                    let fatMassTableDisplay = fatMassDisplay;
                                    let leanMassTableDisplay = leanMassDisplay;
                                    // --- End of replaced code ---
                                    
                                    // Perform the conversion if the entry's unit is different from the current unit state
                                    if (entry.weightUnit !== weightUnit) {
                                        if (weightUnit === 'lbs') {
                                            weightDisplay = weight * 2.20462;
                                            fatMassTableDisplay = fatMassDisplay * 2.20462;
                                            leanMassTableDisplay = leanMassDisplay * 2.20462;
                                        } else if (weightUnit === 'kg') {
                                            weightDisplay = weight * 0.453592;
                                            fatMassTableDisplay = fatMassDisplay * 0.453592;
                                            leanMassTableDisplay = leanMassDisplay * 0.453592;
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

                    <hr style={{ margin: '40px 0'}} />

                    {/* Section to display the graph */}
                    <h3>Progress Graph</h3>
                    {/* Show graph only if not loading/error and entries exist */}
                    {!fetchLoading && !fetchError && entries.length > 0 && (
                        <div style={{ width: '100%', maxWidth: '800px', margin: '20px auto', height: '400px' }}>
                            {/* Render the Line chart, passing the prepared data and options */}
                            <Line data={chartData} options={options} />
                        </div>
                    )}
                    {/* Only show "Log entries..." if not loading/error, list is empty, AND we are NOT editing */}
                    {!fetchLoading && !fetchError && entries.length === 0 && <p>Log entries to see your progress graph.</p>}
                </>
                // --- End Historical Data Section ---
            )}
            {/* --- Conditional Rendering Ends Here --- */}
        </div>
    );
};

export default BodyMetricsDashboard;