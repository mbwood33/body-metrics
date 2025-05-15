// src/hooks/useCsvImport.js

import { useState } from 'react';
import Papa from 'papaparse';
// Import the service function needed for saving imported data
import { addBodyMetricsEntry } from '../services/bodyMetricsService';

/**
 * Custom React hook for handling CSV import functionality.
 * Encapsulates state and logic related to file selection, parsing, mapping, and importing.
 *
 * @param {string} userId - The ID of the current user, needed for saving entries via the service.
 * @param {function} onImportSuccess - Callback function to run after a successful import (e.g., to re-fetch entries).
 * @returns {Object} An object containing state variables and handler functions for the component to use.
 */
const useCsvImport = (userId, onImportSuccess) => {
    // State for CSV Import process
    const [selectedFile, setSelectedFile] = useState(null);
    const [csvContent, setCsvContent] = useState(null); // Stores the raw text content
    const [parsedCsvData, setParsedCsvData] = useState(null); // Stores the array of row objects from PapaParse

    // State for CSV Column Mapping
    const [csvHeaders, setCsvHeaders] = useState([]); // Stores the headers extracted from the CSV file
    const [columnMapping, setColumnMapping] = useState({ // Stores the user's selections for column mapping
        date: '',
        weight: '',
        bodyFat: '',
        unit: 'lbs', // Default unit for imported data, user can change
    });

    // States for CSV Import process feedback
    const [importError, setImportError] = useState('');
    const [importMessage, setImportMessage] = useState('');
    const [isParsing, setIsParsing] = useState(false); // State to indicate if parsing is in progress

    // Helper function to clear all import-related states and reset the UI
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


    // Function to handle file selection and read its content
    const handleFileSelect = (event) => {
        const file = event.target.files[0];

        // Clear previous states related to import when a new file is selected
        clearImportState(); // Use the helper to reset all states


        if (file && file.type === 'text/csv') {
            setSelectedFile(file); // Store the file object

            const reader = new FileReader(); // Create a FileReader instance

            // Define what happens when the file is successfully read
            reader.onload = (e) => {
                const content = e.target.result; // Get the file content (as a string)
                setCsvContent(content); // Store raw content

                setIsParsing(true); // Set parsing loading state
                parseCsv(content); // Call the parsing function with the content
            };

            // Define what happens if there's an error reading the file
            reader.onerror = (error) => {
                console.error('Error reading file:', error);
                setImportError('Failed to read file.');
                setSelectedFile(null);
                setCsvContent(null);
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


    // Function to handle confirming column mapping (placeholder - can add validation/preview here)
    const handleConfirmMapping = () => {
        // Check if required fields are selected
        if (!columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat) {
            setImportError('Please select columns for Date, Weight, and Body Fat.');
            return;
        }
        console.log('Mapping confirmed:', columnMapping);
        setImportMessage('Mapping confirmed. Ready to import.'); // Update message
        setImportError(''); // Clear errors
        // At this point, the UI changes automatically based on columnMapping state being valid
    };


    // Function to handle the final Import Mapped Data button click (saving logic goes here)
    const handleImportCsv = async () => {
        // Basic check if data is parsed and mapping is complete
        if (!parsedCsvData || !columnMapping.date || !columnMapping.weight || !columnMapping.bodyFat) {
            setImportError('Cannot import: data not parsed or columns not fully mapped.');
            return;
        }
        if (!userId) {
            setImportError('Cannot import: User not logged in.');
            console.error('handleImportCsv: User ID missing.');
            return;
        }

        console.log('Attempting to import data with mapping:', columnMapping);
        setImportMessage('Importing data...'); // Update message
        setImportError(''); // Clear errors
        // Optional: Add loading state for the import button (e.g., setIsImporting(true))

        const entriesToSave = [];
        const failedEntries = []; // To track rows that couldn't be saved

        // Iterate through parsed data and prepare entries
        for (const row of parsedCsvData) {
            // Use the column mapping to get the correct value from the row
            // Ensure the column name exists in the row object before accessing
            const dateValue = row[columnMapping.date];
            const weightValue = row[columnMapping.weight];
            const bodyFatValue = row[columnMapping.bodyFat];
            const unitValue = columnMapping.unit; // Get unit from mapping state

            // --- Data Validation and Preparation ---
            let parsedDate = null;
            if (dateValue) {
                // Attempt to parse the date string - PapaParse reads everything as strings
                // Common formats areYYYY-MM-DD, MM/DD/YYYY, etc. You might need more robust parsing here.
                // For simplicity, let's try parsing directly or using a library like date-fns parse
                // Example basic parsing forYYYY-MM-DD or MM/DD/YYYY
                try {
                    // Try parsing asYYYY-MM-DD first
                    const [y, m, d] = dateValue.split('-').map(Number);
                    let dateObj = new Date(y, m - 1, d); // Month is 0-indexed
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
                    weightUnit: unitValue, // Use the unit from the mapping state
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
            // setIsImporting(false);
            return;
        }

        console.log(`Attempting to save ${entriesToSave.length} valid entries...`);

        // --- Save Entries to Firestore using the service ---
        try {
            // TODO: Implement batching for large imports in the service
            for (const entryData of entriesToSave) {
                // Call the service function to add each entry
                await addBodyMetricsEntry(userId, entryData);
            }

            const successCount = entriesToSave.length;
            const failCount = failedEntries.length;
            const totalCount = parsedCsvData.length;

            let finalMessage = `Import complete! Successfully imported ${successCount} out of ${totalCount} rows.`;
            if (failCount > 0) {
                finalMessage += ` ${failCount} rows were skipped due to validation errors.`;
                console.warn('Skipped rows during import:', failedEntries);
                setImportError(`Validation errors occurred for ${failCount} rows. Check console for details.`);
            } else {
                setImportError(''); // Clear any previous error if all were successful
            }

            setImportMessage(finalMessage);
            console.log('Import successful.');

            // Call the success callback provided by the component
            if (onImportSuccess && typeof onImportSuccess === 'function') {
                onImportSuccess();
            }

            // Optional: Clear import state after successful import
            // setTimeout(() => { clearImportState(); }, 3000); // Clear after 3 seconds

        } catch (error) {
            console.error('Error saving imported entries to Firestore:', error);
            setImportError(error.message); // Use the error message from the service
            setImportMessage(''); // Clear success message on error
        }
        // Optional: setIsImporting(false); // Reset loading state
    };

    // Return state variables and handlers needed by the component
    return {
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
    };
};

export default useCsvImport;