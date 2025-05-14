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

import Papa from 'papaparse';

// Helper function to get today's date in YYYY-MM-DD format
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
    
    // State for CSV Import process
    const [selectedFile, setSelectedFile] = useState(null);
    const [csvContent, setCsvContent] = useState(null);
    const [parsedCsvData, setParsedCsvData] = useState(null);
    
    // State for CSV column mapping
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [columnMapping, setColumnMapping] = useState({
        date: '',
        weight: '',
        bodyFat: '',
        unit: 'lbs',    // Default, user can change
    });

    // States for CSV Import process feedback
    const [importError, setImportError] = useState(''); // State for import errors
    const [importMessage, setImportMessage] = useState(''); // State for import success message
    const [isParsing, setIsParsing] = useState(false);


    const { currentUser } = useAuth();
  


    /**
     * Helper function to clear all import-related states and reset the UI
     */
    const clearImportState = () => {
        setSelectedFile(null);
        setCsvContent(null);
        setParsedCsvData(null);
        setCsvHeaders([]);
        setColumnMapping({ date: '', weight: '', bodyFat: '', unit: 'lbs' });
        setImportError('');
        setImportMessage('');
        setIsParsing(false);
    };



    /**
     * Function to handle file selection
     * @param {Event} event - The event object
     */
    const handleFileSelect = (event) => {
        const file = event.target.files[0]; // Get the selected file

        // Clear previous content and file info
        setSelectedFile(null);
        setCsvContent(null);
        setParsedCsvData(null);
        setCsvHeaders([]);
        setColumnMapping({ date: '', weight: '', bodyFat: '', unit: 'lbs' });
        setImportError('');
        setImportMessage('');
        setIsParsing(false);    // Ensure parsing state is false initially

        if (file && file.type === 'text/csv') {
            setSelectedFile(file);  // Store the file object

            const reader = new FileReader();    // Create a FileReader instance
            
            // Define what happens when the file is successfully read
            reader.onload = (e) => {
                const content = e.target.result;    // Get the file content (as a string)
                setCsvContent(content); // Store raw content
                setIsParsing(true); // Set parsing loading state
                parseCsv(content);  // Call the parsing function with the content
            };

            // Define what happens if there's an error reading the file
            reader.onerror = (error) => {
                console.error('Error reading file:', error);
                setImportError('Failed to read file.');
                setCsvContent(null);    // Ensure content state is clear on error
                setIsParsing(false);
            };
            
            // Start reading the file as text
            reader.readAsText(file);
        } else {
            console.log('No file selected or invalid file type.');
            setImportError('Please select a valid CSV file.');
            setSelectedFile(null);
            setCsvContent(null);
            setIsParsing(false);
        }
        // Optional: Reset the file input value so the same file can be selected again after clearing
        event.target.value = '';
    };



        /**
     * Function to parse the CSV content using PapaParse
     * @param {string} content - The content of the CSV file
     */ 
    const parseCsv = (content) => {
        // Clear previous parsed data, headers, etc.
        setParsedCsvData(null);
        setCsvHeaders([]);
        setColumnMapping({ date: '', weight: '', bodyFat: '', unit: 'lbs' });
        setImportError('');
        setImportMessage('');
        // isParsing is set by handleFileSelect before calling this

        Papa.parse(content, {
            header: true, // Treat the first row as headers
            skipEmptyLines: true, // Skip any empty rows
            complete: (results) => {
                console.log('PapaParse results:', results);
                if (results.errors.length) {
                    console.error('CSV Parsing Errors:', results.errors);
                    setImportError('Error parsing CSV: ' + results.errors[0].message);
                    setParsedCsvData(null);
                    setCsvHeaders([]);
                } else if (!results.data || results.data.length === 0) {
                     // Handle case where file was parsed but no data rows were found (e.g., only headers)
                    console.log('CSV parsed, but no data rows found.');
                    setImportError('CSV parsed, but no data rows found.');
                    setParsedCsvData(null);
                    setCsvHeaders([]); // Still show headers if they exist, allows re-selection if needed
                     if (results.meta && results.meta.fields) {
                         setCsvHeaders(results.meta.fields);
                     }
                }
                 else {
                    setParsedCsvData(results.data); // Store the parsed data array (rows as objects)
                    // Extract headers from meta.fields - this array contains the column names
                    setCsvHeaders(results.meta.fields || []);
                    console.log('CSV Parsed successfully. Number of rows:', results.data.length, 'Headers:', results.meta.fields);
                     setImportMessage('CSV parsed. Please map the columns.'); // Message for the next step
                }
                 setIsParsing(false); // Parsing is complete regardless of success/failure
            },
            error: (error) => { // General error handler for PapaParse (less common than results.errors)
                 console.error('PapaParse general error:', error);
                 setImportError('An error occurred during parsing.');
                 setParsedCsvData(null);
                 setCsvHeaders([]);
                 setIsParsing(false);
            }
        });
    };



    /**
     * Function to fetch historical entries from Firestore
     */
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
                    bodyFat: data.bodyFat,
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
            // Keep save messages visible if fetch fails
        }
    }, [currentUser]); // Dependency array for useCallback



    /**
     * Effect hook to fetch entries when the component mounts or correntUser changes
     */
    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]); // fetchEntries is a dependency because it's defined outside useEffect but used inside



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
            const userMetricsCollectionRef = collection(
                db,
                'users',
                currentUser.uid,
                'bodyMetricsEntries'
            );

            // const weight = parseFloat(weightRef.current.value);
            // const bodyFat = parseFloat(bodyFatRef.current.value);
            const dateString = dateRef.current.value;
            // Convert the date string "YYYY-MM-DD" to a Date object for Firestore Timestamp
            const [year, month, day] = dateString.split('-').map(Number);
            const date = new Date(year, month - 1, day);    // Month is 0-indexed in JS Date

            // Add the new document to the collection
            await addDoc(userMetricsCollectionRef, {
                date: date,
                weight: weight,
                bodyFat: bodyFat,
                weightUnit: weightUnit, // Save the unit used for this entry
                createdAt: serverTimestamp(),   // Use Firestore server timestamp
            });

            setSaveMessage('Entry added successfully!');
            console.log('Save Entry: Successful.');

            // Clear the form fields after successful submission
            dateRef.current.value = getTodaysDate();    // Reset date field to today's date
            weightRef.current.value = '';
            bodyFatRef.current.value = '';

            // Re-fetch entries after successful save
            fetchEntries();

        } catch (error) {
            setSaveError('Failed to save entry: ' + error.message);
            console.error('Save Entry Error: ', error);
            setSaveMessage('');
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

        setEditFormData(initialEditData);   // Set the edit form data state

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
        console.log('handleInputChange: Input changed:', { name, value});
        console.log('handleInputChange: Current editFormData BEFORE update:', editFormData);
        // --- End logging ---

        // Use functional state update for reliability, especially with multiple rapid changes
        setEditFormData(prevFormData => {
            // --- Console logs for debugging state updates ---
            console.log('handleInputChange: Previous editFormData (inside functional update):', prevFormData);
            const updatedData = {
                ...prevFormData,    // Spread the previous state data
                [name]: value,  // Update the specific field [name] with the new value
            };
            console.log('handleInputChange: Updated editFormData (inside functional update):', updatedData);
            // --- End logging ---
            return updatedData; // Return the new state object
        });
    };



    /**
     * Function to handle an entry in Firestore
     * @param {Object} e - The event object
     * @returns {Promise<void>}
     */
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
            // Note: Validation could be more specific (e.g., date format)
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
                db, // Your Firebase Firestore instance
                'users',    // The 'users' collection
                currentUser.uid,    // The current user's ID (subcollection)
                'bodyMetricsEntries',   // The 'bodyMetricsEntries' collection (subcollection)
                editingEntryId  // The ID of the document you want to update
            );

            // Prepare the updated data object
            // Convert the date string from the form ("YYYY-MM-DD") back into a Date object for Firestore
            const [year, month, day] = dateString.split('-').map(Number);
            // Note: Month is 0-indexed in JavaScript Date objects, so subtract 1
            const updatedDate = new Date(year, month - 1, day);

            const updatedData = {
                date: updatedDate,  // Save the converted Date object
                weight: weight,     // Save the parsed number for weight
                bodyFat: bodyFat,   // Save the parsed number for body fat
                // We are not allowing changing weightUnit in the edit form currently
                // Do not update 'createdAt'
            };

            // Perform the update operation in Firestore
            await updateDoc(entryRef, updatedData);

            // Handle successful update
            setEditMessage('Entry updated successfully!');
            console.log(`Update Entry: Successfully updated entry with ID: ${editingEntryId}`);

            // Re-fetch all entries to ensure the table and graph display the updated data
            // This is important to show the updated entry in the list and recalculate the chart data
            fetchEntries();

            // Exit editing mode after a short delay to allow the user to see the success message
            setTimeout(() => {
                setIsEditing(false);    // Set isEditing back to false
                setEditingEntryId(null);    // Clear the ID of the entry that was being edited
                setEditFormData(null);  // Clear the data from the edit form state
                setEditMessage(''); // Clear the success message after returning to the list view
                setEditError('');   // Also clear any leftover error message
            }, 1500);   // Hide the edit form and messages after 1.5 seconds
        } catch (error) {
            // Handle errors during the update process
            setEditError('Failed to update entry: ' + error.message);
            console.error('Update Entry Error: ', error);
            setEditMessage(''); // Clear the success message if there was an error
        }
        // Optional: Reset loading state where if you have one
    };



    /**
     * Function to handle entry deletion
     * @param {string} entryId - The ID of the entry to be deleted
     * @returns {Promise<void>}
     */
    const handleDeleteEntry = async (entryId) => {
        if (!currentUser || !entryId) {
            console.error('Delete Entry: No user or entry ID provided.');
            return;
        }

        // Optional confirm using browser's built-in confirm dialog
        if (window.confirm('Are you sure you want to delete this entry?')) {
            try {
                // Get a reference to the document to delete
                const entryRef = doc(
                    db, // Your Firestore database instance
                    'users',    // The 'users' collection
                    currentUser.uid,    // The current user's ID (subcollection)
                    'bodyMetricsEntries',   // The 'bodyMetricsEntries' collection (subcollection)
                    entryId // The ID of the document to delete
                );

                // Delete the document from Firestore
                await deleteDoc(entryRef);

                console.log(`Delete Entry: Successfully deleted entry with ID: ${entryId}`);

                // Re-fetch entries after successful delete to update the display
                fetchEntries();
            } catch (error) {
                console.error('Delete Entry Error: ', error);
                // Optional: You might want to add some state to display a delete error message
                // setFetchError('Failed to delete entry: ' + error.message); // Or a dedicated delete error state
            }
        }
    };



    /**
     * Function to handle confirming column mapping (placeholder - can add validation/preview here)
     */
    const handleConfirmMapping = () => {
        // Check if required fields are selected
        if (!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat) {
            setImportError('Cannot import: data not parsed or columns not mapped.');
            return;
        }
        console.log('Attempting to import data with mapping:', columnMapping);
        setImportMessage('Importing data...');
        setImportError('');
        // At this point, the UI changes automatically based on columnMapping state
    };



    /**
     * Function to handle the final Import Mapped Data button click (saving logic goes here)
     * @returns {Promise<void>}
     */
    const handleImportCsv = async () => {
        // Basic check if data is parsed and mapping is complete
        if (!parsedCsvData || !columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat) {
            setImportError('Cannot import: data not parsed or columns not fully mapped.');
            return;
        }
        console.log('Attempting to import data with mapping:', columnMapping);
        setImportMessage('Importing data...'); // Update message
        setImportError(''); // Clear errors
        // Optional: Add loading state for the import button (e.g., setIsImporting(true))

        const entriesToSave = [];
        const failedEntries = [];   // To track rows that couldn't be saved

        // Interate through parsed data and prepare entries
        for (const row of parsedCsvData) {
            // Use the column mapping to get the correct value from the row
            const dateValue = row[columnMapping.date];
            const weightValue = row[columnMapping.weight];
            const bodyFatValue = row[columnMapping.bodyFat];
            const unitValue = columnMapping.unit;   // Get unit from mapping state

            // --- Data Validation and Preparation ---
            let parsedDate = null;
            if (dateValue) {
                // Attempt to parse the date string - PapaParse reads everything as strings
                // Common formats are YYYY-MM-DD, MM/DD/YYYY, etc. You might need more robust parsing here.
                // For simplicity, let's try parsing directly or using a library like date-fns parse
                // Example basic parsing for YYYY-MM-DD or MM/DD/YYYY
                try {
                    // Try parsing as YYYY-MM-DD first
                    const [y, m, d] = dateValue.split('-').map(Number);
                    let dateObj = new Date(y, m - 1, d);    // Month is 0-indexed
                    if (!isNaN(dateObj.getTime())) {
                        parsedDate = dateObj;
                    } else {
                        // Try parsing as MM/DD/YYYY
                        const [month, day, year] = dateValue.split('/').map(Number);
                        dateObj = new Date(year, month - 1, day);
                        if (!isNaN(dateObj.getTime())) {
                            parsedDate = dateObj;
                        }
                    }
                } catch (e) {
                    console.warn('Could not parse date for row:', row, 'Error:', e);
                    // Date parsing failed
                }
            }

            const parsedWeight = parseFloat(weightValue);
            const parsedBodyFat = parseFloat(bodyFatValue);

            // Validate if parsed values are valid numbers and date is valid
            if (parsedDate && !isNaN(parsedWeight) && !isNaN(parsedBodyFat) && parsedBodyFat >= 0 && parsedBodyFat <= 100) {
                // Data is valid, add to entries to save
                entriesToSave.push({
                    date: parsedDate,
                    weight: parsedWeight,
                    bodyFat: parsedBodyFat,
                    weightUnit: unitValue,  // Use the unit from the mapping state
                    createdAt: serverTimestamp(),  // Use server timestamp for creation
                });
            } else {
                // Data is invalid, log it and add to failed list
                console.warn('Skipping invalid row during import:', row, 'Parsed:', { date: parsedDate, weight: parsedWeight, bodyFat: parsedBodyFat });
                failedEntries.push(row);
            }
            // --- End Data Validation and Preparation ---
        }

        if (entriesToSave.length === 0) {
            setImportError('No valid entries found to import after processing.');
            setImportMessage('');
            console.log('Import failed: No valid entries found.');
            // Optional: Reset states or keep showing the mapping
            // setIsImporting(false);
            return;
        }

        console.log(`Attempting to save ${entriesToSave.length} valid entries...`);

        // --- Save Entries to Firestore ---
        try {
            const userMetricsCollectionRef = collection(
                db,
                'users',
                currentUser.uid,
                'bodyMetricsEntries'
            );

            // Use a batched write for efficiency if importing many entries
            // For simplicity now, let's save them one by one, but batching is better for large imports
            // TODO: Implement batching for large imports
            for (const entryData of entriesToSave) {
                await addDoc(userMetricsCollectionRef, entryData);
            }

            const successCount = entriesToSave.length;
            const failCount = failedEntries.length;
            const totalCount = parsedCsvData.length;

            let finalMessage = `Import complete! Succesfully imported ${successCount} out of ${totalCount} rows.`;
            if (failCount > 0) {
                finalMessage += ` ${failCount} rows were skipped due to validation errors.`;
                console.warn('Skipped rows during import:', failedEntries);
                setImportError(`Validation errors occurred for ${failCount} rows. Check console for details.`);
            } else {
                setImportError(''); // Clear any previous error if all were successful
            }

            setImportMessage(finalMessage);
            console.log('Import successful.');

            // Re-fetch entries to update the table and graph
            fetchEntries();

            // Optional: Clear import state after successful import
            // setTimeout(() => { clearImportState(); }, 3000); // Clear after 3 seconds
        
        } catch (error) {
            console.error('Error saving imported entries to Firestore:', error);
            setImportErorr('An error occurred while saving entries to Firestore.');
            setImportMessage('');   // Clear success message on error
        }
        // Optional: setIsImporting(false); // Reset loading state
    };



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
                            // Convert from the entry's unit (which must be kg if not lbs) to lbs
                            weightValue = entry.weightUnit === 'kg' ? weightValue * 2.20462 : weightValue;
                        } else if (weightUnit === 'kg') {
                            // Convert from the entry's unit (which must be lbs if not kg) to kg
                            weightValue = entry.weightUnit === 'lbs' ? weightValue * 0.453592 : weightValue;
                        }
                    }
                    return typeof weightValue === 'number' && !isNaN(weightValue) ? parseFloat(weightValue.toFixed(1)) : null;
                }),
                borderColor: 'rgb(75, 192, 192)',    // Line color
                backgroundColor: 'rgba(75, 192, 192, 0.5)', // Area under the line color
                tension: 0.1,    // Smooth the line (value between 0 and 1)
                pointRadius: 5, // Size of the points on the line
                pointHoverRadius: 7,    // Size of points on hover
            },
            // --- Add datasets for Fat Mass and Lean Mass ---
            {
                label: `Fat Mass (${weightUnit})`,
                data: entries.map(entry => {
                    const weight = typeof entry.weight === 'number' ? entry.weight : parseFloat(entry.weight);
                    const bodyFatPercentage = typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat);

                    // Calculate fat mass in the entry's original unit
                    let fatMass = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage))
                        ? (weight * (bodyFatPercentage / 100))
                        : NaN;  // Set to NaN if inputs are invalid

                    // Apply conversion based on the current weightUnit state for display
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            fatMass = entry.weightUnit === 'kg' ? fatMass * 2.20462 : fatMass;
                        } else if (weightUnit === 'kg') {
                            fatMass = entry.weightUnit === 'lbs' ? fatMass * 0.453592 : fatMass;
                        }
                    }
                    // Return the processed fat mass value or null if not a valid number
                    return typeof fatMass === 'number' && !isNaN(fatMass) ? parseFloat(fatMass.toFixed(1)) : null;
                }),
                borderColor: 'rgb(255, 99, 132)', // Reddish
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
                     // Calculate lean mass in the entry's original unit
                    let leanMass = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage))
                        ? (weight - (weight * (bodyFatPercentage / 100))) // Use calculated fat mass or recalculate
                        : NaN;  // Set to NaN if inputs are invalid

                    // Apply conversion based on the current weightUnit state for display
                    if (entry.weightUnit && entry.weightUnit !== weightUnit) {
                        if (weightUnit === 'lbs') {
                            leanMass = entry.weightUnit === 'kg' ? leanMass * 2.20462 : leanMass;
                        } else if (weightUnit === 'kg') {
                            leanMass = entry.weightUnit === 'lbs' ? leanMass * 0.453592 : leanMass;
                        }
                    }
                    return typeof leanMass === 'number' && !isNaN(leanMass) ? parseFloat(leanMass.toFixed(1)) : null;
                }),
                borderColor: 'rgb(53, 162, 235)', // Bluish
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
                position: 'top',    // Position legend at the top
            },
            title: {
                display: true,
                text: `Body Metrics Progress Over Time (${weightUnit})`,
            },
            tooltip: {
                callbacks: {
                    // Customize tooltip title to show the date
                    title: function(context) {
                        const dateLabel = chartData.labels[context[0].dataIndex];
                        return dateLabel;
                    },
                    // Customize tooltip label to show the weight
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }

                        // Check if the raw value is a valid number before formatting
                        if (context.raw !== null && typeof context.raw === 'number' && !isNaN(context.raw)) {
                            label += `${context.raw.toFixed(1)} ${weightUnit}`;
                        } else {
                            label += 'N/A'; // Display N/A for invalid data points
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
                    text: 'Date'    // X-axis title
                }
            },
            y: {
                title: {
                    display: true,
                    text: `Measurement (${weightUnit})` // Y-axis title reflecting the current unit
                },
                // Optional: Suggest minimum value for the Y-axis if needed
                // beginAtZero: true,
            }
        }
    };
    // --- End Chart Options ---



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
                    {saveLoading ? 'Saving...' : 'Save Entry'}  {/* Button text changes when saving */}
                </button>
            </form>
            
            <hr style={{ margin: '40px 0'}} />

            {/* --- CSV Import Section --- */}
            <div className="csv-import-section">    {/* Optional class for styling */}
                <h3>Import Entries from CSV</h3>
                
                {/* Display important errors and messages */}
                {importError && <p style={{ color: 'red' }}>{importError}</p>}
                {importMessage && <p style={{ color: 'green' }}>{importMessage}</p>}

                {/* Conditional rendering based on import process state */}

                {/* 1. Show File Input: Visible initially, or after clearing/completing an import (if no error) */}
                {(!csvContent && !isParsing && !importError) || (parsedCsvData && columnMapping.date && columnMapping.weight && columnMapping.bodyFat && !importError) ? (
                    <input
                        type="file"
                        accept=".csv" // Accept only CSV files
                        onChange={handleFileSelect} // Call handler when file is selected
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
                    <div className="column-mapping-form">   {/* Optional class for styling */}
                        <h4>Map CSV Columns to Data Fields</h4>
                        <p>Select which column from your CSV corresponds to each required field:</p>

                        {/* Date Column Mapping */}
                        <div>
                            <label htmlFor="dateColumn">Date Column:</label>
                            <select 
                                id="dateColumn"
                                value={columnMapping.date}
                                onChange={(e) => setColumnMapping({...columnMapping, date: e.target.value})}
                                required
                            >
                                <option value="">-- Select Column --</option>
                                {/* Populate options with CSV headers */}
                                {csvHeaders.map(header => (
                                    // Use header as both key and value
                                    <option key={header} value={header}>{header}</option>
                                ))}
                            </select>
                        </div>

                        {/* Weight Column Mapping */}
                        <div>
                            <label htmlFor="weightColumn">Weight Column:</label>
                            <select
                                id="weightColumn"
                                value={columnMapping.weight}
                                onChange={(e) => setColumnMapping({...columnMapping, weight: e.target.value})}
                                required
                            >
                                <option value="">-- Select Column --</option>
                                {csvHeaders.map(header => (
                                    <option key={header} value={header}>{header}</option>
                                ))}
                            </select>
                        </div>

                        {/* Body Fat Column Mapping */}
                        <div>
                            <label htmlFor="bodyFatColumn">Body Fat Column:</label>
                            <select
                                id="bodyFatColumn"
                                value={columnMapping.bodyFat}
                                onChange={(e) => setColumnMapping({...columnMapping, bodyFat: e.target.value})}
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
                                value={columnMapping.unit}
                                onChange={(e) => setColumnMapping({...columnMapping, unit: e.target.value})}
                                required
                            >
                                <option value="lbs">lbs</option>
                                <option value="kg">kg</option>
                            </select>
                            {/* Optional: Hint for the user */}
                            <small>Select the unit used for weight in your CSV data.</small>
                        </div>

                        {/* Confirm Mapping Button - Enabled when all required columns are selected */}
                        <button onClick={handleConfirmMapping} disabled={!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat}>Confirm Mapping</button>

                        {/* Button to clear/restart the import process */}
                        <button onClick={clearImportState}>Cancel/Clear Import</button>
                    </div>
                ) : null    /* Don't render mapping form otherwise */}

                {/* 4. Show Ready to Import Section: Visible after parsing is successful AND mapping is complete */}
                {parsedCsvData && columnMapping.date && columnMapping.weight && columnMapping.bodyFat ? (
                    <div className="import-ready-section">  {/* Optional class */}
                        {/* Optional: Show a summary of rows to be imported */}
                        {!importMessage.includes('Importing') && ( // Don't show count message while importing
                            <p>{parsedCsvData.length} rows parsed. Ready to import with unit: {columnMapping.unit}.</p>
                        )}

                        {/* Final Import button - Calls the function that saves to Firestore */}
                        <button onClick={handleImportCsv} /* Optional: Add loading state here */>Import Mapped Data</button>

                        {/* Buttons to go back to mapping or clear */}
                        <button onClick={() => setColumnMapping({ date: '', weight: '', bodyFat: '', unit: 'lbs' })}>Remap Columns</button> {/* Reset mapping state */}
                        <button onClick={clearImportState}>Cancel/Clear Import</button> {/* Clear all import state */}
                    </div>
                ) : null /* Don't render ready section otherwise */}

                {/* Show a message if parsing is complete but no data or headers were found, and no specific error is shown */}
                {!isParsing && !parsedCsvData && csvContent && !importError && !importMessage && (
                    <p>No valid data or headers found in CSV after parsing. Ensure your CSV has headers and data rows.</p>
                )}
            </div>
            {/* --- End CSV Parsing Section --- */}

                     

            {/* Leftover snippet of code from CSV import method: Import CSV button - may need to be moved */}
            {/*
                <input 
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect} />
                
                <button onClick={handleImportCsv} disabled={!csvContent}>Import CSV</button>
                {selectedFile && <p>Selected file: {selectedFile.name}</p>}
            </div>
            */}
            


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
                                name="date" // Important for the onChange hanlder
                                value={editFormData?.date || ''}  // Bind value to editForm state
                                onChange={handleEditInputChange}    // Call hanlder when input changes
                                required
                            />
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
                                step="0.1"
                            />
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
                                step="0.1"
                            />
                        </div>
                        
                        {/* Submit button for the edit form */}
                        <button type="submit" /* Optional: Add laoding state here */>Save Changes</button>

                    </form>
                    {/* The Cancel button to exit edit mode */}
                    <button onClick={() => setIsEditing(false)}>Cancel</button>

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
                                    let bodyFatPercentage = typeof entry.bodyFat === 'number' ? entry.bodyFat : parseFloat(entry.bodyFat);

                                    // Calculate Fat Mass and Lean Mass in the entry's original unit
                                    const fatMassOriginalUnit = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage)) ? (weight * (bodyFatPercentage / 100)) : NaN;
                                    const leanMassOriginalUnit = (typeof weight === 'number' && !isNaN(weight) && typeof bodyFatPercentage === 'number' && !isNaN(bodyFatPercentage)) ? (weight - fatMassOriginalUnit) : NaN;

                                    // Apply conversion for display in table based on the current weightUnit state
                                    let weightDisplay = weight;
                                    let fatMassTableDisplay = fatMassOriginalUnit;
                                    let leanMassTableDisplay = leanMassOriginalUnit;
                                    
                                    // Perform the conversion if the entry's unit is different from the current unit state
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
                    {/* Show message if no entries logged and graph is not shown */}
                    {!fetchLoading && !fetchError && entries.length === 0 && <p>Log entries to see your progress graph.</p>}
                </>
                // --- End Historical Data Section ---
            )}
            {/* --- Conditional Rendering Ends Here --- */}
        </div>
    );
};

export default BodyMetricsDashboard;