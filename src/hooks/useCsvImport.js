// src/hooks/useCsvImport.js

import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
// Import the service function needed for saving imported data
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
// import { addBodyMetricsEntry } from '../services/bodyMetricsService';

// Helper function to get today's date inYYYY-MM-DD format (useful for default values if needed)
const getTodaysDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Custom React hook for handling CSV import functionality.
 * Encapsulates state and logic related to file selection, parsing, mapping, and importing.
 *
 * @param {string} userId - The ID of the current user, needed for saving entries via the service.
 * @param {function} onImportSuccess - Callback function to run after a successful import (e.g., to re-fetch entries).
 * @returns {Object} An object containing state variables and handler functions for the component to use.
 */
const useCsvImport = (userId, onImportComplete) => {
    // State for CSV Import process
    const [selectedFile, setSelectedFile] = useState(null);
    const [parsedCsvData, setParsedCsvData] = useState(null);
    const [csvHeaders, setCsvHeaders] = useState([]);
    const [columnMapping, setColumnMapping] = useState({
        date: '',
        weight: '',
        bodyFat: '',
        unit: 'lbs', // Default unit for imported data
    });
    const [importError, setImportError] = useState('');
    const [importMessage, setImportMessage] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false); // State for the Firestore saving process

    const onImportCompleteRef = useRef(null);

    // Use a useRef to store the onImportComplete callback, initialized with null
    // Initialize with null to avoid ReferenceError if onImportComplete is undefined initially
    useEffect(() => {
        onImportCompleteRef.current = onImportComplete;
    }, [onImportComplete]);

    // Step 1: Handle file selection and initiate parsing
    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
            setImportError(''); // Clear previous errors
            setImportMessage('Parsing file...');
            setIsParsing(true); // Start parsing loading state

            // Use PapaParse to parse the CSV file
            Papa.parse(file, {
                header: true, // Treat the first row as headers
                skipEmptyLines: true,
                complete: (results) => {
                    console.log('PapaParse results:', results);
                    if (results.errors.length > 0) {
                        console.error('PapaParse errors:', results.errors);
                        setImportError(`Error parsing CSV: ${results.errors[0].message}`);
                        setImportMessage('');
                        setParsedCsvData(null);
                        setCsvHeaders([]);
                    } else if (results.data.length === 0) {
                        setImportError('CSV file is empty or contains no data rows after headers.');
                        setImportMessage('');
                        setParsedCsvData(null);
                        setCsvHeaders([]);
                    }
                    else {
                        // Filter out rows that are just headers repeated in the data
                        const filteredData = results.data.filter(row =>
                            Object.values(row).some(value => value !== results.meta.fields[0]) // Check if at least one value is not the first header
                        );

                        setParsedCsvData(filteredData);
                        setCsvHeaders(results.meta.fields || []); // Get headers
                        console.log('CSV Parsed successfully. Number of rows:', filteredData.length, 'Headers:', results.meta.fields);
                        setImportMessage('CSV parsed successfully. Please map columns.');
                        setImportError(''); // Clear any previous parsing errors
                    }
                    setIsParsing(false); // End parsing loading state
                },
                error: (error) => {
                    console.error('PapaParse error:', error);
                    setImportError(`Error reading file: ${error.message}`);
                    setImportMessage('');
                    setIsParsing(false);
                }
            });
        } else {
            clearImportState(); // Clear state if no file is selected
        }
    };

    // Step 2: Confirm column mapping (This function is called by the component)
    const handleConfirmMapping = () => {
        // Basic check if required columns are mapped
        if (columnMapping.date && columnMapping.weight && columnMapping.bodyFat) {
            setImportMessage('Column mapping confirmed. Ready to import data.');
            setImportError('');
            // The component will now render the "Ready to Import" section
        } else {
            setImportError('Please map all required columns (Date, Weight, Body Fat).');
            setImportMessage('');
        }
    };

    // Step 3: Handle the actual data import to Firestore
    const handleImportCsv = async () => {
        if (!userId) {
            setImportError('User not logged in. Cannot import data.');
            return;
        }
        if (!parsedCsvData || parsedCsvData.length === 0) {
            setImportError('No data to import.');
            return;
        }
         if (!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat) {
            setImportError('Column mapping is incomplete.');
            return;
         }

        setImportError('');
        setImportMessage('Importing data...');
        setIsImporting(true); // Start importing loading state

        // Corrected Firestore collection path to 'bodyMetricsEntries'
        const metricsCollectionRef = collection(db, `users/${userId}/bodyMetricsEntries`);
        let successfulImports = 0;
        let failedImports = 0;

        for (const row of parsedCsvData) {
            const dateString = row[columnMapping.date];
            const weightString = row[columnMapping.weight];
            const bodyFatString = row[columnMapping.bodyFat];

            // --- Robust Date Parsing (Handling MM/DD/YYYY andYYYY-MM-DD) ---
            let entryDate = new Date('Invalid Date'); // Initialize as invalid

            if (dateString) {
                // Attempt to parse as MM/DD/YYYY
                const dateParts = dateString.split('/').map(Number);
                if (dateParts.length === 3 && !isNaN(dateParts[0]) && !isNaN(dateParts[1]) && !isNaN(dateParts[2])) {
                // Note: Month is 0-indexed in JS Date, so subtract 1 from the month part
                entryDate = new Date(dateParts[2], dateParts[0] - 1, dateParts[1]);
                } else {
                // If MM/DD/YYYY parsing failed, attemptYYYY-MM-DD
                    const yearMonthDayParts = dateString.split('-').map(Number);
                    if (yearMonthDayParts.length === 3 && !isNaN(yearMonthDayParts[0]) && !isNaN(yearMonthDayParts[1]) && !isNaN(yearMonthDayParts[2])) {
                        entryDate = new Date(yearMonthDayParts[0], yearMonthDayParts[1] - 1, yearMonthDayParts[2]);
                    }
                }
            }
            // --- End Robust Date Parsing ---


            const weight = parseFloat(weightString);
            const bodyFat = parseFloat(bodyFatString);

            // Validate parsed data
            if (isNaN(entryDate.getTime()) || isNaN(weight) || isNaN(bodyFat) || bodyFat < 0 || bodyFat > 100) {
                console.warn('CSV Import: Skipping row due to invalid data:', row);
                failedImports++;
                continue; // Skip this row if data is invalid
            }

            try {
                const entryData = {
                    date: entryDate, // Save the correctly parsed Date object
                    weight: weight,
                    bodyFat: bodyFat,
                    weightUnit: columnMapping.unit, // Use the unit specified in mapping
                    createdAt: serverTimestamp(), // Add server timestamp
                };
                await addDoc(metricsCollectionRef, entryData);
                successfulImports++;
            } catch (error) {
                console.error('CSV Import: Error adding document for row:', row, error);
                failedImports++;
                // Continue with the next row even if one fails
            }
        }

        setIsImporting(false); // End importing loading state

        if (successfulImports > 0) {
            setImportMessage(`Import complete: ${successfulImports} entries added, ${failedImports} failed.`);
            setImportError(failedImports > 0 ? `Some entries failed to import. Check console for details.` : '');

            // Call the callback function using the ref
            // Check if the ref's current value is a function before calling
            if (typeof onImportCompleteRef.current === 'function') {
                onImportCompleteRef.current();
            } else {
                console.warn("CSV Import: onImportComplete callback was not a function when trying to call.");
            }


            // Optional: Clear the import state after a delay
            setTimeout(clearImportState, 5000); // Clear after 5 seconds
        } else {
            setImportError(`Import failed: No entries were added. ${failedImports} rows had invalid data.`);
            setImportMessage('');
            // Do not clear state automatically on complete failure
        }
    };


    /*
    // Function to parse the CSV content using PapaParse
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
    */

    // Function to clear all import-related state
    const clearImportState = () => {
        setSelectedFile(null);
        setParsedCsvData(null);
        setCsvHeaders([]);
        setColumnMapping({ date: '', weight: '', bodyFat: '', unit: 'lbs' });
        setImportError('');
        setImportMessage('');
        setIsParsing(false);
        setIsImporting(false);
    };

    return {
        selectedFile,
        parsedCsvData,
        csvHeaders,
        columnMapping,
        importError,
        importMessage,
        isParsing,
        isImporting, // Expose importing loading state
        setColumnMapping, // Expose setter for the component to update mapping
        handleFileSelect,
        handleConfirmMapping,
        handleImportCsv,
        clearImportState,
    };
};

export default useCsvImport;